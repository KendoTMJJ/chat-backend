import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Message } from 'src/message/message';
import {
  Conversation,
  ConversationStatus,
} from 'src/conversation/conversation';
import { DataSource, Repository } from 'typeorm';

export interface ConversationSummary {
  conversationId: string;
  userId: string;
  status: ConversationStatus;
  title: string | null;
  nombre: string | null;
  correo: string | null;
  startedAt: Date;
  updatedAt: Date;
  lastMessage: string;
}

@Injectable()
export class ChatService {
  private messageRepository: Repository<Message>;
  private conversationRepository: Repository<Conversation>;

  public readonly TIMEOUT_MINUTES = 5;

  constructor(private poolConection: DataSource) {
    this.messageRepository = poolConection.getRepository(Message);
    this.conversationRepository = poolConection.getRepository(Conversation);
  }

  // =============================
  // 🔥 Obtener o crear conversación activa
  // =============================
  async getOrCreateConversation(userId: string): Promise<Conversation> {
    const lastConversation = await this.conversationRepository.findOne({
      where: { userId, status: ConversationStatus.ACTIVE },
      order: { lastActivityAt: 'DESC' },
    });

    if (!lastConversation) {
      return this.createNewConversation(userId);
    }

    const lastActivity =
      lastConversation.lastActivityAt ?? lastConversation.startedAt;
    const now = new Date().getTime();
    const diffMinutes = (now - new Date(lastActivity).getTime()) / (1000 * 60);

    if (diffMinutes > this.TIMEOUT_MINUTES) {
      await this.conversationRepository.update(
        lastConversation.codConversation,
        { status: ConversationStatus.EXPIRED },
      );
      return this.createNewConversation(userId);
    }

    return lastConversation;
  }

  // =============================
  // 🆕 Crear nueva conversación
  // =============================
  async createNewConversation(userId: string): Promise<Conversation> {
    const conversation = this.conversationRepository.create({
      userId,
      status: ConversationStatus.ACTIVE,
      lastActivityAt: new Date(),
    });
    return this.conversationRepository.save(conversation);
  }

  // =============================
  // 📢 Escalar conversación
  // Guarda nombre, correo y motivo. Si la sesión era efímera, la crea
  // y persiste todo el historial en BD.
  // =============================
  async escalateConversation(
    userId: string,
    title: string,
    history: Array<{ userId: string; sender: 'user' | 'bot'; message: string }>,
    existingConversationId?: string | null,
    nombre?: string,
    correo?: string,
  ): Promise<Conversation> {
    let conversation: Conversation;

    if (existingConversationId) {
      const found = await this.conversationRepository.findOne({
        where: { codConversation: existingConversationId },
      });
      conversation = found ?? (await this.createNewConversation(userId));
    } else {
      // Sesión efímera: crear conversación y volcar historial
      conversation = await this.createNewConversation(userId);
      for (const msg of history) {
        await this.saveMessage(
          conversation.codConversation,
          msg.userId,
          msg.sender,
          msg.message,
        );
      }
    }

    await this.conversationRepository.update(conversation.codConversation, {
      title,
      ...(nombre !== undefined && { nombre }),
      ...(correo !== undefined && { correo }),
      status: ConversationStatus.ESCALATED,
      lastActivityAt: new Date(),
    });

    return {
      ...conversation,
      title,
      nombre: nombre ?? null,
      correo: correo ?? null,
      status: ConversationStatus.ESCALATED,
    };
  }

  // =============================
  // 💬 Guardar mensaje
  // =============================
  async saveMessage(
    conversationId: string,
    userId: string,
    sender: 'user' | 'bot',
    message: string,
  ): Promise<Message> {
    try {
      const msg = this.messageRepository.create({
        conversation: { codConversation: conversationId },
        userId,
        sender,
        message,
      });

      const saved = await this.messageRepository.save(msg);

      await this.conversationRepository.update(conversationId, {
        lastActivityAt: new Date(),
      });

      return saved;
    } catch (error) {
      throw new HttpException(
        'Error al guardar el mensaje',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // =============================
  // 📜 Historial
  // =============================
  async getHistory(codConversation: string) {
    return this.messageRepository.find({
      where: { conversation: { codConversation } },
      order: { createAt: 'ASC' },
    });
  }

  // =============================
  // 🔎 Validar conversación activa
  // =============================
  async validateConversation(codConversation: string) {
    const conversation = await this.conversationRepository.findOne({
      where: { codConversation, status: ConversationStatus.ACTIVE },
    });

    if (!conversation) return null;

    const lastActivity = conversation.lastActivityAt ?? conversation.startedAt;
    const now = new Date().getTime();
    const diffMinutes = (now - new Date(lastActivity).getTime()) / (1000 * 60);

    if (diffMinutes > this.TIMEOUT_MINUTES) {
      await this.conversationRepository.update(codConversation, {
        status: ConversationStatus.EXPIRED,
      });
      return null;
    }

    return conversation;
  }

  // =============================
  // 📊 Resumen para Admin
  // =============================
  async getConversationsSummary(): Promise<ConversationSummary[]> {
    const conversations = await this.conversationRepository.find({
      order: { lastActivityAt: 'DESC' },
    });

    const summaries = await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await this.messageRepository.findOne({
          where: {
            conversation: { codConversation: conversation.codConversation },
          },
          order: { createAt: 'DESC' },
        });

        return {
          conversationId: conversation.codConversation,
          userId: conversation.userId,
          status: conversation.status,
          title: conversation.title ?? null,
          nombre: conversation.nombre ?? null,
          correo: conversation.correo ?? null,
          startedAt: conversation.startedAt,
          updatedAt: conversation.lastActivityAt,
          lastMessage: lastMessage?.message || '',
        };
      }),
    );

    return summaries;
  }

  // =============================
  // 🔒 Cerrar conversación
  // =============================
  async closeConversation(conversationId: string) {
    await this.conversationRepository.update(conversationId, {
      status: ConversationStatus.CLOSED,
    });
  }

  async findActiveConversation(userId: string) {
    return this.conversationRepository.findOne({
      where: { userId, status: ConversationStatus.ACTIVE },
      order: { lastActivityAt: 'DESC' },
    });
  }

  // =============================
  // 🗑️ Eliminar conversación y sus mensajes
  // =============================
  async deleteConversation(conversationId: string): Promise<void> {
    await this.messageRepository.delete({
      conversation: { codConversation: conversationId },
    });
    await this.conversationRepository.delete(conversationId);
  }
}
