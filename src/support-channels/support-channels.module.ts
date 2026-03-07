import { Module } from '@nestjs/common';
import { SupportChannelsService } from './support-channels.service';
import { SupportChannelsController } from './support-channels.controller';

@Module({
  controllers: [SupportChannelsController],
  providers: [SupportChannelsService],
})
export class SupportChannelsModule {}
