import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RateLockService } from './ratelock.service';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Business } from './entities/business.entity';
import { CreateRateLockDto } from './dto/ratelock.dto';

@Controller('business/ratelock')
@UseGuards(ApiKeyAuthGuard)
@Throttle({ business: { limit: 600, ttl: 60000 } })
export class RateLockController {
  constructor(private readonly rateLockService: RateLockService) {}

  /** POST /v1/business/ratelock */
  @Post()
  createRateLock(@CurrentUser() business: Business, @Body() dto: CreateRateLockDto) {
    return this.rateLockService.createRateLock(business.id, dto);
  }
}
