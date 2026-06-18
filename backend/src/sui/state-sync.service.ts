import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ParsedEvent } from './on-chain-monitor.service';
import { EventRoutingService } from './event-routing.service';
import { Transaction, TransactionStatus } from '../blockchain/entities/transaction.entity';
import { BatchPayout, BatchPayoutStatus } from '../blockchain/entities/batch-payout.entity';
import { YieldDeposit, YieldDepositStatus } from '../blockchain/entities/yield-deposit.entity';
import { SavingsCircle, SavingsCircleStatus } from '../blockchain/entities/savings-circle.entity';
import { RateLock, RateLockStatus } from '../blockchain/entities/rate-lock.entity';
import { CrossChainTransfer, CrossChainTransferStatus } from '../blockchain/entities/cross-chain-transfer.entity';

/**
 * StateSyncService listens for on-chain events and updates PostgreSQL entities
 * to maintain a synchronized local replica of on-chain state.
 *
 * Features:
 * - Event-driven database updates
 * - ACID transaction wrapping for atomicity
 * - Validation of required event fields
 * - Comprehensive error handling and alerting
 * - Per-module event handlers
 */

export interface StateSyncResult {
  success: boolean;
  entityType: string;
  entityId?: string;
  error?: string;
  timestamp: number;
}

@Injectable()
export class StateSyncService {
  private readonly logger = new Logger(StateSyncService.name);

  constructor(
    private dataSource: DataSource,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private eventRoutingService: EventRoutingService,
  ) {
    this.registerHandlers();
  }

  /**
   * Register event handlers with the routing service
   */
  private registerHandlers(): void {
    this.eventRoutingService.registerHandlers([
      {
        eventType: 'cestra::send::SentEvent',
        handler: (event) => this.onSendEvent(event),
      },
      {
        eventType: 'cestra::pool::PoolCreatedEvent',
        handler: (event) => this.onPoolCreatedEvent(event),
      },
      {
        eventType: 'cestra::pool::PoolContributedEvent',
        handler: (event) => this.onPoolContributedEvent(event),
      },
      {
        eventType: 'cestra::pool::PoolExecutedEvent',
        handler: (event) => this.onPoolExecutedEvent(event),
      },
      {
        eventType: 'cestra::yield::YieldDepositedEvent',
        handler: (event) => this.onYieldDepositedEvent(event),
      },
      {
        eventType: 'cestra::yield::YieldAccruedEvent',
        handler: (event) => this.onYieldAccruedEvent(event),
      },
      {
        eventType: 'cestra::circle::CircleCreatedEvent',
        handler: (event) => this.onCircleCreatedEvent(event),
      },
      {
        eventType: 'cestra::circle::CirclePayoutTriggeredEvent',
        handler: (event) => this.onCirclePayoutTriggeredEvent(event),
      },
      {
        eventType: 'cestra::ratelock::RateLockCreatedEvent',
        handler: (event) => this.onRateLockCreatedEvent(event),
      },
      {
        eventType: 'cestra::ratelock::RateLockFilledEvent',
        handler: (event) => this.onRateLockFilledEvent(event),
      },
      {
        eventType: 'cestra::ratelock::RateLockExpiredEvent',
        handler: (event) => this.onRateLockExpiredEvent(event),
      },
      {
        eventType: 'cestra::bridge::BridgeCctpReceiveCompleted',
        handler: (event) => this.onBridgeCctpCompletedEvent(event),
      },
      {
        eventType: 'cestra::bridge::BridgeWormholeReceiveCompleted',
        handler: (event) => this.onBridgeWormholeCompletedEvent(event),
      },
    ]);

    this.logger.log('State sync handlers registered');
  }

