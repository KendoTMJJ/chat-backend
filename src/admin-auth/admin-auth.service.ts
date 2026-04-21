import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class AdminAuthService {
  constructor(private readonly adminService: AdminService) {}

  async login(email: string, password: string) {
    const admin = await this.adminService.findByEmail(email);
    if (!admin) throw new UnauthorizedException('Credenciales inválidas');

    const match = await bcrypt.compare(password, admin.password);
    if (!match) throw new UnauthorizedException('Credenciales inválidas');

    const token = sign(
      { sub: admin.id, email: admin.email, name: admin.name },
      String(process.env.JWT_SECRET),
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );

    return { access_token: token };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const expected = process.env.ADMIN_RESET_TOKEN;
    if (!expected || resetToken !== expected) {
      throw new UnauthorizedException('Token de recuperación inválido');
    }
    await this.adminService.resetPassword(newPassword);
  }
}
