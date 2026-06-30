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

export enum RateLockStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
}

@Entity('onchain_rate_locks')
@Index(['businessId'])
@Index(['lockId'])
@Index(['status'])
@Index(['expiryAt'])
@Index(['createdAt'])
export class RateLock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'business_id' })
  business: User;

  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  lockId: string;

  @Column({ type: 'bigint' })
  lockedAmount: bigint;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  fxRate: number;

  @Column({ type: 'timestamptz' })
  expiryAt: Date;

  @Column({ type: 'varchar', length: 50, default: RateLockStatus.ACTIVE })
  status: RateLockStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
