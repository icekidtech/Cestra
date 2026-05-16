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

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  business_id: string;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount: string;

  @Column({ type: 'varchar', length: 255 })
  reference: string;

  @Column({ type: 'date' })
  due_date: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string; // 'PENDING' | 'PAID' | 'EXPIRED'

  @Column({ type: 'uuid', nullable: true })
  payment_tx_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
