import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Pool } from './pool.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('pool_contributions')
export class PoolContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  pool_id: string;

  @ManyToOne(() => Pool)
  @JoinColumn({ name: 'pool_id' })
  pool: Pool;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'numeric', precision: 20, scale: 6 })
  amount: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
