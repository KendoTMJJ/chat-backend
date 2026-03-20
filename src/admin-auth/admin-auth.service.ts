import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminAuthService {
  async login(email: string, password: string) {
    const passwordHash = String(process.env.ADMIN_PASSWORD_HASH);
    const emailMatch = email === String(process.env.ADMIN_EMAIL);
    const passwordMatch = await bcrypt.compare(password, passwordHash);

    if (!emailMatch || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = sign(
      {
        sub: 'admin',
        role: 'admin',
      },
      String(process.env.JWT_SECRET),
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    );

    return { access_token: token };
  }
}
