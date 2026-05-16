import {
  Injectable,
  ForbiddenException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Pool } from './entities/pool.entity';
import { PoolContribution } from './entities/pool-contribution.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { CreatePoolDto } from './dto/create-pool.dto';
import { ContributePoolDto } from './dto/contribute-pool.dto';

@Injectable()
export class PoolService {
  constructor(
    @InjectRepository(Pool)
    private readonly poolRepo: Repository<Pool>,
    @InjectRepository(PoolContribution)
    private readonly contributionRepo: Repository<PoolContribution>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Creates a group send pool. Requires KYC tier >= 2
   */
  async create(userId: string, kycTier: number, dto: CreatePoolDto) {
    if (kycTier < 2) {
      throw new ForbiddenException(
        'Pool creation requires Tier 2 KYC verification. Please upgrade at /v1/auth/kyc',
      );
    }

    const deadline = new Date(dto.deadline);
    if (deadline <= new Date()) {
      throw new UnprocessableEntityException('deadline must be a future date');
    }

    const pool = this.poolRepo.create({
      creator_id: userId,
      recipient_id: dto.recipient_id,
      target_amount: dto.target_amount.toFixed(6),
      current_amount: '0',
      deadline,
      status: 'ACTIVE',
    });
    await this.poolRepo.save(pool);

    return {
      pool_id: pool.id,
      invite_link: `/v1/pool/${pool.id}/contribute`,
      target_amount: dto.target_amount,
      deadline: pool.deadline,
      status: pool.status,
    };
  }

  /**
   * Adds a contribution to a pool.
   * Deducts from contributor balance and increments pool current_amount.
   */
  async contribute(userId: string, poolId: string, dto: ContributePoolDto) {
    const pool = await this.poolRepo.findOne({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');

    // Check deadline (Requirement 10.5)
    if (new Date() > pool.deadline) {
      throw new UnprocessableEntityException('This pool has expired and is no longer accepting contributions');
    }

    if (pool.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(`Pool is ${pool.status} and cannot accept contributions`);
    }

    // Check contributor balance
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const balance = parseFloat(wallet.balance_usdsui);
    if (balance < dto.amount) {
      throw new UnprocessableEntityException(
        `Insufficient balance. You have $${balance.toFixed(6)} but tried to contribute $${dto.amount}`,
      );
    }

    // Deduct from contributor balance
    await this.walletRepo.decrement({ id: wallet.id }, 'balance_usdsui', dto.amount);
    await this.walletService.invalidateBalanceCache(userId);

    // Record contribution
    const contribution = this.contributionRepo.create({
      pool_id: poolId,
      user_id: userId,
      amount: dto.amount.toFixed(6),
    });
    await this.contributionRepo.save(contribution);

    // Increment pool current_amount
    await this.poolRepo.increment({ id: poolId }, 'current_amount', dto.amount);
    await this.poolRepo.update(poolId, {});

    // Reload pool to check if target is met
    const updatedPool = await this.poolRepo.findOne({ where: { id: poolId } });
    const currentAmount = parseFloat(updatedPool!.current_amount);
    const targetAmount = parseFloat(updatedPool!.target_amount);

    // Auto-trigger payout if target met
    if (currentAmount >= targetAmount) {
      await this.poolRepo.update(poolId, { status: 'COMPLETED' });
      // TODO: trigger payout to recipient via send service
    }

    return {
      pool_id: poolId,
      contributed: dto.amount,
      current_amount: currentAmount,
      target_amount: targetAmount,
      status: currentAmount >= targetAmount ? 'COMPLETED' : 'ACTIVE',
    };
  }

  /**
   * Cron job: refunds expired pools every 30 seconds
   */
  @Cron('*/30 * * * * *')
  async refundExpiredPools(): Promise<void> {
    const expiredPools = await this.poolRepo.find({
      where: { status: 'ACTIVE', deadline: LessThan(new Date()) },
    });

    for (const pool of expiredPools) {
      // Get all contributions for this pool
      const contributions = await this.contributionRepo.find({
        where: { pool_id: pool.id },
      });

      // Refund each contributor
      for (const contribution of contributions) {
        const amount = parseFloat(contribution.amount);
        const wallet = await this.walletService.getOrCreateWallet(contribution.user_id);
        await this.walletRepo.increment({ id: wallet.id }, 'balance_usdsui', amount);
        await this.walletService.invalidateBalanceCache(contribution.user_id);
      }

      // Mark pool as refunded
      await this.poolRepo.update(pool.id, { status: 'REFUNDED' });
    }
  }
}
