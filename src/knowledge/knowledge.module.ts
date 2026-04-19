import { Module } from '@nestjs/common';
import { KnowledgeProxyController } from './knowledge-proxy.controller';
import { KnowledgeProxyService } from './knowledge-proxy.service';

@Module({
  controllers: [KnowledgeProxyController],
  providers: [KnowledgeProxyService],
})
export class KnowledgeModule {}
