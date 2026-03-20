import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from './entities/admin.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@Injectable()
export class AdminService implements OnApplicationBootstrap {
  private adminRepo: Repository<Admin>;

  constructor(dataSource: DataSource) {
    this.adminRepo = dataSource.getRepository(Admin);
  }

  async onApplicationBootstrap() {
    const count = await this.adminRepo.count();
    if (count === 0) {
      const email = String(process.env.ADMIN_EMAIL);
      const passwordHash = String(process.env.ADMIN_PASSWORD_HASH);
      const admin = this.adminRepo.create({
        email,
        password: passwordHash,
        name: 'Administrador',
        isActive: true,
      });
      await this.adminRepo.save(admin);
      console.log(`Admin inicial creado: ${email}`);
    }
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.adminRepo.findOne({ where: { email, isActive: true } });
  }

  async findAll(): Promise<Omit<Admin, 'password'>[]> {
    return this.adminRepo.find({
      select: ['id', 'email', 'name', 'isActive', 'createdAt', 'updatedAt'],
    });
  }

  async create(dto: CreateAdminDto): Promise<Omit<Admin, 'password'>> {
    const existing = await this.adminRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('El email ya está en uso');

    const hashed = await bcrypt.hash(dto.password, 10);
    const admin = this.adminRepo.create({ ...dto, password: hashed });
    const saved = await this.adminRepo.save(admin);
    const { password, ...result } = saved;
    return result;
  }

  async update(id: string, dto: UpdateAdminDto): Promise<Omit<Admin, 'password'>> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin no encontrado');

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }
    Object.assign(admin, dto);
    const saved = await this.adminRepo.save(admin);
    const { password, ...result } = saved;
    return result;
  }

  async remove(id: string): Promise<void> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Admin no encontrado');
    await this.adminRepo.remove(admin);
  }
}
