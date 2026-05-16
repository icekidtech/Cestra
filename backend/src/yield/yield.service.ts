import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../wallet/entities/wallet.entity';
import { Transaction } from '../send/entities/transaction.entity';
import { WalletService } from '../wallet/wallet.service';
import { EnableYieldDto } from './dto/enable-yield.dto';
import { WithdrawYieldDto } from './dto/withdraw-yield.dto';

@Injectable()
export class YieldService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Enables the yield wallet for a user.
   * Requires explicit risk acknowledgment
   */
  async enable(userId: string, dto: EnableYieldDto) {
    if (dto.acknowledged !== true) {
      throw new BadRequestException(
        'You must acknowledge the risk disclosure to enable the yield wallet. Set acknowledged: true.',
      );
    }

    const wallet = await this.walletService.getOrCreateWallet(userId);
    await this.walletRepo.update(wallet.id, { yield_enabled: true });

    return {
      yield_enabled: true,
      balance_usdsui: parseFloat(wallet.balance_usdsui),
      yield_balance: parseFloat(wallet.yield_balance),
      message: 'Yield wallet enabled. Your idle balance will now earn APY via Suilend.',
    };
  }

  /**
   * Withdraws from the yield wallet.
   * Validates amount does not exceed yield_balance
   */
  async withdraw(userId: string, dto: WithdrawYieldDto) {
    const wallet = await this.walletService.getOrCreateWallet(userId);
    const yieldBalance = parseFloat(wallet.yield_balance);

    if (dto.amount > yieldBalance) {
      throw new UnprocessableEntityException(
        `Withdrawal amount $${dto.amount} exceeds your yield balance of $${yieldBalance.toFixed(6)}.`,
      );
    }

    // Deduct from yield balance
    await this.walletRepo.decrement({ id: wallet.id }, 'yield_balance', dto.amount);

    // Record yield withdrawal transaction
    const tx = this.txRepo.create({
      user_id: userId,
      type: 'yield',
      amount: dto.amount.toFixed(6),
      fee: '0',
      status: 'COMPLETED',
    });
    await this.txRepo.save(tx);

    // Invalidate balance cache
    await this.walletService.invalidateBalanceCache(userId);

    return {
      tx_id: tx.id,
      amount_withdrawn: dto.amount,
      status: 'COMPLETED',
      message: 'Yield withdrawal successful.',
    };
  }

  /**
   * Accrues yield for a user — called by a scheduled job or Suilend webhook.
   */
  async accrueYield(userId: string, amount: number): Promise<void> {
    const wallet = await this.walletService.getOrCreateWallet(userId);
    await this.walletRepo.increment({ id: wallet.id }, 'yield_balance', amount);

    // Record yield accrual transaction
    const tx = this.txRepo.create({
      user_id: userId,
      type: 'yield',
      amount: amount.toFixed(6),
      fee: '0',
      status: 'COMPLETED',
    });
    await this.txRepo.save(tx);

    await this.walletService.invalidateBalanceCache(userId);
  }
}
