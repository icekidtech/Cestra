import {
  Injectable,
  ForbiddenException,
  UnprocessableEntityException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Transaction, TransactionStatus } from './entities/transaction.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { Recipient } from '../recipients/entities/recipient.entity';
import { CreateSendDto } from './dto/create-send.dto';
import { WalletService } from '../wallet/wallet.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import Redis from 'ioredis';

// KYC tier monthly send limits in USD
const KYC_TIER_LIMITS: Record<number, number> = {
  0: 0,
  1: 999,
  2: 3000,
  3: Infinity,
};

const FEE_RATE = 0.008; // 0.80%

@Injectable()
export class SendService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Recipient)
    private readonly recipientRepo: Repository<Recipient>,
    private readonly walletService: WalletService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Initiates a send transaction.
   * Enforces idempotency, KYC tier limits, and balance checks.
   */
  async createSend(
    userId: string,
    kycTier: number,
    dto: CreateSendDto,
    idempotencyKey?: string,
  ): Promise<Transaction> {
    // Idempotency check (Requirement 6.9)
    if (idempotencyKey) {
      const existing = await this.txRepo.findOne({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) return existing;
    }

    // Validate recipient belongs to this user
    const recipient = await this.recipientRepo.findOne({
      where: { id: dto.recipient_id, user_id: userId },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // KYC tier limit check (Requirement 6.6)
    const tierLimit = KYC_TIER_LIMITS[kycTier] ?? 0;
    if (dto.amount > tierLimit) {
      throw new ForbiddenException(
        `Your current KYC tier (${kycTier}) allows a maximum send of $${tierLimit}. ` +
          `Please upgrade your verification at /v1/auth/kyc`,
      );
    }

    // Fee calculation
    const fee = parseFloat((dto.amount * FEE_RATE).toFixed(6));
    const totalDebit = dto.amount + fee;

    // Balance check (Requirement 6.5)
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const currentBalance = parseFloat(wallet.balance_usdsui);
    if (currentBalance < totalDebit) {
      const shortfall = (totalDebit - currentBalance).toFixed(6);
      throw new UnprocessableEntityException(
        `Insufficient balance. You need $${shortfall} more to complete this send.`,
      );
    }

    // Deduct balance atomically
    await this.walletRepo.decrement(
      { id: wallet.id },
      'balance_usdsui',
      totalDebit,
    );

    // Create transaction record
    const tx = this.txRepo.create({
      user_id: userId,
      recipient_id: dto.recipient_id,
      type: 'sent',
      amount: dto.amount.toFixed(6),
      fee: fee.toFixed(6),
      corridor: dto.corridor,
      status: 'COMPLETED',
      idempotency_key: idempotencyKey ?? null,
    });
    await this.txRepo.save(tx);

    // Invalidate balance cache
    await this.walletService.invalidateBalanceCache(userId);

    // NOTE: On-chain settlement via cestra::send is wired separately
    // (requires funded relayer + SendEscrow). In demo mode the transfer is
    // recorded and the balance debited; on-chain submission is the next step.

    return tx;
  }

  /**
   * Returns the current status of a transaction.
   */
  async getStatus(userId: string, txId: string) {
    const tx = await this.txRepo.findOne({
      where: { id: txId, user_id: userId },
    });
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      tx_id: tx.id,
      status: tx.status,
      on_chain_tx_hash: tx.on_chain_tx_hash,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee),
      corridor: tx.corridor,
      created_at: tx.created_at,
      estimated_delivery: tx.status === 'PENDING' ? '< 90 seconds' : null,
    };
  }

  /**
   * Called by the off-ramp partner webhook when delivery is confirmed.
   * Updates transaction status to COMPLETED.
   */
  async handleOfframpWebhook(
    txId: string,
    localAmount: number,
    localCurrency: string,
    onChainTxHash: string,
  ): Promise<void> {
    await this.txRepo.update(txId, {
      status: 'COMPLETED',
      local_amount: localAmount.toFixed(6),
      local_currency: localCurrency,
      on_chain_tx_hash: onChainTxHash,
    });
    // TODO: fire transaction.completed webhook for business customers
  }

  /**
   * Cron job: transitions PENDING transactions older than 300s to PENDING_REVIEW.
   * Runs every 60 seconds (Requirement 6.8).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async timeoutPendingTransactions(): Promise<void> {
    const cutoff = new Date(Date.now() - 300_000); // 300 seconds ago
    await this.txRepo.update(
      { status: 'PENDING', created_at: LessThan(cutoff) },
      { status: 'PENDING_REVIEW' },
    );
  }
}
