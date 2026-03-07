import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ChannelContext {
  POSGRADOS = 'posgrados',
  MESA_AYUDA = 'mesa_ayuda',
}

@Entity('SupportChannels', { schema: 'public' })
export class SupportChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ChannelContext, unique: true })
  context: ChannelContext;

  @Column({ type: 'varchar' })
  whatsapp: string;

  @Column({ type: 'varchar' })
  email: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
