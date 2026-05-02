import {
  Body,
  Controller,
  Post,
  Headers,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { BotReplyDto } from './dto/bot-reply.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Post('bot-reply')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async botReply(
    @Body() body: BotReplyDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    if (apiKey !== String(process.env.N8N_API_KEY)) {
      throw new UnauthorizedException();
    }

    await this.chatGateway.handleBotReply(body);

    return { ok: true };
  }
}
