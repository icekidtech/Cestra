import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { YieldService } from './yield.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EnableYieldDto } from './dto/enable-yield.dto';
import { WithdrawYieldDto } from './dto/withdraw-yield.dto';

@Controller('yield')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class YieldController {
  constructor(private readonly yieldService: YieldService) {}

  /** POST /v1/yield/enable */
  @Post('enable')
  enable(@CurrentUser('id') userId: string, @Body() dto: EnableYieldDto) {
    return this.yieldService.enable(userId, dto);
  }

  /** POST /v1/yield/withdraw */
  @Post('withdraw')
  withdraw(@CurrentUser('id') userId: string, @Body() dto: WithdrawYieldDto) {
    return this.yieldService.withdraw(userId, dto);
  }
}
