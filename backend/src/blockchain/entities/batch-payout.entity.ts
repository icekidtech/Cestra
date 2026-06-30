import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BatchPayoutStatus {
  ACTIVE = 'ACTIVE',
  EXECUTING = 'EXECUTING',
  EXECUTED = 'EXECUTED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
}

@Entity('onchain_batch_payouts')
@Index(['status'])
@Index(['poolId'])
@Index(['createdAt'])
export class BatchPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  poolId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: BatchPayoutStatus.ACTIVE })
  status: BatchPayoutStatus;

  @Column({ type: 'jsonb' })
  targetRecipients: Array<{ recipient: string; amount: string }>;

  @Column({ type: 'jsonb' })
  contributors: Array<{ contributor: string; amount: string }>;

  @Column({ type: 'bigint' })
  totalAmount: bigint;

  @Column({ type: 'timestamptz', nullable: true })
  executedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
