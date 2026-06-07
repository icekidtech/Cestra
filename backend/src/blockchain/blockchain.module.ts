import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuiModule } from '../sui/sui.module';
import {
  Transaction,
  PendingTransaction,
  BatchPayout,
  YieldDeposit,
  SavingsCircle,
  RateLock,
  CrossChainTransfer,
} from './entities';

@Module({
  imports: [
    SuiModule,
    TypeOrmModule.forFeature([
      Transaction,
      PendingTransaction,
      BatchPayout,
      YieldDeposit,
      SavingsCircle,
      RateLock,
      CrossChainTransfer,
    ]),
  ],
  exports: [
    SuiModule,
    TypeOrmModule,
  ],
})
export class BlockchainModule {}
