import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/admin-auth/jwt/admin.guard';
import { JwtAuthGuard } from 'src/admin-auth/jwt/jwt-auth.guard';
import { ChatService } from 'src/chat/chat.service';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly chatService: ChatService,
    private readonly adminService: AdminService,
  ) {}

  // ── Conversations ─────────────────────────────────────────────

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

  // ── Admins CRUD ───────────────────────────────────────────────

  @Get('admins')
  async getAdmins() {
    return await this.adminService.findAll();
  }

  @Post('admins')
  async createAdmin(@Body() dto: CreateAdminDto) {
    return await this.adminService.create(dto);
  }

  @Patch('admins/:id')
  async updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return await this.adminService.update(id, dto);
  }

  @Delete('admins/:id')
  async deleteAdmin(@Param('id') id: string) {
    await this.adminService.remove(id);
    return { success: true };
  }
}
