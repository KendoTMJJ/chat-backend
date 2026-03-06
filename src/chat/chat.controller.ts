// src/chat/chat.controller.ts
import {
  Body,
  Controller,
  Post,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Post('bot-reply')
  async botReply(
    @Body()
    body: {
      chatSessionId: string;
      message: string;
      resolved: boolean;
      context?: 'posgrados' | 'mesa_ayuda';
    },
    @Headers('x-api-key') apiKey: string,
  ) {
    if (apiKey !== String(process.env.N8N_API_KEY)) {
      throw new UnauthorizedException();
    }

    await this.chatGateway.handleBotReply(body);

    return { ok: true };
  }
}
