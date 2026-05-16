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
import { Business } from './business.entity';

@Entity('batch_payouts')
export class BatchPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  total_amount: string;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  total_fee: string;

  @Column({ type: 'int', default: 0 })
  success_count: number;

  @Column({ type: 'int', default: 0 })
  fail_count: number;

  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' })
  status: string; // 'PROCESSING' | 'COMPLETED' | 'FAILED'

  @Column({ type: 'varchar', length: 500, nullable: true })
  report_url: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
