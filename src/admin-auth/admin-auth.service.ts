import { Injectable, UnauthorizedException } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
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

  async forgotPassword(email: string): Promise<void> {
    const token = await this.adminService.createResetToken(email);
    if (!token) return; // no revelar si el email existe o no

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/admin/reset-password?token=${token}`;

    const smtpConfigured =
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

    if (!smtpConfigured) {
      console.log(`[AdminAuth] Enlace de recuperación (modo dev): ${resetLink}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Recuperación de contraseña — Panel USTA',
      html: buildResetEmail(resetLink),
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.adminService.resetPasswordByToken(token, newPassword);
  }
}

function buildResetEmail(link: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f0a1e;color:#fff;border-radius:16px;overflow:hidden">
      <div style="background:#1a0a2e;padding:32px 40px;text-align:center">
        <h2 style="margin:0;font-size:20px;color:#fff">Recuperación de contraseña</h2>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:13px">Panel de administración USTA Tunja</p>
      </div>
      <div style="padding:32px 40px">
        <p style="color:rgba(255,255,255,0.8);font-size:15px;line-height:1.6;margin:0 0 24px">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta.
          Haz clic en el botón para continuar:
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${link}" style="display:inline-block;background:#4c6ef5;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">
            Restablecer contraseña
          </a>
        </div>
        <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.6">
          Este enlace vence en <strong style="color:rgba(255,255,255,0.6)">1 hora</strong>.
          Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña no cambiará.
        </p>
      </div>
      <div style="padding:16px 40px;border-top:1px solid rgba(255,255,255,0.08);text-align:center">
        <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px">© 2026 Universidad Santo Tomás · Tunja</p>
      </div>
    </div>
  `;
}
