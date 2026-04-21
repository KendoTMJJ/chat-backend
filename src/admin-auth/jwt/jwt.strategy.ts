import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly adminService: AdminService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; name: string }) {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Token inválido');
    }

    const admin = await this.adminService.findById(payload.sub);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Acceso no autorizado');
    }

    return { sub: admin.id, email: admin.email, name: admin.name };
  }
}
