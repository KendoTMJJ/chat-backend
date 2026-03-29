// src/chat/chat.gateway.ts
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { ChatService } from './chat.service';
import { N8nService } from './n8n/n8n.service';
import { SupportChannelsService } from '../support-channels/support-channels.service';
import { ChannelContext } from '../support-channels/entities/supportChannel';
import {
  CONTEXT_SELECTED_PREFIX,
  DEFAULT_WHATSAPP,
  DEFAULT_EMAIL,
  WELCOME_BOT_NAME,
} from './constants/chat.constants';

type ChatContext = 'posgrados' | 'mesa_ayuda';

type IncomingClientMessage =
  | string
  | {
      message: string;
      context?: ChatContext;
      meta?: {
        source?: 'text' | 'quick_reply';
        optionId?: string;
      };
    };

/**
 * Estados del flujo de escalado en una sesión:
 *
 * 'none'             → flujo normal, sin escalado en curso
 * 'pending'          → se emitió show-escalate-button, esperando decisión del usuario
 * 'awaiting_nombre'  → usuario confirmó escalar, esperando que escriba su nombre
 * 'awaiting_correo'  → nombre recibido, esperando correo
 * 'awaiting_reason'  → nombre y correo recibidos, esperando motivo/descripción
 * 'done'             → ya se escaló, no volver a escalar en esta sesión
 */
type EscalationState =
  | 'none'
  | 'pending'
  | 'awaiting_nombre'
  | 'awaiting_correo'
  | 'awaiting_reason'
  | 'done';

