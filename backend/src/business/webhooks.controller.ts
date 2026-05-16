import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhookService } from './webhook.service';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Business } from './entities/business.entity';
import { RegisterWebhookDto } from './dto/webhook.dto';

@Controller('business/webhooks')
@UseGuards(ApiKeyAuthGuard)
@Throttle({ business: { limit: 600, ttl: 60000 } })
export class WebhooksController {
  constructor(private readonly webhookService: WebhookService) {}

  /** POST /v1/business/webhooks */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  registerWebhook(@CurrentUser() business: Business, @Body() dto: RegisterWebhookDto) {
    return this.webhookService.registerWebhook(business.id, dto.webhook_url);
  }

  /** GET /v1/business/webhooks */
  @Get()
  listWebhooks(@CurrentUser() business: Business) {
    return this.webhookService.listWebhooks(business.id);
  }
}
