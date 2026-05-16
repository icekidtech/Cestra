import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PoolService } from './pool.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePoolDto } from './dto/create-pool.dto';
import { ContributePoolDto } from './dto/contribute-pool.dto';

@Controller('pool')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class PoolController {
  constructor(private readonly poolService: PoolService) {}

  /** POST /v1/pool/create */
  @Post('create')
  create(
    @CurrentUser() user: { id: string; kyc_tier: number },
    @Body() dto: CreatePoolDto,
  ) {
    return this.poolService.create(user.id, user.kyc_tier, dto);
  }

  /** POST /v1/pool/:id/contribute */
  @Post(':id/contribute')
  contribute(
    @CurrentUser('id') userId: string,
    @Param('id') poolId: string,
    @Body() dto: ContributePoolDto,
  ) {
    return this.poolService.contribute(userId, poolId, dto);
  }
}
