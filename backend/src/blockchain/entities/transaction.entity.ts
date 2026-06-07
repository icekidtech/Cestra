import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

@Entity('transactions')
@Index(['status'])
@Index(['sender'])
@Index(['recipient'])
@Index(['onChainDigest'])
@Index(['createdAt'])
@Index(['userId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  sender: string;

  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'bigint' })
  amount: bigint;

  @Column({ type: 'bigint' })
  fee: bigint;

  @Column({ type: 'smallint' })
  kycTier: number;

  @Column({ type: 'varchar', length: 50, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  onChainDigest: string | null;

  @Column({ type: 'text', nullable: true })
  rootCause: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
