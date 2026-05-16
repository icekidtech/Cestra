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

export type TransactionType = 'sent' | 'received' | 'yield' | 'funded' | 'scheduled';
export type TransactionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SCHEDULED'
  | 'PENDING_REVIEW';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  recipient_id: string | null;

  @ManyToOne(() => Recipient, { nullable: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient: Recipient | null;

  @Column({ type: 'varchar', length: 20 })
  type: TransactionType;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount: string;

  @Column({ type: 'numeric', precision: 20, scale: 6, default: '0' })
  fee: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  corridor: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  on_chain_tx_hash: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  local_amount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  local_currency: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  idempotency_key: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
