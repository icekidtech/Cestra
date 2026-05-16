import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YieldController } from './yield.controller';
import { YieldService } from './yield.service';
import { Wallet } from '../wallet/entities/wallet.entity';
import { Transaction } from '../send/entities/transaction.entity';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction]),
    WalletModule,
  ],
  controllers: [YieldController],
  providers: [YieldService],
  exports: [YieldService],
})
export class YieldModule {}
