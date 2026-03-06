import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt/jwt.strategy';

@Module({
  imports: [PassportModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, JwtStrategy],
})
export class AdminAuthModule {}
