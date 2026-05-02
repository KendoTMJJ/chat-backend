import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { N8nService } from './n8n/n8n.service';
import { ChatController } from './chat.controller';
import { SupportChannelsService } from 'src/support-channels/support-channels.service';
import { HelpdeskProxyService } from 'src/helpdesk/helpdesk-proxy.service';

@Module({
  providers: [ChatGateway, ChatService, N8nService, SupportChannelsService, HelpdeskProxyService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
