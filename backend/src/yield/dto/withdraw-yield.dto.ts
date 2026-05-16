import { IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class WithdrawYieldDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;
}
