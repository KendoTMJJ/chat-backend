import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service';

class LoginDto {
  @IsString() email: string;
  @IsString() password: string;
}

class ForgotPasswordDto {
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  login(@Body() body: LoginDto) {
    return this.adminAuthService.login(body.email, body.password);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.adminAuthService.forgotPassword(body.email);
    return {
      message:
        'Si el correo está registrado, recibirás instrucciones en tu bandeja de entrada.',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.adminAuthService.resetPassword(body.token, body.newPassword);
    return { message: 'Contraseña restablecida correctamente' };
  }
}
