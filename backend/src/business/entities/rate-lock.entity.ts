import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';

@Entity('rate_locks')
export class RateLock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'varchar', length: 20 })
  corridor: string;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  locked_rate: string;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  lock_fee: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string; // 'ACTIVE' | 'USED' | 'EXPIRED'

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
