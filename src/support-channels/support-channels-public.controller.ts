import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { SupportChannelsService } from './support-channels.service';

@Controller('support-channels')
export class SupportChannelsPublicController {
  constructor(private readonly service: SupportChannelsService) {}

  @Get('resolve')
  async resolve(
    @Query('context') context: string,
    @Query('intent') intent?: string,
  ) {
    if (!context) {
      throw new HttpException('context requerido', HttpStatus.BAD_REQUEST);
    }
    const channel = await this.service.findByContextAndIntent(context, intent);
    if (!channel) {
      throw new HttpException('Sin canal configurado', HttpStatus.NOT_FOUND);
    }
    return { whatsapp: channel.whatsapp, email: channel.email };
  }
}
