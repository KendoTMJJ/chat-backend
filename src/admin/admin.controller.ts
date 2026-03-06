import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/admin-auth/jwt/admin.guard';
import { JwtAuthGuard } from 'src/admin-auth/jwt/jwt-auth.guard';
import { ChatService } from 'src/chat/chat.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations() {
    return await this.chatService.getConversationsSummary();
  }

  @Get('history/:id')
  async getChatHistory(@Param('id') id: string) {
    return await this.chatService.getHistory(id);
  }
}
