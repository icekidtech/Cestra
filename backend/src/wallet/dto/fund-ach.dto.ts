import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FundAchDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1.0, { message: 'amount must be at least $1.00' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  plaid_token: string;
}
