import { IsIn } from 'class-validator';

export class KycDto {
  @IsIn([1, 2, 3])
  tier: 1 | 2 | 3;
}
