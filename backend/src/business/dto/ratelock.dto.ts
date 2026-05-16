import { IsString, IsNotEmpty, IsNumber, IsPositive, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRateLockDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  corridor: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(24, { message: 'duration_hours cannot exceed 24' })
  duration_hours: number;
}
