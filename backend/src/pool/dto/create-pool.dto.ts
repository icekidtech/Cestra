import { IsNumber, IsPositive, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePoolDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  target_amount: number;

  @IsUUID()
  recipient_id: string;

  @IsDateString()
  deadline: string; // ISO 8601 future date
}
