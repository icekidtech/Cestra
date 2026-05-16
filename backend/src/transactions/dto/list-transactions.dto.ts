import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType, TransactionStatus } from '../../send/entities/transaction.entity';

export class ListTransactionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['sent', 'received', 'yield', 'funded', 'scheduled'])
  type?: TransactionType;

  @IsOptional()
  @IsIn(['COMPLETED', 'PENDING', 'FAILED', 'SCHEDULED', 'PENDING_REVIEW'])
  status?: TransactionStatus;
}
