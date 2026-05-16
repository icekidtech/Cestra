import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RecipientsService } from './recipients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRecipientDto } from './dto/create-recipient.dto';

@Controller('recipients')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  /** POST /v1/recipients */
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRecipientDto) {
    return this.recipientsService.create(userId, dto);
  }

  /** GET /v1/recipients */
  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.recipientsService.findAll(userId);
  }
}
