import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SavingsCircleStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

@Entity('savings_circles')
@Index(['status'])
@Index(['circleId'])
@Index(['createdAt'])
export class SavingsCircle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  circleId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'jsonb' })
  members: Array<{ memberAddress: string; contributionAmount: string }>;

  @Column({ type: 'smallint', default: 1 })
  currentRound: number;

  @Column({ type: 'jsonb' })
  payoutSchedule: Array<{
    round: number;
    recipient: string;
    amount: string;
    paidAt?: string;
  }>;

  @Column({ type: 'varchar', length: 50, default: SavingsCircleStatus.ACTIVE })
  status: SavingsCircleStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
