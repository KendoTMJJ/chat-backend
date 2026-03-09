import {
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
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

  @Patch('conversations/:id/close')
  async closeConversation(@Param('id') id: string) {
    await this.chatService.closeConversation(id);
    return { success: true };
  }

  @Delete('conversations/:id')
  async deleteConversation(@Param('id') id: string) {
    await this.chatService.deleteConversation(id);
    return { success: true };
  }
}
