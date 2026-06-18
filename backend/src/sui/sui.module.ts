import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuiClient } from '@mysten/sui';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { BlockchainConfigService } from './blockchain-config.service';
import { TransactionBuilderService } from './transaction-builder.service';
import { TransactionSigningService } from './transaction-signing.service';
import { TransactionSubmissionService } from './transaction-submission.service';
import { RetryStrategy } from './retry-strategy.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { OnChainMonitorService } from './on-chain-monitor.service';
import { StateSyncService } from './state-sync.service';
import { EventRoutingService } from './event-routing.service';
import { EventDeduplicationService } from './event-deduplication.service';
import { ComplianceEngine } from './compliance-engine.service';
import { OFACService } from './ofac-aml.service';
import { SendService } from './send.service';
import { PoolService } from './pool.service';
import { YieldService } from './yield.service';
import { CircleService } from './circle.service';
import { BridgeService } from './bridge.service';
import { PendingTransaction } from '../blockchain/entities/pending-transaction.entity';
import { Transaction } from '../blockchain/entities/transaction.entity';
import { BatchPayout } from '../blockchain/entities/batch-payout.entity';
import { YieldDeposit } from '../blockchain/entities/yield-deposit.entity';
import { SavingsCircle } from '../blockchain/entities/savings-circle.entity';
import { RateLock } from '../blockchain/entities/rate-lock.entity';
import { CrossChainTransfer } from '../blockchain/entities/cross-chain-transfer.entity';
import { Blacklist } from '../blockchain/entities/blacklist.entity';
import { User } from '../auth/entities/user.entity';

export const SUI_CLIENT = 'SUI_CLIENT';
export const SUI_KEYPAIR = 'SUI_KEYPAIR';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PendingTransaction,
      Transaction,
      BatchPayout,
      YieldDeposit,
      SavingsCircle,
      RateLock,
      CrossChainTransfer,
      Blacklist,
      User,
    ]),
  ],
  providers: [
    {
      provide: SUI_CLIENT,
      useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('SUI_RPC_URL');
        if (!rpcUrl) {
          throw new Error('SUI_RPC_URL environment variable is not set');
        }

        return new SuiClient({
          url: rpcUrl,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: SUI_KEYPAIR,
      useFactory: (configService: ConfigService) => {
        const privateKeyBase64 = configService.get<string>('SUI_PRIVATE_KEY');
        if (!privateKeyBase64) {
          throw new Error('SUI_PRIVATE_KEY environment variable is not set');
        }

        try {
          const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
          return Ed25519Keypair.fromSecretKey(privateKeyBytes);
        } catch (error) {
          throw new Error(
            `Failed to initialize Ed25519Keypair: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
      inject: [ConfigService],
    },
    BlockchainConfigService,
    TransactionBuilderService,
    TransactionSigningService,
    RetryStrategy,
    CircuitBreakerService,
    TransactionSubmissionService,
    OnChainMonitorService,
    StateSyncService,
    EventRoutingService,
    EventDeduplicationService,
    OFACService,
    ComplianceEngine,
    SendService,
    PoolService,
    YieldService,
    CircleService,
    BridgeService,
  ],
  exports: [
    SUI_CLIENT,
    SUI_KEYPAIR,
    BlockchainConfigService,
    TransactionBuilderService,
    TransactionSigningService,
    RetryStrategy,
    CircuitBreakerService,
    TransactionSubmissionService,
    OnChainMonitorService,
    StateSyncService,
    EventRoutingService,
    EventDeduplicationService,
    OFACService,
    ComplianceEngine,
    SendService,
    PoolService,
    YieldService,
    CircleService,
    BridgeService,
  ],
})

export class SuiModule implements OnModuleInit {
  private readonly logger = new Logger(SuiModule.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('SUI_RPC_URL');
    const network = this.configService.get<string>('SUI_NETWORK');

    try {
      const client = new SuiClient({ url: rpcUrl });
      await client.getRpcApiVersion();

      this.logger.log(
        `Connected to Sui ${network} network at RPC endpoint: ${rpcUrl}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to connect to Sui RPC at ${rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error('Sui RPC connection failed at startup');
    }
  }
}
