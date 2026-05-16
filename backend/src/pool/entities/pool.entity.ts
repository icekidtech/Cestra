import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Recipient } from '../../recipients/entities/recipient.entity';

export type PoolStatus = 'ACTIVE' | 'COMPLETED' | 'REFUNDED';

@Entity('pools')
export class Pool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  creator_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ type: 'uuid' })
  recipient_id: string;

  @ManyToOne(() => Recipient)
  @JoinColumn({ name: 'recipient_id' })
  recipient: Recipient;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  target_amount: string;

  @Column({ type: 'numeric', precision: 20, scale: 6, default: '0' })
  current_amount: string;

  @Column({ type: 'timestamptz' })
  deadline: Date;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: PoolStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
