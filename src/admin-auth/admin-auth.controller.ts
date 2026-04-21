import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';

class LoginDto {
  @IsString() email: string;
  @IsString() password: string;
}

class ResetPasswordDto {
  @IsString() resetToken: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.adminAuthService.login(body.email, body.password);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.adminAuthService.resetPassword(body.resetToken, body.newPassword);
    return { message: 'Contraseña restablecida correctamente' };
  }
}
