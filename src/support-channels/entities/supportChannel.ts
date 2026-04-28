import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

export enum ChannelContext {
  POSGRADOS = 'posgrados',
  MESA_AYUDA = 'mesa_ayuda',
}

@Entity('SupportChannels', { schema: 'public' })
@Index(['context', 'intent'], { unique: true })
export class SupportChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ChannelContext })
  context: ChannelContext;

  // null = canal genérico del contexto (posgrados o fallback de mesa_ayuda)
  // string = canal específico del intent (pagos, admisiones, plataforma, etc.)
  @Column({ type: 'varchar', nullable: true, default: null })
  intent: string | null;

  @Column({ type: 'varchar' })
  whatsapp: string;

  @Column({ type: 'varchar' })
  email: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
