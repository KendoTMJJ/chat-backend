import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from './entities/admin.entity';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-admin.dto';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private adminRepo: Repository<Admin>;

  constructor(dataSource: DataSource) {
    this.adminRepo = dataSource.getRepository(Admin);
  }

  async onApplicationBootstrap() {
    const count = await this.adminRepo.count();
    if (count > 0) return;

    const email = process.env.ADMIN_EMAIL;
    const plainPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Administrador';

    if (!email || !plainPassword) {
      console.warn(
        '[AdminService] ADMIN_EMAIL o ADMIN_INITIAL_PASSWORD no definidos — admin no creado.',
      );
      return;
    }

    const password = await bcrypt.hash(plainPassword, 10);
    await this.adminRepo.save(
      this.adminRepo.create({ email, password, name, isActive: true }),
    );
    console.log(`[AdminService] Admin inicial creado: ${email}`);
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.adminRepo.findOne({ where: { email, isActive: true } });
  }

  async findById(id: string): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin no encontrado');
    return admin;
  }

  async getProfile(id: string): Promise<Omit<Admin, 'password'>> {
    const { password, ...profile } = await this.findById(id);
    return profile;
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<Admin, 'password'>> {
    const admin = await this.findById(id);
    Object.assign(admin, dto);
    const saved = await this.adminRepo.save(admin);
    const { password, ...result } = saved;
    return result;
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const admin = await this.findById(id);

    if (dto.currentPassword !== undefined) {
      const match = await bcrypt.compare(dto.currentPassword, admin.password);
      if (!match) throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres');
    }

    admin.password = await bcrypt.hash(dto.newPassword, 10);
    await this.adminRepo.save(admin);
  }

  async resetPassword(newPassword: string): Promise<void> {
    const admin = await this.adminRepo.findOne({ where: { isActive: true } });
    if (!admin) throw new NotFoundException('No existe ningún admin activo');
    admin.password = await bcrypt.hash(newPassword, 10);
    await this.adminRepo.save(admin);
  }
}
