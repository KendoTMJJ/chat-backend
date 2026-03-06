import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';

@Injectable()
export class AdminAuthService {
  login(email: string, password: string) {
    if (
      email !== String(process.env.ADMIN_EMAIL) ||
      password !== String(process.env.ADMIN_PASSWORD)
    ) {
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
