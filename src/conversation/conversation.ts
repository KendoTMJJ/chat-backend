import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from 'src/message/message';

export enum ConversationStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  EXPIRED = 'expired',
  ESCALATED = 'escalated',
}

@Entity('Conversations', { schema: 'public' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  codConversation: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  @Column({ type: 'varchar', nullable: true })
  correo: string | null;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', nullable: true })
  context: string | null;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.ACTIVE,
  })
  status: ConversationStatus;

  @CreateDateColumn()
  startedAt: Date;

  @UpdateDateColumn()
  lastActivityAt: Date;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}
