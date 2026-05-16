import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SendController } from './send.controller';
import { SendService } from './send.service';
import { Transaction } from './entities/transaction.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { Recipient } from '../recipients/entities/recipient.entity';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Wallet, Recipient]),
    WalletModule,
  ],
  controllers: [SendController],
  providers: [SendService],
  exports: [SendService],
})
export class SendModule {}
