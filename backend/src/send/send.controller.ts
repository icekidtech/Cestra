import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SendService } from './send.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSendDto } from './dto/create-send.dto';

@Controller('send')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class SendController {
  constructor(private readonly sendService: SendService) {}

  /** POST /v1/send */
  @Post()
  createSend(
    @CurrentUser() user: { id: string; kyc_tier: number },
    @Body() dto: CreateSendDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.sendService.createSend(user.id, user.kyc_tier, dto, idempotencyKey);
  }

  /** GET /v1/send/:tx_id/status */
  @Get(':tx_id/status')
  getStatus(
    @CurrentUser('id') userId: string,
    @Param('tx_id') txId: string,
  ) {
    return this.sendService.getStatus(userId, txId);
  }
}
