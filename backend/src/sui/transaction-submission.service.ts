import { Injectable, Logger, Inject, BadRequestException } from '@nestjs/common';
import { SUI_CLIENT } from './sui.module';
import { SuiClient } from '@mysten/sui';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingTransaction, PendingTransactionStatus } from '../blockchain/entities/pending-transaction.entity';
import { RetryStrategy } from './retry-strategy.service';

export interface TransactionReceipt {
  digest: string;
  status: 'success' | 'failure';
  sender: string;
  gasUsed: string;
  effects: any;
  events: any[];
  timestamp?: number;
  error?: string;
}

export interface SubmissionResult {
  digest: string;
  status: string;
  transactionId: string;
}

@Injectable()
export class TransactionSubmissionService {
  private readonly logger = new Logger(TransactionSubmissionService.name);

  constructor(
    @Inject(SUI_CLIENT) private suiClient: SuiClient,
    @InjectRepository(PendingTransaction)
    private pendingTransactionRepository: Repository<PendingTransaction>,
    private retryStrategy: RetryStrategy,
  ) {}

  /**
   * Submit a signed transaction to the Sui network
   */
  async submitTransaction(
    signedTxBytes: string,
    sender: string,
    functionName: string,
    arguments_: unknown[],
    idempotencyKey: string,
  ): Promise<SubmissionResult> {
    this.logger.debug(`Submitting transaction with idempotency key: ${idempotencyKey}`);

    const transactionId = idempotencyKey;

    // Store in PendingTransaction before submission
    let pendingTx = await this.pendingTransactionRepository.save({
      sender,
      function: functionName,
      arguments: arguments_,
      status: PendingTransactionStatus.SUBMITTED,
      idempotencyKey: idempotencyKey,
      signedTxBytes: signedTxBytes,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.debug(`Created pending transaction record: ${pendingTx.id}`);

    try {
      // Submit transaction to Sui RPC
      const receipt = await this.executeTransaction(signedTxBytes);

      this.logger.log(
        `Transaction submitted successfully. Digest: ${receipt.digest}, Status: ${receipt.status}`,
      );

      // Update PendingTransaction with receipt
      pendingTx.txDigest = receipt.digest;
      pendingTx.status = receipt.status === 'success' ? PendingTransactionStatus.CONFIRMED : PendingTransactionStatus.FAILED;
      pendingTx.errorMessage = receipt.error || null;
      pendingTx.updatedAt = new Date();
      await this.pendingTransactionRepository.save(pendingTx);

      return {
        transactionId: pendingTx.id,
        digest: receipt.digest,
        status: receipt.status === 'success' ? 'CONFIRMED' : 'FAILED',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Transaction submission failed: ${errorMessage}`);

      // Update PendingTransaction with error
      pendingTx.status = PendingTransactionStatus.FAILED;
      pendingTx.errorMessage = errorMessage;
      pendingTx.updatedAt = new Date();
      await this.pendingTransactionRepository.save(pendingTx);

      throw error;
    }
  }

  /**
   * Submit transaction with retry logic
   */
  async submitWithRetry(
    signedTxBytes: string,
    sender: string,
    functionName: string,
    arguments_: unknown[],
    idempotencyKey: string,
    maxRetries: number = 10,
  ): Promise<SubmissionResult> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.logger.debug(`Submission attempt ${attempt + 1}/${maxRetries}`);

        // Execute transaction
        const receipt = await this.executeTransaction(signedTxBytes);

        // Check if on-chain execution failed
        if (receipt.status === 'failure') {
          const classification = this.retryStrategy.classifyError({
            message: receipt.error,
          });

          if (classification === 'fatal') {
            this.logger.error(`Fatal error on-chain: ${receipt.error}`);
            throw new BadRequestException(`Transaction failed: ${receipt.error}`);
          }
        }

        if (receipt.status === 'success') {
          // Store successful submission
          const pendingTx = await this.pendingTransactionRepository.save({
            txDigest: receipt.digest,
            sender,
            function: functionName,
            arguments: arguments_,
            status: PendingTransactionStatus.CONFIRMED,
            idempotencyKey: idempotencyKey,
            signedTxBytes: signedTxBytes,
            retryCount: attempt,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          this.logger.log(
            `Transaction succeeded after ${attempt + 1} attempt(s). Digest: ${receipt.digest}`,
          );

          return {
            transactionId: pendingTx.id,
            digest: receipt.digest,
            status: 'CONFIRMED',
          };
        }
      } catch (error) {
        lastError = error;

        const classification = this.retryStrategy.classifyError(error);

        if (classification === 'fatal') {
          this.logger.error(`Fatal error (attempt ${attempt + 1}): ${error.message}`);
          throw error;
        }

        // Transient error - retry if not exhausted
        if (attempt < maxRetries - 1) {
          const delayMs = this.retryStrategy.getBackoffDelay(attempt);
          this.logger.warn(
            `Transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms: ${error.message}`,
          );

          // Sleep before retry
          await this.sleep(delayMs);
        }
      }
    }

    // All retries exhausted
    this.logger.error(`All ${maxRetries} retry attempts failed`);

    // Store failed transaction for recovery queue
    await this.pendingTransactionRepository.save({
      sender,
      function: functionName,
      arguments: arguments_,
      status: PendingTransactionStatus.FAILED,
      idempotencyKey: idempotencyKey,
      signedTxBytes: signedTxBytes,
      retryCount: maxRetries,
      errorMessage: lastError?.message,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    throw new BadRequestException(
      `Transaction submission failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`,
    );
  }

  /**
   * Execute a single transaction attempt
   */
  private async executeTransaction(signedTxBytes: string): Promise<TransactionReceipt> {
    try {
      const result = await this.suiClient.executeTransactionBlock({
        transactionBlock: signedTxBytes,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      const status = result.effects?.status?.status;
      const error = result.effects?.status?.error;

      if (status !== 'success' && status !== 'failure') {
        throw new Error(`Unexpected transaction status: ${status}`);
      }

      const gasUsed = result.effects?.gasUsed?.computationCost || '0';
      const events = result.events || [];
      const digest = result.digest;

      const receipt: TransactionReceipt = {
        digest,
        status: status as 'success' | 'failure',
        sender: result.transaction?.data?.sender || 'unknown',
        gasUsed,
        effects: result.effects,
        events,
        timestamp: result.timestampMs ? parseInt(result.timestampMs) : undefined,
        error: error || undefined,
      };

      return receipt;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Classify the error
      const classification = this.retryStrategy.classifyError(error);

      // Re-throw with classification context
      const enrichedError = new Error(
        `RPC execution failed: ${errorMessage} (${classification})`,
      );
      enrichedError['originalError'] = error;
      enrichedError['classification'] = classification;

      throw enrichedError;
    }
  }

  /**
   * Query the status of a pending transaction
   */
  async getTransactionStatus(
    transactionId: string,
  ): Promise<{ status: string; digest?: string; error?: string }> {
    const pendingTx = await this.pendingTransactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!pendingTx) {
      throw new BadRequestException(`Transaction not found: ${transactionId}`);
    }

    return {
      status: pendingTx.status,
      digest: pendingTx.txDigest || undefined,
      error: pendingTx.errorMessage || undefined,
    };
  }

  /**
   * Helper: Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
