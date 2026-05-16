import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindManyOptions } from 'typeorm';
import Redis from 'ioredis';
import { Transaction } from '../send/entities/transaction.entity';
import { AnalyticsQueryDto } from './dto/analytics.dto';
import { REDIS_CLIENT } from '../redis/redis.constants';

const ANALYTICS_CACHE_TTL = 60; // seconds
const WIRE_BENCHMARK_RATE = 0.065; // 6.5% wire transfer benchmark

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async getAnalytics(businessId: string, query: AnalyticsQueryDto) {
    // Validate date range
    if (query.from_date && query.to_date) {
      if (new Date(query.from_date) > new Date(query.to_date)) {
        throw new BadRequestException('from_date must be before or equal to to_date');
      }
    }

    const cacheKey = `cestra:analytics:${businessId}:${query.from_date ?? ''}:${query.to_date ?? ''}:${query.corridor ?? ''}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Redis unavailable — fall through
    }

    // Build query
    const where: FindManyOptions<Transaction>['where'] = { user_id: businessId, type: 'sent' };
    if (query.from_date && query.to_date) {
      (where as any).created_at = Between(
        new Date(query.from_date),
        new Date(query.to_date + 'T23:59:59Z'),
      );
    }
    if (query.corridor) {
      (where as any).corridor = query.corridor;
    }

    const transactions = await this.txRepo.find({ where });

    // Aggregate
    const totalAmount = transactions.reduce((s, t) => s + parseFloat(t.amount as any), 0);
    const totalFees = transactions.reduce((s, t) => s + parseFloat(t.fee as any), 0);
    const feeSavings = totalAmount * WIRE_BENCHMARK_RATE - totalFees;

    // Per-corridor breakdown
    const corridorMap: Record<string, { amount: number; fees: number; count: number }> = {};
    for (const tx of transactions) {
      const c = tx.corridor ?? 'unknown';
      if (!corridorMap[c]) corridorMap[c] = { amount: 0, fees: 0, count: 0 };
      corridorMap[c].amount += parseFloat(tx.amount as any);
      corridorMap[c].fees += parseFloat(tx.fee as any);
      corridorMap[c].count++;
    }

    const result = {
      total_amount: totalAmount,
      total_fees: totalFees,
      fee_savings: feeSavings,
      transaction_count: transactions.length,
      corridors: Object.entries(corridorMap).map(([corridor, data]) => ({
        corridor,
        ...data,
      })),
      from_date: query.from_date,
      to_date: query.to_date,
    };

    try {
      await this.redis.setex(cacheKey, ANALYTICS_CACHE_TTL, JSON.stringify(result));
    } catch {
      // Redis unavailable — ignore
    }

    return result;
  }
}
