import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Business } from './entities/business.entity';
import { AnalyticsQueryDto } from './dto/analytics.dto';

@Controller('business/analytics')
@UseGuards(ApiKeyAuthGuard)
@Throttle({ business: { limit: 600, ttl: 60000 } })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** GET /v1/business/analytics */
  @Get()
  getAnalytics(@CurrentUser() business: Business, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getAnalytics(business.id, query);
  }
}
