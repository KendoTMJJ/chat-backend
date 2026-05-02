import { Module } from '@nestjs/common';
import { SupportChannelsService } from './support-channels.service';
import { SupportChannelsController } from './support-channels.controller';
import { SupportChannelsPublicController } from './support-channels-public.controller';

@Module({
  controllers: [SupportChannelsController, SupportChannelsPublicController],
  providers: [SupportChannelsService],
})
export class SupportChannelsModule {}
