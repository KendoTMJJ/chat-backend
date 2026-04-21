import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/admin-auth/jwt/admin.guard';
import { JwtAuthGuard } from 'src/admin-auth/jwt/jwt-auth.guard';
import { ChatService } from 'src/chat/chat.service';
import { AdminService } from './admin.service';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-admin.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly chatService: ChatService,
    private readonly adminService: AdminService,
  ) {}

  // ── Perfil ────────────────────────────────────────────────────

  @Get('profile')
  getProfile(@Request() req: any) {
    return this.adminService.getProfile(req.user.sub);
  }

  @Patch('profile')
  updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.adminService.updateProfile(req.user.sub, dto);
  }

  @Patch('change-password')
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    await this.adminService.changePassword(req.user.sub, dto);
    return { message: 'Contraseña actualizada correctamente' };
  }

  // ── Conversaciones ────────────────────────────────────────────

  @Get('conversations')
  getConversations() {
    return this.chatService.getConversationsSummary();
  }

  @Get('history/:id')
  getChatHistory(@Param('id') id: string) {
    return this.chatService.getHistory(id);
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
