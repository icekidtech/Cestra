import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  api_key_hash: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  webhook_url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhook_secret: string | null;

  @Column({ type: 'varchar', length: 20, default: 'business' })
  rate_limit_tier: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
