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
} from '@nestjs/common';
import { SupportChannelsService } from './support-channels.service';
import { SupportChannel } from './entities/supportChannel';

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
  public createSupportChannel(@Body() objSupportChannel: SupportChannel): any {
    return this.supportChannelsService.createSupportChannel(objSupportChannel);
  }

  @Delete('delete/:id')
  public deleteSupportChannel(@Param('id') id: string) {
    if (!id || id.trim() === '') {
      throw new HttpException('El id no es válido', HttpStatus.CONFLICT);
    }
    return this.supportChannelsService.deleteRecipie(id);
  }

  @Patch('update')
  public updateSupportChannel(@Body() objSupportChannel: SupportChannel): any {
    return this.supportChannelsService.updateSupportChannel(objSupportChannel);
  }
}
