import { IsIn } from 'class-validator';
import { SupportedChain } from '../entities/bridge-address.entity';

export class FundCrosschainDto {
  @IsIn(['ethereum', 'base', 'solana', 'avalanche'], {
    message: 'source_chain must be one of: ethereum, base, solana, avalanche',
  })
  source_chain: SupportedChain;
}
