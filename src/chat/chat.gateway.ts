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
 * 'none'            → flujo normal, sin escalado en curso
 * 'awaiting_reason' → el gateway preguntó el motivo, esperando respuesta del usuario
 * 'done'            → ya se escaló, no volver a escalar en esta sesión
 */
type EscalationState = 'none' | 'awaiting_reason' | 'done';

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

  // ── Contexto elegido por el usuario en la pantalla de bienvenida ──────
  context: ChatContext | null;

  // ── Escalado ──────────────────────────────────────────────────────────
  escalationState: EscalationState;
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
    };

    this.sessions.set(tabId, session);
    return session;
  }

  /**
   * Emite un mensaje del bot al room de la sesión y lo registra en el
   * historial efímero (o en BD si la sesión ya persiste).
   */
  private async emitBotMessage(session: SessionState, message: string) {
    const payload = {
      userId: 'bot',
      name: 'Asistente Virtual',
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
   * Inicia el flujo de escalado.
   * Llamado desde dos caminos:
   *   A) n8n envía resolved: false  → handleBotReply
   *   B) Usuario toca el botón      → handleMessage (optionId: 'escalate')
   *
   * n8n genera y envía el texto "describe tu problema" por /chat/bot-reply.
   */
  private async startEscalationFlow(session: SessionState) {
    if (session.escalationState === 'done') return;

    session.escalationState = 'awaiting_reason';

    // Señal al front para que ajuste su estado (deshabilitar chips, etc.)
    this.server.to(session.chatSessionId).emit('show-escalate-button', {});

    // n8n genera y envía el texto "describe tu problema" por /chat/bot-reply
    await this.n8nService.notifyEscalation('escalation_start', {
      chatSessionId: session.chatSessionId,
      userId: session.userId,
      conversationId: session.conversationId,
      context: session.context ?? undefined,
    });
  }

  /**
   * Recibe el motivo del usuario, persiste en BD, lee los canales de contacto
   * desde SupportChannels y emite la confirmación directamente al usuario.
   */
  private async handleEscalationReason(session: SessionState, reason: string) {
    session.escalationState = 'done';

    try {
      const conversation = await this.chatService.escalateConversation(
        session.userId,
        reason.trim(),
        session.history,
        session.conversationId,
      );

      session.persisting = true;
      session.conversationId = conversation.codConversation;

      // Unir todos los sockets al room persistido
      for (const socketId of session.sockets) {
        const s = this.server.sockets.sockets.get(socketId);
        if (s) s.join(conversation.codConversation);
      }

      // Señal al front: conversación escalada y guardada en BD
      this.server.to(session.chatSessionId).emit('chat-escalated', {
        conversationId: conversation.codConversation,
      });

      // Leer canales desde BD — filtra por contexto de la sesión
      const ctx = (session.context ?? 'posgrados') as ChannelContext;
      const allChannels =
        await this.supportChannelsService.showSupportChannels();
      const channel = allChannels.find((c) => c.context === ctx);

      const whatsapp = channel?.whatsapp ?? '+57 300 000 0000';
      const email = channel?.email ?? 'soporte@usta.edu.co';
      const label =
        ctx === ChannelContext.MESA_AYUDA ? 'Mesa de Ayuda' : 'Posgrados';
      const verb = ctx === ChannelContext.MESA_AYUDA ? 'solicitud' : 'consulta';

      await this.emitBotMessage(
        session,
        `✅ **Tu ${verb} ha sido registrada.**\n\n` +
          `Un asesor de **${label}** revisará tu caso a la brevedad.\n\n` +
          `📱 **WhatsApp:** ${whatsapp}\n` +
          `📧 **Correo:** ${email}\n\n` +
          `_Menciona tu ${verb} al contactarnos para una atención más rápida._`,
      );

      // Notificar a n8n — disponible para integraciones externas (CRM, email, etc.)
      await this.n8nService.notifyEscalation('escalation_done', {
        chatSessionId: session.chatSessionId,
        userId: session.userId,
        conversationId: conversation.codConversation,
        context: session.context ?? undefined,
        reason: reason.trim(),
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

    if (!userId || !tabId) {
      socket.emit('session-error', {
        message:
          'Falta userId o tabId. Refresca la página o verifica el cliente.',
      });
      socket.disconnect(true);
      return;
    }

    const session = this.getOrCreateSession(tabId, userId);

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
        name: 'Asistente Virtual',
        sender: 'bot',
        message: 'Hola 👋 ¿En qué puedo ayudarte?',
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

    // Registrar context en sesión la primera vez que llega
    if (context && !session.context) {
      session.context = context;
    }

    // Ignorar el mensaje interno de selección de contexto:
    // solo sirve para registrar el context en sesión, no va al historial ni a n8n.
    if (message.startsWith('context_selected:')) return;

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

    // ── Camino B: usuario toca el botón "Hablar con un asesor" ──────────
    if (meta?.optionId === 'escalate') {
      await this.startEscalationFlow(session);
      return;
    }

    // ── Flujo de escalado en curso: recoger motivo del usuario ───────────
    if (session.escalationState === 'awaiting_reason') {
      await this.handleEscalationReason(session, message);
      return;
    }

    // ── Flujo normal: delegar a n8n ──────────────────────────────────────
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

    // Emitir la respuesta del bot al cliente
    await this.emitBotMessage(session, message);

    // ── Camino A: n8n determinó que la consulta NO fue resuelta ──────────
    if (!resolved && session.escalationState === 'none') {
      await this.startEscalationFlow(session);
    }
  }
}
