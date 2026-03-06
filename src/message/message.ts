import { Conversation } from 'src/conversation/conversation';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('Mensajes', { schema: 'public' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  codMessage: string;

  @Column({ type: 'varchar', nullable: false })
  userId: string;

  @Column({ type: 'varchar', nullable: false })
  sender: 'user' | 'bot';

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn()
  createAt: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  constructor(partial?: Partial<Message>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
