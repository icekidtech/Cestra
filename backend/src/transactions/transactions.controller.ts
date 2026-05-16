import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
@Throttle({ consumer: { limit: 60, ttl: 60000 } })
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /** GET /v1/transactions */
  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListTransactionsDto,
  ) {
    return this.transactionsService.findAll(userId, query);
  }
}