type SessionState = {
  firstUserMessageSeen: boolean;
  tabId: string;
  userId: string;
  chatSessionId: string;
  lastSeenAt: number;
  welcomeSent: boolean;
  sockets: Set<string>;
  expired: boolean;
  persisting: boolean;
  conversationId: string | null;
  history: Array<{ userId: string; sender: 'user' | 'bot'; message: string }>;
  idleTimer?: NodeJS.Timeout;

  context: ChatContext | null;

  // ── Escalado ──────────────────────────────────────────────────────────
  escalationState: EscalationState;
  escalationNombre: string | null;
  escalationCorreo: string | null;
};

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly n8nService: N8nService,
    private readonly supportChannelsService: SupportChannelsService,
  ) {}

  private sessions = new Map<string, SessionState>();

  private readonly IDLE_MS = 5 * 60 * 1000;
  private readonly RECONNECT_GRACE_MS = 15_000;

  private now() {
    return Date.now();
  }

  private buildWelcomeMessage(context?: ChatContext | null): string {
    if (context === 'posgrados') {
      return (
        '👋 Hola, soy el **Asistente de Posgrados Santo Tomás Tunja**.\n\n' +
        'Puedo ayudarte con:\n' +
        '- 🎓 Programas de maestría, especialización y doctorado\n' +
        '- 📋 Duración, costos, créditos y modalidad\n' +
        '- 📚 Malla curricular, electivas y opciones de grado\n' +
        '- 📝 Requisitos e inscripción\n\n' +
        'Escribe el nombre del programa que te interesa o hazme tu pregunta 😊'
      );
    }
    if (context === 'mesa_ayuda') {
      return (
        '👋 Hola, soy el **Asistente de Mesa de Ayuda Santo Tomás Tunja**.\n\n' +
        'Puedo ayudarte con:\n' +
        '- 🖥️ Soporte técnico de sistemas y plataformas universitarias\n' +
        '- 📄 Trámites académicos y administrativos\n' +
        '- 🔑 Acceso a servicios universitarios\n\n' +
        'Describe tu problema o consulta y te orientaré 😊'
      );
    }
    return (
      '👋 Hola, soy el **Asistente Virtual Santo Tomás Tunja**.\n\n' +
      'Puedo ayudarte con información académica y soporte universitario.\n' +
      '¿En qué puedo ayudarte hoy? 😊'
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers internos
  // ──────────────────────────────────────────────────────────────────────

  private touchSession(session: SessionState) {
    session.lastSeenAt = this.now();
    if (session.idleTimer) clearTimeout(session.idleTimer);

    session.idleTimer = setTimeout(async () => {
      session.expired = true;
      for (const socketId of session.sockets) {
        const s = this.server.sockets.sockets.get(socketId);
        if (s) {
          s.emit('session-expired', {
            reason: 'inactivity',
            message:
              'Sesión finalizada por inactividad. Por favor refresca la página para iniciar un nuevo chat.',
          });
          s.disconnect(true);
        }
      }
      this.sessions.delete(session.tabId);
    }, this.IDLE_MS);
  }

  private normalizeIncoming(body: IncomingClientMessage) {
    if (typeof body === 'string') {
      return {
        message: body,
        context: null as ChatContext | null,
        meta: { source: 'text' as const },
      };
    }
    return {
      message: body?.message ?? '',
      context: body?.context ?? null,
      meta: body?.meta ?? { source: 'text' as const },
    };
  }

  private getOrCreateSession(tabId: string, userId: string): SessionState {
    const existing = this.sessions.get(tabId);

    if (existing && !existing.expired) {
      if (this.now() - existing.lastSeenAt > this.IDLE_MS) {
        existing.expired = true;
        this.sessions.delete(tabId);
      } else {
        return existing;
      }
    }

    const session: SessionState = {
      firstUserMessageSeen: false,
      tabId,
      userId,
      chatSessionId: randomUUID(),
      lastSeenAt: this.now(),
      sockets: new Set(),
      expired: false,
      welcomeSent: false,
      persisting: false,
      conversationId: null,
      history: [],
      context: null,
      escalationState: 'none',
      escalationNombre: null,
      escalationCorreo: null,
    };

    this.sessions.set(tabId, session);
    return session;
  }

  private async emitBotMessage(session: SessionState, message: string) {
    const payload = {
      userId: 'bot',
      name: WELCOME_BOT_NAME,
      sender: 'bot' as const,
      message,
      conversationId: session.conversationId ?? null,
    };

    if (session.persisting && session.conversationId) {
      await this.chatService.saveMessage(
        session.conversationId,
        'bot',
        'bot',
        message,
      );
      this.server.to(session.conversationId).emit('on-message', payload);
    } else {
      session.history.push({ userId: 'bot', sender: 'bot', message });
      this.server.to(session.chatSessionId).emit('on-message', payload);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Flujo de escalado
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Paso 0: n8n detectó resolved:false o usuario tocó el botón.
   * Pregunta al usuario si desea hablar con un asesor.
   */
  private async startEscalationFlow(session: SessionState) {
    if (session.escalationState === 'done') return;
    if (session.escalationState !== 'none') return;

    session.escalationState = 'pending';

    // Señal al front para mostrar el botón / chips de sí/no
    this.server.to(session.chatSessionId).emit('show-escalate-button', {});

    // El gateway envía el mensaje directamente — no necesita pasar por n8n
    await this.emitBotMessage(
      session,
      'No pude resolver tu consulta con certeza. ¿Te gustaría que te compartamos los canales de contacto directo?',
    );
  }

  /**
   * Paso 1: usuario confirmó que sí quiere escalar.
   * Pide el nombre.
   */
  private async handleEscalationConfirmed(session: SessionState) {
    session.escalationState = 'awaiting_nombre';
    await this.emitBotMessage(session, '¿Cuál es tu nombre completo?');
  }

  /**
   * Paso 2: usuario rechazó escalar.
   * Volver al flujo normal.
   */
  private async handleEscalationDeclined(session: SessionState) {
    session.escalationState = 'none';
    session.escalationNombre = null;
    session.escalationCorreo = null;

    // Notificar a n8n para que restaure el contexto de la sesión (active_snies)
    void this.n8nService.notifyEscalation('escalation_declined', {
      chatSessionId: session.chatSessionId,
      userId: session.userId,
      context: session.context ?? undefined,
    });

    await this.emitBotMessage(
      session,
      'Entendido. Puedes seguir preguntándome lo que necesites. 😊',
    );
  }

  /**
   * Paso 3: recibe nombre → pide correo.
   */
  private async handleEscalationNombre(session: SessionState, nombre: string) {
    session.escalationNombre = nombre.trim();
    session.escalationState = 'awaiting_correo';
    await this.emitBotMessage(
      session,
      `Gracias, ${session.escalationNombre}. ¿Cuál es tu correo electrónico?`,
    );
  }

  /**
   * Paso 4: recibe correo → pide motivo/descripción.
   */
  private async handleEscalationCorreo(session: SessionState, correo: string) {
    session.escalationCorreo = correo.trim();
    session.escalationState = 'awaiting_reason';
    await this.emitBotMessage(
      session,
      'Por último, describe brevemente tu consulta o el motivo de tu contacto.',
    );
  }

  /**
   * Paso 5: recibe motivo → persiste en BD y envía confirmación.
   */
  private async handleEscalationReason(session: SessionState, reason: string) {
    session.escalationState = 'done';

    try {
      const conversation = await this.chatService.escalateConversation(
        session.userId,
        reason.trim(),
        session.history,
        session.conversationId,
        session.escalationNombre ?? undefined,
        session.escalationCorreo ?? undefined,
      );

      session.persisting = true;
      session.conversationId = conversation.codConversation;

      for (const socketId of session.sockets) {
        const s = this.server.sockets.sockets.get(socketId);
        if (s) s.join(conversation.codConversation);
      }

      this.server.to(session.chatSessionId).emit('chat-escalated', {
        conversationId: conversation.codConversation,
      });

      const ctx = (session.context ?? 'posgrados') as ChannelContext;
      const allChannels =
        await this.supportChannelsService.showSupportChannels();
      const channel = allChannels.find((c) => c.context === ctx);

      const whatsapp = channel?.whatsapp ?? DEFAULT_WHATSAPP;
      const email = channel?.email ?? DEFAULT_EMAIL;
      const label =
        ctx === ChannelContext.MESA_AYUDA ? 'Mesa de Ayuda' : 'Posgrados';
      const verb = ctx === ChannelContext.MESA_AYUDA ? 'solicitud' : 'consulta';

      await this.emitBotMessage(
        session,
        `✅ **Tu ${verb} ha sido registrada.**\n\n` +
          `Aquí tienes los canales de atención directa de **${label}**:\n\n` +
          `📱 **WhatsApp:** ${whatsapp}\n` +
          `📧 **Correo:** ${email}\n\n` +
          `_Menciona tu ${verb} al contactarnos para una atención más rápida._`,
      );

      await this.n8nService.notifyEscalation('escalation_done', {
        chatSessionId: session.chatSessionId,
        userId: session.userId,
        conversationId: conversation.codConversation,
        context: session.context ?? undefined,
        reason: reason.trim(),
        nombre: session.escalationNombre ?? undefined,
        correo: session.escalationCorreo ?? undefined,
      });
    } catch (err) {
      console.error(
        '[handleEscalationReason] Error al escalar:',
        err?.message ?? err,
      );
      session.escalationState = 'none';
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 🔌 Conexión
  // ──────────────────────────────────────────────────────────────────────

  async handleConnection(socket: Socket) {
    const userId = socket.handshake.auth?.userId;
    const tabId = socket.handshake.auth?.tabId;
    const authContext = socket.handshake.auth?.context as
      | ChatContext
      | undefined;

    if (!userId || !tabId) {
      socket.emit('session-error', {
        message:
          'Falta userId o tabId. Refresca la página o verifica el cliente.',
      });
      socket.disconnect(true);
      return;
    }

    const session = this.getOrCreateSession(tabId, userId);

    if (authContext && !session.context) {
      session.context = authContext;
    }

    socket.data.userId = userId;
    socket.data.tabId = tabId;
    socket.data.chatSessionId = session.chatSessionId;
    socket.data.persisting = session.persisting;
    socket.data.conversationId = session.conversationId;
    socket.data.history = session.history;

    session.sockets.add(socket.id);
    socket.join(session.chatSessionId);
    this.touchSession(session);

    socket.emit('chat-session', { chatSessionId: session.chatSessionId });

    if (!session.welcomeSent) {
      session.welcomeSent = true;
      socket.emit('on-message', {
        userId: 'bot',
        name: WELCOME_BOT_NAME,
        sender: 'bot',
        message: this.buildWelcomeMessage(session.context),
        conversationId: session.conversationId ?? null,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 🔌 Desconexión
  // ──────────────────────────────────────────────────────────────────────

  async handleDisconnect(socket: Socket) {
    const tabId = socket.data?.tabId as string | undefined;
    if (!tabId) return;

    const session = this.sessions.get(tabId);
    if (!session) return;

    session.sockets.delete(socket.id);

    if (session.sockets.size === 0 && !session.expired) {
      const lastSeenSnapshot = session.lastSeenAt;
      setTimeout(() => {
        const s = this.sessions.get(tabId);
        if (!s || s.expired) return;
        if (s.sockets.size === 0 && s.lastSeenAt === lastSeenSnapshot) {
          // expira por idleTimer
        }
      }, this.RECONNECT_GRACE_MS);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 💬 Usuario envía mensaje
  // ──────────────────────────────────────────────────────────────────────

  @SubscribeMessage('send-message')
  async handleMessage(
    @MessageBody() body: IncomingClientMessage,
    @ConnectedSocket() client: Socket,
  ) {
    const { message, context, meta } = this.normalizeIncoming(body);
    if (!message?.trim()) return;

    const userId = client.data.userId as string;
    const tabId = client.data.tabId as string;
    const chatSessionId = client.data.chatSessionId as string;

    const session = this.sessions.get(tabId);
    if (!session || session.expired) {
      client.emit('session-expired', {
        reason: 'missing_session',
        message:
          'Tu sesión ya no está activa. Refresca la página para iniciar una nueva.',
      });
      client.disconnect(true);
      return;
    }

    if (context && !session.context) {
      session.context = context;
    }

    if (message.startsWith(CONTEXT_SELECTED_PREFIX)) return;

    const isFirstTurn = !session.firstUserMessageSeen;
    session.firstUserMessageSeen = true;
    this.touchSession(session);

    // Emitir mensaje del usuario al room
    const userPayload = {
      userId,
      name: 'Usuario',
      sender: 'user' as const,
      message,
      conversationId: session.conversationId ?? null,
    };

    if (session.persisting && session.conversationId) {
      const valid = await this.chatService.validateConversation(
        session.conversationId,
      );
      if (!valid) {
        session.persisting = false;
        session.conversationId = null;
        session.history = [];
      } else {
        await this.chatService.saveMessage(
          session.conversationId,
          userId,
          'user',
          message,
        );
        this.server.to(session.conversationId).emit('on-message', userPayload);
      }
    }

    if (!session.persisting) {
      session.history.push({ userId, sender: 'user', message });
      this.server.to(chatSessionId).emit('on-message', userPayload);
    }

    // ── Botón "Hablar con un asesor" (petición directa) ─────────────────
    // El usuario ya expresó su intención — saltar confirmación e ir directo a nombre
    if (meta?.optionId === 'escalate') {
      if (session.escalationState === 'none') {
        session.escalationState = 'pending';
        await this.handleEscalationConfirmed(session);
      }
      return;
    }

    // ── Máquina de estados del escalado ──────────────────────────────────
    const state = session.escalationState;

    // Esperando decisión sí/no
    if (state === 'pending') {
      const msg = message.trim().toLowerCase();
      const confirmed =
        meta?.optionId === 'escalate_yes' ||
        ['si', 'sí', 'yes', 'quiero', 'de acuerdo', 'ok', 'claro'].includes(
          msg,
        );
      const declined =
        meta?.optionId === 'escalate_no' ||
        ['no', 'no gracias', 'nope', 'cancelar'].includes(msg);

      if (confirmed) {
        await this.handleEscalationConfirmed(session);
      } else if (declined) {
        await this.handleEscalationDeclined(session);
      } else {
        // Respuesta ambigua — volver a preguntar
        await this.emitBotMessage(
          session,
          '¿Deseas que te compartamos los canales de contacto directo? Responde **Sí** o **No**.',
        );
      }
      return;
    }

    if (state === 'awaiting_nombre') {
      await this.handleEscalationNombre(session, message);
      return;
    }

    if (state === 'awaiting_correo') {
      await this.handleEscalationCorreo(session, message);
      return;
    }

    if (state === 'awaiting_reason') {
      await this.handleEscalationReason(session, message);
      return;
    }

    // ── Flujo normal: delegar a n8n ───────────────────────────────────────
    await this.n8nService.sendMessage({
      chatSessionId,
      userId,
      message,
      isFirstTurn,
      context: session.context ?? undefined,
      meta,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 🤖 Bot responde (llamado desde ChatController, originado en n8n)
  // ──────────────────────────────────────────────────────────────────────

  async handleBotReply(data: {
    chatSessionId: string;
    message: string;
    resolved: boolean;
    context?: ChatContext;
  }) {
    const { chatSessionId, message, resolved } = data;

    const sockets = await this.server.in(chatSessionId).fetchSockets();
    if (!sockets.length) return;

    const tabId = sockets[0].data.tabId as string;
    const session = this.sessions.get(tabId);
    if (!session || session.expired) return;

    this.touchSession(session);

    await this.emitBotMessage(session, message);

    // Camino A: n8n no resolvió → iniciar flujo de escalado
    if (!resolved && session.escalationState === 'none') {
      await this.startEscalationFlow(session);
    }
  }
}
