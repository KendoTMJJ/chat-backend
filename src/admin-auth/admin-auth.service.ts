import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class AdminAuthService {
  constructor(private readonly adminService: AdminService) {}

  async login(email: string, password: string) {
    const admin = await this.adminService.findByEmail(email);
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const token = sign(
      { sub: admin.id, email: admin.email, name: admin.name },
      String(process.env.JWT_SECRET),
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );

    return { access_token: token };
  }
}
