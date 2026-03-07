import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { N8nService } from './n8n/n8n.service';
import { ChatController } from './chat.controller';
import { SupportChannelsService } from 'src/support-channels/support-channels.service';

@Module({
  providers: [ChatGateway, ChatService, N8nService, SupportChannelsService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
