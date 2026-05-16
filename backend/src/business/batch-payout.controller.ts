import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { BatchPayoutService } from './batch-payout.service';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Business } from './entities/business.entity';

@Controller('business/batch-payout')
@UseGuards(ApiKeyAuthGuard)
@Throttle({ business: { limit: 600, ttl: 60000 } })
export class BatchPayoutController {
  constructor(private readonly batchPayoutService: BatchPayoutService) {}

  /** POST /v1/business/batch-payout */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  processBatchPayout(
    @CurrentUser() business: Business,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.batchPayoutService.processBatchPayout(business.id, file.buffer);
  }
}
