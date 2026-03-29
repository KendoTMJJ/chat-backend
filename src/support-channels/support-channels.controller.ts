// src/support-channels/support-channels.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/admin-auth/jwt/jwt-auth.guard';
import { AdminGuard } from 'src/admin-auth/jwt/admin.guard';
import { SupportChannelsService } from './support-channels.service';
import { CreateSupportChannelDto } from './dto/create-support-channel.dto';
import { UpdateSupportChannelDto } from './dto/update-support-channel.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('support-channels')
export class SupportChannelsController {
  constructor(
    private readonly supportChannelsService: SupportChannelsService,
  ) {}

  @Get('show')
  public showSupportChannels(): any {
    return this.supportChannelsService.showSupportChannels();
  }

  @Post('create')
  public createSupportChannel(@Body() dto: CreateSupportChannelDto): any {
    return this.supportChannelsService.createSupportChannel(dto);
  }

  @Delete('delete/:id')
  public deleteSupportChannel(@Param('id') id: string) {
    if (!id || id.trim() === '') {
      throw new HttpException('El id no es válido', HttpStatus.CONFLICT);
    }
    return this.supportChannelsService.deleteChannel(id);
  }

  @Patch('update')
  public updateSupportChannel(@Body() dto: UpdateSupportChannelDto): any {
    return this.supportChannelsService.updateSupportChannel(dto);
  }
}
