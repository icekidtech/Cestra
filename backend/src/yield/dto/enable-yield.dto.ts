import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class EnableYieldDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  acknowledged: boolean;
}
