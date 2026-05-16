import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvoiceService } from './invoice.service';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Business } from './entities/business.entity';
import { CreateInvoiceDto } from './dto/invoice.dto';

@Controller('business/invoice')
@UseGuards(ApiKeyAuthGuard)
@Throttle({ business: { limit: 600, ttl: 60000 } })
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /** POST /v1/business/invoice */
  @Post()
  createInvoice(@CurrentUser() business: Business, @Body() dto: CreateInvoiceDto) {
    return this.invoiceService.createInvoice(business.id, dto);
  }
}
