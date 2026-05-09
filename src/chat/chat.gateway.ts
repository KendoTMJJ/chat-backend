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
import { HelpdeskProxyService } from '../helpdesk/helpdesk-proxy.service';
import { ChannelContext } from '../support-channels/entities/supportChannel';
import {
  CONTEXT_SELECTED_PREFIX,
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
 * 'none'                  → flujo normal, sin escalado en curso
 * 'pending'               → se emitió show-escalate-button o se preguntó Sí/No, esperando decisión del usuario
 * 'awaiting_name'         → usuario confirmó escalar, esperando que escriba su nombre
 * 'awaiting_email'        → nombre recibido, esperando correo
 * 'awaiting_reason'       → nombre y correo recibidos, esperando motivo/descripción
 * 'awaiting_confirmation' → todos los datos recolectados, esperando confirmación del usuario
 * 'done'                  → ya se escaló, no volver a escalar en esta sesión
 */
type EscalationState =
  | 'none'
  | 'pending'
  | 'awaiting_name'
  | 'awaiting_email'
  | 'awaiting_reason'
  | 'awaiting_confirmation'
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
  escalationName: string | null;
  escalationEmail: string | null;
  escalationReason: string | null;

  // Intent activo del helpdesk — se actualiza con cada bot-reply de mesa_ayuda
  helpdeskIntent: string | null;
};

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly n8nService: N8nService,
    private readonly supportChannelsService: SupportChannelsService,
    private readonly helpdeskProxy: HelpdeskProxyService,
  ) {}

  private sessions = new Map<string, SessionState>();

  private readonly IDLE_MS = 5 * 60 * 1000;
  private readonly RECONNECT_GRACE_MS = 15_000;

  private now() {
    return Date.now();
  }

  private async buildWelcomeButtons(context?: ChatContext | null): Promise<
    Array<{
      label: string;
      message?: string;
      url?: string;
      optionId?: string;
    }>
  > {
    if (context === 'posgrados') {
      return [
        {
          label: '🎓 Ver programas',
          message: '¿Qué programas de posgrado ofrecen?',
        },
      ];
    }
    if (context === 'mesa_ayuda') {
      const cats = await this.helpdeskProxy.listPublic();
      return cats.map((cat) => ({
        label: cat.display_label,
        message: cat.display_label,
        optionId: `${cat.intent}:menu`,
      }));
    }
    return [];
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
      escalationName: null,
      escalationEmail: null,
      escalationReason: null,
      helpdeskIntent: null,
    };

    this.sessions.set(tabId, session);
    return session;
  }

  private async emitBotMessage(
    session: SessionState,
    message: string,
    buttons?: Array<{ label: string; message?: string; url?: string }>,
  ) {
    const payload = {
      userId: 'bot',
      name: WELCOME_BOT_NAME,
      sender: 'bot' as const,
      message,
      conversationId: session.conversationId ?? null,
      ...(buttons?.length ? { buttons } : {}),
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
  }

  /**
   * Paso 1: usuario confirmó que sí quiere escalar.
   * Pide el nombre.
   */
  private async handleEscalationConfirmed(session: SessionState) {
    session.escalationState = 'awaiting_name';
    await this.emitBotMessage(
      session,
      'Claro 😊, con gusto te ayudo. Antes de indicarte los canales de comunicación, ¿me puedes compartir tu **nombre completo**?',
    );
  }

  /**
   * Paso 2: usuario rechazó escalar.
   * Volver al flujo normal.
   */
  private async handleEscalationDeclined(session: SessionState) {
    const nameSnapshot = session.escalationName;
    const emailSnapshot = session.escalationEmail;
    const reasonSnapshot = session.escalationReason;

    session.escalationState = 'none';
    session.escalationName = null;
    session.escalationEmail = null;
    session.escalationReason = null;

    // Notificar a n8n para que restaure el contexto de la sesión (active_snies)
    void this.n8nService.notifyEscalation('escalation_declined', {
      chatSessionId: session.chatSessionId,
      userId: session.userId,
      context: session.context ?? undefined,
      name: nameSnapshot ?? undefined,
      email: emailSnapshot ?? undefined,
      reason: reasonSnapshot ?? undefined,
    });

    await this.emitBotMessage(
      session,
      'Entendido. Puedes seguir preguntándome lo que necesites. 😊',
    );
  }

  /**
   * Paso 3: recibe nombre → pide correo.
   */
  private async handleEscalationName(session: SessionState, name: string) {
    const trimmed = name.trim();
    const nameRegex = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s-]*$/;
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (!nameRegex.test(trimmed) || words.length < 2) {
      await this.emitBotMessage(
        session,
        'No reconocí un nombre completo 😊 ¿Puedes escribir tu **nombre y apellido**?',
      );
      return;
    }
    session.escalationName = trimmed;

    // Si email y motivo ya están llenos (edición), volver directo a confirmación
    if (session.escalationEmail && session.escalationReason) {
      session.escalationState = 'awaiting_confirmation';
      this.server.to(session.chatSessionId).emit('show-confirmation', {
        name: session.escalationName,
        email: session.escalationEmail,
        reason: session.escalationReason,
      });
      return;
    }

    session.escalationState = 'awaiting_email';
    await this.emitBotMessage(
      session,
      `Gracias, ${session.escalationName}. ¿Cuál es tu **correo electrónico**?`,
    );
  }

  /**
   * Paso 4: recibe email → pide motivo/descripción.
   */
  private async handleEscalationEmail(session: SessionState, email: string) {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      await this.emitBotMessage(
        session,
        'Ese correo no parece válido 📧 ¿Puedes verificarlo? Ejemplo: tucorreo@gmail.com',
      );
      return;
    }
    session.escalationEmail = trimmed;

    // Si el motivo ya está lleno (edición), volver directo a confirmación
    if (session.escalationReason) {
      session.escalationState = 'awaiting_confirmation';
      this.server.to(session.chatSessionId).emit('show-confirmation', {
        name: session.escalationName,
        email: session.escalationEmail,
        reason: session.escalationReason,
      });
      return;
    }

    session.escalationState = 'awaiting_reason';
    await this.emitBotMessage(
      session,
      'Por último, describe brevemente tu consulta o el motivo de tu contacto.',
    );
  }

  /**
   * Paso 5: recibe motivo → valida y solicita confirmación al usuario.
   */
  private async handleEscalationReason(session: SessionState, reason: string) {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      await this.emitBotMessage(
        session,
        '¿Puedes contarme un poco más sobre tu consulta? 😊',
      );
      return;
    }
    session.escalationReason = trimmed;
    session.escalationState = 'awaiting_confirmation';
    this.server.to(session.chatSessionId).emit('show-confirmation', {
      name: session.escalationName,
      email: session.escalationEmail,
      reason: session.escalationReason,
    });
  }

  /**
   * Paso 6: usuario confirmó datos → persiste en BD y notifica a n8n.
   */
  private async completeEscalation(session: SessionState) {
    session.escalationState = 'done';

    try {
      const conversation = await this.chatService.escalateConversation(
        session.userId,
        session.escalationReason!,
        session.history,
        session.conversationId,
        session.escalationName ?? undefined,
        session.escalationEmail ?? undefined,
        session.context ?? undefined,
      );

      session.persisting = true;
      session.conversationId = conversation.id;

      for (const socketId of session.sockets) {
        const s = this.server.sockets.sockets.get(socketId);
        if (s) s.join(conversation.id);
      }

      this.server.to(session.chatSessionId).emit('chat-escalated', {
        conversationId: conversation.id,
      });

      const ctx = (session.context ?? 'posgrados') as ChannelContext;
      const intent =
        ctx === ChannelContext.MESA_AYUDA ? session.helpdeskIntent : null;

      const channel = await this.supportChannelsService.findByContextAndIntent(
        ctx,
        intent,
      );

      const label =
        ctx === ChannelContext.MESA_AYUDA ? 'Mesa de Ayuda' : 'Posgrados';
      const verb = ctx === ChannelContext.MESA_AYUDA ? 'solicitud' : 'consulta';

      const contactLines: string[] = [];
      if (channel?.whatsapp) contactLines.push(`📱 **WhatsApp:** ${channel.whatsapp}`);
      if (channel?.email) contactLines.push(`📧 **Correo:** ${channel.email}`);

      const contactBlock = contactLines.length
        ? `\n\n${contactLines.join('\n')}`
        : '';

      await this.emitBotMessage(
        session,
        `✅ **Tu ${verb} ha sido registrada.**\n\nUn agente de **${label}** te atenderá pronto.${contactBlock}`,
      );

      await this.n8nService.notifyEscalation('escalation_done', {
        chatSessionId: session.chatSessionId,
        userId: session.userId,
        conversationId: conversation.id,
        context: session.context ?? undefined,
        reason: session.escalationReason!,
        name: session.escalationName ?? undefined,
        email: session.escalationEmail ?? undefined,
        channelWhatsapp: channel?.whatsapp,
        channelEmail: channel?.email,
      });
    } catch (err) {
      console.error(
        '[completeEscalation] Error al escalar:',
        err instanceof Error ? err.message : err,
      );
      session.escalationState = 'none';
    }
  }

  /**
   * Paso 6b: maneja la respuesta del usuario en la pantalla de confirmación.
   */
  private async handleEscalationConfirmation(
    session: SessionState,
    optionId: string | undefined,
  ) {
    if (optionId === 'confirm') {
      await this.completeEscalation(session);
    } else if (optionId === 'edit_name') {
      session.escalationState = 'awaiting_name';
      await this.emitBotMessage(session, '¿Cuál es tu nombre completo?');
    } else if (optionId === 'edit_email') {
      session.escalationState = 'awaiting_email';
      await this.emitBotMessage(session, '¿Cuál es tu correo electrónico?');
    } else if (optionId === 'edit_reason') {
      session.escalationState = 'awaiting_reason';
      await this.emitBotMessage(session, '¿Cuál es el motivo de tu consulta?');
    } else if (optionId === 'cancel') {
      await this.handleEscalationDeclined(session);
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
      const welcomeButtons = await this.buildWelcomeButtons(session.context);
      socket.emit('on-message', {
        userId: 'bot',
        name: WELCOME_BOT_NAME,
        sender: 'bot',
        message: this.buildWelcomeMessage(session.context),
        conversationId: session.conversationId ?? null,
        ...(welcomeButtons.length ? { buttons: welcomeButtons } : {}),
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

    if (message === '__show_menu__') {
      await this.emitBotMessage(
        session,
        this.buildWelcomeMessage(session.context),
        await this.buildWelcomeButtons(session.context),
      );
      return;
    }

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

    if (state === 'awaiting_name') {
      await this.handleEscalationName(session, message);
      return;
    }

    if (state === 'awaiting_email') {
      await this.handleEscalationEmail(session, message);
      return;
    }

    if (state === 'awaiting_reason') {
      await this.handleEscalationReason(session, message);
      return;
    }

    if (state === 'awaiting_confirmation') {
      await this.handleEscalationConfirmation(session, meta?.optionId);
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
    intent?: string;
    buttons?: Array<{ label: string; message?: string; url?: string }>;
  }) {
    const { chatSessionId, message, resolved, intent, buttons } = data;

    const sockets = await this.server.in(chatSessionId).fetchSockets();
    if (!sockets.length) return;

    const tabId = sockets[0].data.tabId as string;
    const session = this.sessions.get(tabId);
    if (!session || session.expired) return;

    this.touchSession(session);

    // Guardar el intent activo para usarlo en la escalación
    if (intent) session.helpdeskIntent = intent;

    await this.emitBotMessage(session, message, buttons);

    if (session.escalationState !== 'none') return;

    // n8n no resolvió → preguntar si quiere canales de contacto
    if (!resolved) {
      await this.startEscalationFlow(session);
    }
  }
}
