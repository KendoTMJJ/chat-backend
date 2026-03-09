// src/chat/n8n/n8n.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

type ChatContext = 'posgrados' | 'mesa_ayuda';

type N8nMeta = {
  source?: 'text' | 'quick_reply';
  optionId?: string;
};

export type EscalationEvent = 'escalation_start' | 'escalation_done';

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  // Un solo webhook maneja mensajes normales Y eventos de escalado.
  // El Switch Evento en n8n los diferencia por el campo "event".
  private readonly webhookUrl = String(process.env.N8N_WEBHOOK_URL);

  // Mensajes normales del usuario → event implícito: 'message'
  async sendMessage(payload: {
    chatSessionId: string;
    message: string;
    userId: string;
    isFirstTurn?: boolean;
    context?: ChatContext;
    meta?: N8nMeta;
  }) {
    await axios.post(this.webhookUrl, { event: 'message', ...payload });
  }

  // Eventos de escalado → escalation_start | escalation_done
  // Fire-and-forget: si falla se loguea pero el chat no se rompe.
  async notifyEscalation(
    event: EscalationEvent,
    payload: {
      chatSessionId: string;
      userId: string;
      conversationId?: string | null;
      context?: ChatContext;
      reason?: string;
      nombre?: string;
      correo?: string;
    },
  ) {
    try {
      await axios.post(this.webhookUrl, { event, ...payload });
    } catch (err) {
      this.logger.warn(
        `[N8nService] notifyEscalation(${event}) falló: ${err?.message ?? err}`,
      );
    }
  }
}