  /**
   * Handle SendEvent: Update Transaction entity
   */
  async onSendEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'sender',
        'recipient',
        'amount',
        'fee',
      ]);

      const { sender, recipient, amount, fee } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        // Try to find existing transaction by digest
        let transaction = await manager.findOne(Transaction, {
          where: { onChainDigest: event.digest },
        });

        if (transaction) {
          // Update existing
          transaction.status = TransactionStatus.CONFIRMED;
          await manager.save(transaction);

          this.logger.debug(
            `Updated Transaction: ${transaction.id} (digest: ${event.digest})`,
          );
        } else {
          // Create new
          transaction = manager.create(Transaction, {
            sender,
            recipient,
            amount: BigInt(amount),
            fee: BigInt(fee),
            kycTier: 1, // Will be updated by compliance engine
            status: TransactionStatus.CONFIRMED,
            onChainDigest: event.digest,
          });

          await manager.save(transaction);

          this.logger.debug(
            `Created Transaction: ${transaction.id} (digest: ${event.digest})`,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `Error handling SendEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle PoolCreatedEvent: Create BatchPayout entity
   */
  async onPoolCreatedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'poolId',
        'targetRecipients',
      ]);

      const { poolId, name, targetRecipients } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const batchPayout = manager.create(BatchPayout, {
          poolId,
          name: name || 'Unnamed Pool',
          status: BatchPayoutStatus.ACTIVE,
          targetRecipients: targetRecipients || [],
          contributors: [],
          totalAmount: BigInt(0),
        });

        await manager.save(batchPayout);

        this.logger.debug(
          `Created BatchPayout: ${batchPayout.id} (poolId: ${poolId})`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling PoolCreatedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle PoolContributedEvent: Update BatchPayout contributor balances
   */
  async onPoolContributedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'poolId',
        'contributor',
        'amount',
      ]);

      const { poolId, contributor, amount } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const batchPayout = await manager.findOne(BatchPayout, {
          where: { poolId },
        });

        if (!batchPayout) {
          this.logger.warn(
            `BatchPayout not found for poolId: ${poolId}`,
          );
          return;
        }

        // Update contributors array
        const contributors = batchPayout.contributors || [];
        const existingContributor = contributors.find(
          (c: any) => c.contributor === contributor,
        );

        if (existingContributor) {
          existingContributor.amount = (BigInt(existingContributor.amount) + BigInt(amount)).toString();
        } else {
          contributors.push({
            contributor,
            amount: amount.toString(),
          });
        }

        batchPayout.contributors = contributors;
        batchPayout.totalAmount = contributors.reduce(
          (sum: bigint, c: any) => sum + BigInt(c.amount),
          BigInt(0),
        );

        await manager.save(batchPayout);

        this.logger.debug(
          `Updated BatchPayout contributors: ${batchPayout.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling PoolContributedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle PoolExecutedEvent: Update BatchPayout status
   */
  async onPoolExecutedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, ['poolId']);

      const { poolId } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const batchPayout = await manager.findOne(BatchPayout, {
          where: { poolId },
        });

        if (!batchPayout) {
          this.logger.warn(
            `BatchPayout not found for poolId: ${poolId}`,
          );
          return;
        }

        batchPayout.status = BatchPayoutStatus.EXECUTED;
        batchPayout.executedAt = new Date(event.timestamp);

        await manager.save(batchPayout);

        this.logger.debug(
          `Updated BatchPayout status to EXECUTED: ${batchPayout.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling PoolExecutedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle YieldDepositedEvent: Create YieldDeposit entity
   */
  async onYieldDepositedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'userAddress',
        'vaultId',
        'amount',
        'shares',
      ]);

      const { userAddress, vaultId, amount, shares } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const yieldDeposit = manager.create(YieldDeposit, {
          userId: userAddress,
          vaultId,
          amount: BigInt(amount),
          shares: BigInt(shares),
          accruedValue: BigInt(amount),
          status: YieldDepositStatus.ACTIVE,
          depositedAt: new Date(event.timestamp),
        });

        await manager.save(yieldDeposit);

        this.logger.debug(
          `Created YieldDeposit: ${yieldDeposit.id} (vaultId: ${vaultId})`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling YieldDepositedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle YieldAccruedEvent: Update YieldDeposit accrued values
   */
  async onYieldAccruedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'vaultId',
        'accruedValue',
      ]);

      const { vaultId, accruedValue } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const deposits = await manager.find(YieldDeposit, {
          where: { vaultId, status: YieldDepositStatus.ACTIVE },
        });

        for (const deposit of deposits) {
          deposit.accruedValue = BigInt(accruedValue);
          await manager.save(deposit);
        }

        this.logger.debug(
          `Updated ${deposits.length} YieldDeposits for vault: ${vaultId}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling YieldAccruedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle CircleCreatedEvent: Create SavingsCircle entity
   */
  async onCircleCreatedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'circleId',
        'members',
      ]);

      const { circleId, name, members } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const circle = manager.create(SavingsCircle, {
          circleId,
          name: name || 'Unnamed Circle',
          members: members || [],
          currentRound: 1,
          payoutSchedule: [],
          status: SavingsCircleStatus.ACTIVE,
        });

        await manager.save(circle);

        this.logger.debug(
          `Created SavingsCircle: ${circle.id} (circleId: ${circleId})`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling CircleCreatedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle CirclePayoutTriggeredEvent: Update SavingsCircle payout status
   */
  async onCirclePayoutTriggeredEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'circleId',
        'recipient',
        'amount',
      ]);

      const { circleId, recipient, amount, round } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const circle = await manager.findOne(SavingsCircle, {
          where: { circleId },
        });

        if (!circle) {
          this.logger.warn(
            `SavingsCircle not found for circleId: ${circleId}`,
          );
          return;
        }

        // Update payout schedule
        const schedule = circle.payoutSchedule || [];
        schedule.push({
          round: round || circle.currentRound,
          recipient,
          amount: amount.toString(),
          paidAt: event.timestamp,
        });

        circle.payoutSchedule = schedule;
        circle.currentRound = (circle.currentRound || 1) + 1;

        await manager.save(circle);

        this.logger.debug(
          `Updated SavingsCircle payout: ${circle.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling CirclePayoutTriggeredEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle RateLockCreatedEvent: Create RateLock entity
   */
  async onRateLockCreatedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'lockId',
        'lockedAmount',
        'fxRate',
        'expiryAt',
      ]);

      const { lockId, businessId, lockedAmount, fxRate, expiryAt } =
        event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const rateLock = manager.create(RateLock, {
          lockId,
          businessId,
          lockedAmount: BigInt(lockedAmount),
          fxRate: parseFloat(fxRate),
          expiryAt: new Date(parseInt(expiryAt) * 1000),
          status: RateLockStatus.ACTIVE,
        });

        await manager.save(rateLock);

        this.logger.debug(
          `Created RateLock: ${rateLock.id} (lockId: ${lockId})`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling RateLockCreatedEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle RateLockFilledEvent: Update RateLock status
   */
  async onRateLockFilledEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, ['lockId']);

      const { lockId } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const rateLock = await manager.findOne(RateLock, {
          where: { lockId },
        });

        if (!rateLock) {
          this.logger.warn(
            `RateLock not found for lockId: ${lockId}`,
          );
          return;
        }

        rateLock.status = RateLockStatus.USED;

        await manager.save(rateLock);

        this.logger.debug(
          `Updated RateLock status to USED: ${rateLock.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling RateLockFilledEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle RateLockExpiredEvent: Update RateLock status
   */
  async onRateLockExpiredEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, ['lockId']);

      const { lockId } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const rateLock = await manager.findOne(RateLock, {
          where: { lockId },
        });

        if (!rateLock) {
          this.logger.warn(
            `RateLock not found for lockId: ${lockId}`,
          );
          return;
        }

        rateLock.status = RateLockStatus.EXPIRED;

        await manager.save(rateLock);

        this.logger.debug(
          `Updated RateLock status to EXPIRED: ${rateLock.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling RateLockExpiredEvent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle BridgeCctpReceiveCompleted: Update CrossChainTransfer
   */
  async onBridgeCctpCompletedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'messageId',
        'receiver',
        'amount',
      ]);

      const { messageId, receiver, amount } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const transfer = await manager.findOne(CrossChainTransfer, {
          where: { messageId },
        });

        if (!transfer) {
          this.logger.warn(
            `CrossChainTransfer not found for messageId: ${messageId}`,
          );
          return;
        }

        transfer.status = CrossChainTransferStatus.RECEIVED;
        transfer.receivedAmount = BigInt(amount);
        transfer.receivedAt = new Date(event.timestamp);

        await manager.save(transfer);

        this.logger.debug(
          `Updated CrossChainTransfer status to RECEIVED: ${transfer.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling BridgeCctpReceiveCompleted: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Handle BridgeWormholeReceiveCompleted: Update CrossChainTransfer
   */
  async onBridgeWormholeCompletedEvent(event: ParsedEvent): Promise<void> {
    try {
      this.validateRequiredFields(event, [
        'messageId',
        'receiver',
        'amount',
      ]);

      const { messageId, receiver, amount } = event.parsedJson;

      await this.dataSource.transaction(async (manager) => {
        const transfer = await manager.findOne(CrossChainTransfer, {
          where: { messageId },
        });

        if (!transfer) {
          this.logger.warn(
            `CrossChainTransfer not found for messageId: ${messageId}`,
          );
          return;
        }

        transfer.status = CrossChainTransferStatus.RECEIVED;
        transfer.receivedAmount = BigInt(amount);
        transfer.receivedAt = new Date(event.timestamp);

        await manager.save(transfer);

        this.logger.debug(
          `Updated CrossChainTransfer status to RECEIVED: ${transfer.id}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Error handling BridgeWormholeReceiveCompleted: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Validate that required fields exist in event
   */
  private validateRequiredFields(
    event: ParsedEvent,
    requiredFields: string[],
  ): void {
    for (const field of requiredFields) {
      if (!(field in event.parsedJson)) {
        throw new Error(
          `Event missing required field: ${field} (type: ${event.eventType})`,
        );
      }
    }
  }

  /**
   * Manually sync a transaction by digest
   */
  async manualSyncTransaction(digest: string): Promise<StateSyncResult> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { onChainDigest: digest },
      });

      if (!transaction) {
        return {
          success: false,
          entityType: 'Transaction',
          error: 'Transaction not found',
          timestamp: Date.now(),
        };
      }

      // In a real implementation, this would query Sui RPC
      // For now, just return success
      return {
        success: true,
        entityType: 'Transaction',
        entityId: transaction.id,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        entityType: 'Transaction',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }
}
