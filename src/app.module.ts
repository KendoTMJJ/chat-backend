import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from '@nestjs/config';
import { ConnectionModule } from './config/connection/connection.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ChatModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ConnectionModule,
    AdminAuthModule,
    AdminModule,
  ],
})
export class AppModule {}
