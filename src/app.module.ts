import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConnectionModule } from './config/connection/connection.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminModule } from './admin/admin.module';
import { SupportChannelsModule } from './support-channels/support-channels.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { KnowledgeModule } from './knowledge/knowledge.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    ConnectionModule,
    ChatModule,
    AdminAuthModule,
    AdminModule,
    SupportChannelsModule,
    HelpdeskModule,
    KnowledgeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
