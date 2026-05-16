import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FundAchDto } from './dto/fund-ach.dto';
import { FundCrosschainDto } from './dto/fund-crosschain.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /** GET /v1/wallet/balance */
  @Get('balance')
  getBalance(@CurrentUser('id') userId: string) {
    return this.walletService.getBalance(userId);
  }

  /** POST /v1/wallet/fund/ach */
  @Post('fund/ach')
  fundAch(@CurrentUser('id') userId: string, @Body() dto: FundAchDto) {
    return this.walletService.fundAch(userId, dto);
  }

  /** POST /v1/wallet/fund/crosschain */
  @Post('fund/crosschain')
  fundCrosschain(@CurrentUser('id') userId: string, @Body() dto: FundCrosschainDto) {
    return this.walletService.fundCrosschain(userId, dto);
  }
}
