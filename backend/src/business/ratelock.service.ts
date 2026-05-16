import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { RateLock } from './entities/rate-lock.entity';
import { CreateRateLockDto } from './dto/ratelock.dto';
import { REDIS_CLIENT } from '../redis/redis.constants';

const FX_CACHE_TTL = 30; // seconds
const LOCK_FEE_RATE = 0.0015; // 0.15%

@Injectable()
export class RateLockService {
  constructor(
    @InjectRepository(RateLock)
    private readonly rateLockRepo: Repository<RateLock>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async createRateLock(businessId: string, dto: CreateRateLockDto) {
    if (dto.duration_hours > 24) {
      throw new BadRequestException('duration_hours cannot exceed 24');
    }

    // Fetch spot rate (cached in Redis for 30s
    const spotRate = await this.getSpotRate(dto.corridor);

    // Apply lock fee: locked_rate = spot_rate * (1 - 0.0015)
    const lockedRate = spotRate * (1 - LOCK_FEE_RATE);
    const lockFee = dto.amount * LOCK_FEE_RATE;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + dto.duration_hours);

    const rateLock = this.rateLockRepo.create({
      business_id: businessId,
      corridor: dto.corridor,
      amount: dto.amount.toFixed(6),
      locked_rate: lockedRate.toFixed(8),
      lock_fee: lockFee.toFixed(6),
      expires_at: expiresAt,
      status: 'ACTIVE',
    });
    await this.rateLockRepo.save(rateLock);

    return {
      rate_lock_id: rateLock.id,
      corridor: dto.corridor,
      amount: dto.amount,
      locked_rate: lockedRate,
      lock_fee: lockFee,
      expires_at: expiresAt,
      duration_hours: dto.duration_hours,
    };
  }

  /**
   * Cron job: expires rate locks every 60 seconds (Requirement 13.4).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireRateLocks(): Promise<void> {
    await this.rateLockRepo.update(
      { status: 'ACTIVE', expires_at: LessThan(new Date()) },
      { status: 'EXPIRED' },
    );
  }

  private async getSpotRate(corridor: string): Promise<number> {
    const cacheKey = `cestra:fx:${corridor}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return parseFloat(cached);
    } catch {
      // Redis unavailable — fall through
    }

    // TODO: Replace with real FX rate source (DeepBook oracle or external API)
    // Stub rates for development
    const stubRates: Record<string, number> = {
      'USD-NGN': 1580.0,
      'USD-GHS': 15.2,
      'USD-KES': 130.0,
      'USD-PHP': 56.5,
      'USD-MXN': 17.2,
    };
    const rate = stubRates[corridor] ?? 1.0;

    try {
      await this.redis.setex(cacheKey, FX_CACHE_TTL, rate.toString());
    } catch {
      // Redis unavailable — ignore
    }

    return rate;
  }
}
