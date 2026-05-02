import { Module } from '@nestjs/common';
import { HelpdeskProxyController } from './helpdesk-proxy.controller';
import { HelpdeskProxyService } from './helpdesk-proxy.service';

@Module({
  controllers: [HelpdeskProxyController],
  providers: [HelpdeskProxyService],
})
export class HelpdeskModule {}
