import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchPayoutController } from './batch-payout.controller';
import { InvoiceController } from './invoice.controller';
import { RateLockController } from './ratelock.controller';
import { AnalyticsController } from './analytics.controller';
import { WebhooksController } from './webhooks.controller';
import { BatchPayoutService } from './batch-payout.service';
import { InvoiceService } from './invoice.service';
import { RateLockService } from './ratelock.service';
import { AnalyticsService } from './analytics.service';
import { WebhookService } from './webhook.service';
import { ApiKeyService } from './api-key.service';
import { Business } from './entities/business.entity';
import { BatchPayout } from './entities/batch-payout.entity';
import { Invoice } from './entities/invoice.entity';
import { RateLock } from './entities/rate-lock.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Transaction } from '../send/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Business,
      BatchPayout,
      Invoice,
      RateLock,
      WebhookDelivery,
      Transaction,
    ]),
  ],
  controllers: [
    BatchPayoutController,
    InvoiceController,
    RateLockController,
    AnalyticsController,
    WebhooksController,
  ],
  providers: [
    BatchPayoutService,
    InvoiceService,
    RateLockService,
    AnalyticsService,
    WebhookService,
    ApiKeyService,
  ],
  exports: [ApiKeyService, WebhookService],
})
export class BusinessModule {}
