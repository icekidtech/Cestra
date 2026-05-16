import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Wallet } from './entities/wallet.entity';
import { BridgeAddress } from './entities/bridge-address.entity';
import { FundAchDto } from './dto/fund-ach.dto';
import { FundCrosschainDto } from './dto/fund-crosschain.dto';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { randomBytes } from 'crypto';

const BALANCE_CACHE_TTL = 5; // seconds
const CURRENT_APY = 4.0; // 4% APY — update when Suilend integration is live

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(BridgeAddress)
    private readonly bridgeAddressRepo: Repository<BridgeAddress>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  /**
   * Returns the user's wallet balance, yield balance, and current APY.
   * Response is cached in Redis for 5 seconds.
   */
  async getBalance(userId: string) {
    const cacheKey = `cestra:balance:${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Redis unavailable — fall through to DB
    }

    const wallet = await this.getOrCreateWallet(userId);
    const result = {
      balance_usdsui: parseFloat(wallet.balance_usdsui),
      yield_balance: parseFloat(wallet.yield_balance),
      yield_enabled: wallet.yield_enabled,
      apy: CURRENT_APY,
    };

    try {
      await this.redis.setex(cacheKey, BALANCE_CACHE_TTL, JSON.stringify(result));
    } catch {
      // Redis unavailable — ignore
    }

    return result;
  }

  /**
   * Initiates an ACH bank pull via Plaid.
   * Returns a pending transaction record.
   */
  async fundAch(userId: string, dto: FundAchDto) {
    if (dto.amount < 1.0) {
      throw new BadRequestException('amount must be at least $1.00');
    }

    // Call Plaid API to initiate ACH pull
    await this.initiatePlaidAch(dto.plaid_token, dto.amount);

    // Return a stub pending record — the Transaction entity will be created
    // by the send module once it exists. For now return the funding intent.
    return {
      status: 'PENDING',
      amount: dto.amount,
      type: 'funded',
      message: 'ACH pull initiated. Funds will be credited within 1-3 business days.',
    };
  }

  /**
   * Generates a chain-specific bridge deposit address for inbound USDC.
   * Stores the address in bridge_addresses with a 24-hour expiry.
   */
  async fundCrosschain(userId: string, dto: FundCrosschainDto) {
    // Generate a deterministic-looking deposit address (stub)
    // In production: call CCTP V2 or Wormhole SDK to generate a real deposit address
    const address = await this.generateBridgeAddress(dto.source_chain);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const bridgeAddress = this.bridgeAddressRepo.create({
      user_id: userId,
      chain: dto.source_chain,
      address,
      expires_at: expiresAt,
    });
    await this.bridgeAddressRepo.save(bridgeAddress);

    return {
      chain: dto.source_chain,
      address,
      expires_at: expiresAt,
      instructions: `Send USDC on ${dto.source_chain} to this address. Funds will be credited within the chain's processing time.`,
    };
  }

  /**
   * Invalidates the balance cache for a user.
   * Called after any balance-mutating operation.
   */
  async invalidateBalanceCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`cestra:balance:${userId}`);
    } catch {
      // Redis unavailable — ignore
    }
  }

  /**
   * Gets or creates a wallet for the given user.
   */
  async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { user_id: userId } });
    if (!wallet) {
      wallet = this.walletRepo.create({
        user_id: userId,
        balance_usdsui: '0',
        yield_enabled: false,
        yield_balance: '0',
      });
      await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async initiatePlaidAch(plaidToken: string, amount: number): Promise<void> {
    const clientId = this.config.get<string>('PLAID_CLIENT_ID');
    const secret = this.config.get<string>('PLAID_SECRET');

    // TODO: Replace with real Plaid ACH transfer initiation
    // const plaid = new PlaidApi(new Configuration({ basePath: PlaidEnvironments.sandbox, baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } } }));
    // await plaid.transferCreate({ access_token: plaidToken, amount: amount.toFixed(2), ... });
    void clientId;
    void secret;
    void plaidToken;
    void amount;
  }

  private async generateBridgeAddress(chain: string): Promise<string> {
    // TODO: Replace with real CCTP V2 / Wormhole deposit address generation
    // For now generate a random hex address as a placeholder
    const prefix: Record<string, string> = {
      ethereum: '0x',
      base: '0x',
      avalanche: '0x',
      solana: '',
    };
    const p = prefix[chain] ?? '0x';
    const bytes = randomBytes(p === '' ? 32 : 20);
    return `${p}${bytes.toString('hex')}`;
  }
}
