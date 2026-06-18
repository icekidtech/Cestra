import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchPayout, BatchPayoutStatus } from '../blockchain/entities/batch-payout.entity';
import { User } from '../auth/entities/user.entity';
import { TransactionBuilderService, PoolTransactionInput } from './transaction-builder.service';
import { TransactionSubmissionService } from './transaction-submission.service';
import { ComplianceEngine } from './compliance-engine.service';

export interface PoolCreateRequest {
  name: string;
  recipients: Array<{ address: string; amount: bigint }>;
  operatorAddress: string;
}

export interface PoolContributeRequest {
  poolId: string;
  contributor: string;
  amount: bigint;
}

export interface PoolExecuteRequest {
  poolId: string;
  operatorAddress: string;
}

export interface PoolRefundRequest {
  poolId: string;
  operatorAddress: string;
}

export interface PoolStatusResponse {
  poolId: string;
  name: string;
  status: string;
  totalAmount: string;
  contributors: Array<{
    address: string;
    amount: string;
    timestamp: string;
  }>;
  recipients: Array<{
    address: string;
    targetAmount: string;
  }>;
  createdAt: string;
  executedAt?: string;
}

@Injectable()
export class PoolService {
  private readonly logger = new Logger(PoolService.name);

  constructor(
    @InjectRepository(BatchPayout)
    private batchPayoutRepository: Repository<BatchPayout>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private transactionBuilderService: TransactionBuilderService,
    private transactionSubmissionService: TransactionSubmissionService,
    private complianceEngine: ComplianceEngine,
  ) {}

  /**
   * Create a new pool for group payouts
   *
   * Flow:
   * 1. Validate all recipients are not blacklisted
   * 2. Build pool creation transaction
   * 3. Submit to Sui
   * 4. Store pool in database
   * 5. Return pool ID
   *
   * @param request Pool creation request
   * @returns Pool ID and submission status
   * @throws ForbiddenException if compliance validation fails
   * @throws BadRequestException if input validation fails
   */
  async createPool(request: PoolCreateRequest): Promise<{ poolId: string; status: string; digest: string }> {
    const { name, recipients, operatorAddress } = request;

    this.logger.debug(`Pool creation initiated: name=${name}, recipientCount=${recipients.length}`);

    // Input validation
    if (!name || name.length === 0) {
      throw new BadRequestException('Pool name is required');
    }
    if (!recipients || recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }
    if (!operatorAddress) {
      throw new BadRequestException('Operator address is required');
    }

    // Validate all recipients are not blacklisted
    for (const recipient of recipients) {
      const result = await this.complianceEngine.validateBeforeSubmission(
        operatorAddress,
        recipient.address,
        recipient.amount,
        'pool',
      );

      if (!result.approved) {
        this.logger.warn(
          `Pool creation rejected by compliance: recipient=${recipient.address}, reason=${result.reason}`,
        );
        throw new ForbiddenException(result.reason);
      }
    }

    // Build pool creation transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildPoolTransaction({
        operation: 'create',
        poolName: name,
        recipients: recipients.map((r) => ({ address: r.address, amount: r.amount })),
        operatorAddress,
      } as PoolTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build pool creation transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Pool creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'create',
        [name, recipients.map(r => r.address), recipients.map(r => r.amount)],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Pool submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Pool submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Store pool in database
    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0n);
    const pool = this.batchPayoutRepository.create({
      name,
      status: BatchPayoutStatus.ACTIVE,
      poolId: submitResult.digest,
      targetRecipients: recipients.map((r) => ({ recipient: r.address, amount: r.amount.toString() })),
      contributors: [],
      totalAmount,
    });

    await this.batchPayoutRepository.save(pool);

    this.logger.log(`Pool created successfully: poolId=${pool.id}, digest=${submitResult.digest}`);

    return {
      poolId: pool.id,
      status: 'ACTIVE',
      digest: submitResult.digest,
    };
  }

  /**
   * Contribute to an existing pool
   *
   * @param request Pool contribution request
   * @returns Contribution confirmation
   * @throws BadRequestException if pool not found or validation fails
   */
  async contributeToPool(request: PoolContributeRequest): Promise<{ poolId: string; status: string; digest: string }> {
    const { poolId, contributor, amount } = request;

    this.logger.debug(`Pool contribution initiated: poolId=${poolId}, contributor=${contributor}, amount=${amount}`);

    // Validate pool exists
    const pool = await this.batchPayoutRepository.findOne({ where: { id: poolId } });
    if (!pool) {
      throw new BadRequestException('Pool not found');
    }

    if (pool.status !== BatchPayoutStatus.ACTIVE) {
      throw new BadRequestException(`Pool is not active. Current status: ${pool.status}`);
    }

    // Validate contributor KYC
    const result = await this.complianceEngine.validateBeforeSubmission(
      contributor,
      pool.operatorAddress,
      amount,
      'pool_contribute',
    );

    if (!result.approved) {
      this.logger.warn(`Pool contribution rejected by compliance: contributor=${contributor}, reason=${result.reason}`);
      throw new ForbiddenException(result.reason);
    }

    // Build contribution transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildPoolTransaction({
        operation: 'contribute',
        poolId: pool.poolId,
        contributor,
        amount,
        tier: result.kycTier || 0,
      } as PoolTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build pool contribution transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Contribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'contribute',
        [pool.poolId, contributor, amount],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Pool contribution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Contribution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update pool contributors
    if (!pool.contributors) {
      pool.contributors = [];
    }
    pool.contributors.push({
      contributor,
      amount: amount.toString(),
    });

    await this.batchPayoutRepository.save(pool);

    this.logger.log(`Pool contribution submitted: poolId=${poolId}, contributor=${contributor}, digest=${submitResult.digest}`);

    return {
      poolId: pool.id,
      status: 'ACTIVE',
      digest: submitResult.digest,
    };
  }

  /**
   * Execute pool payouts
   *
   * @param request Pool execution request
   * @returns Execution confirmation
   * @throws BadRequestException if pool not found or validation fails
   */
  async executePool(request: PoolExecuteRequest): Promise<{ poolId: string; status: string; digest: string }> {
    const { poolId, operatorAddress } = request;

    this.logger.debug(`Pool execution initiated: poolId=${poolId}`);

    // Validate pool exists
    const pool = await this.batchPayoutRepository.findOne({ where: { id: poolId } });
    if (!pool) {
      throw new BadRequestException('Pool not found');
    }

    if (pool.status !== BatchPayoutStatus.ACTIVE) {
      throw new BadRequestException(`Pool is not active. Current status: ${pool.status}`);
    }

    // Build execution transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildPoolTransaction({
        operation: 'execute',
        poolId: pool.poolId,
        operatorAddress,
      } as PoolTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build pool execution transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'execute',
        [pool.poolId],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Pool execution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Execution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update pool status
    pool.status = BatchPayoutStatus.EXECUTING;
    pool.executedAt = new Date();
    await this.batchPayoutRepository.save(pool);

    this.logger.log(`Pool execution submitted: poolId=${poolId}, digest=${submitResult.digest}`);

    return {
      poolId: pool.id,
      status: 'EXECUTING',
      digest: submitResult.digest,
    };
  }

  /**
   * Refund pool contributions
   *
   * @param request Pool refund request
   * @returns Refund confirmation
   * @throws BadRequestException if pool not found or validation fails
   */
  async refundPool(request: PoolRefundRequest): Promise<{ poolId: string; status: string; digest: string }> {
    const { poolId, operatorAddress } = request;

    this.logger.debug(`Pool refund initiated: poolId=${poolId}`);

    // Validate pool exists
    const pool = await this.batchPayoutRepository.findOne({ where: { id: poolId } });
    if (!pool) {
      throw new BadRequestException('Pool not found');
    }

    // Build refund transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildPoolTransaction({
        operation: 'refund',
        poolId: pool.poolId,
        operatorAddress,
      } as PoolTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build pool refund transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Refund failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'refund',
        [pool.poolId],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Pool refund submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Refund submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update pool status
    pool.status = BatchPayoutStatus.REFUNDED;
    await this.batchPayoutRepository.save(pool);

    this.logger.log(`Pool refund submitted: poolId=${poolId}, digest=${submitResult.digest}`);

    return {
      poolId: pool.id,
      status: 'REFUNDED',
      digest: submitResult.digest,
    };
  }

  /**
   * Get pool status
   *
   * @param poolId Pool ID
   * @returns Pool status details
   * @throws BadRequestException if pool not found
   */
  async getPoolStatus(poolId: string): Promise<PoolStatusResponse> {
    const pool = await this.batchPayoutRepository.findOne({ where: { id: poolId } });

    if (!pool) {
      throw new BadRequestException('Pool not found');
    }

    return {
      poolId: pool.id,
      name: pool.name,
      status: pool.status,
      totalAmount: pool.totalAmount.toString(),
      contributors: pool.contributors || [],
      recipients: pool.targetRecipients || [],
      createdAt: pool.createdAt.toISOString(),
      executedAt: pool.executedAt ? pool.executedAt.toISOString() : undefined,
    };
  }

  /**
   * Called by StateSyncService when PoolExecuted event is received
   * Updates pool status to EXECUTED
   *
   * @param poolId Pool ID
   */
  async onPoolExecuted(poolId: string): Promise<void> {
    const pool = await this.batchPayoutRepository.findOne({
      where: { poolId },
    });

    if (!pool) {
      this.logger.warn(`PoolExecuted event received but pool not found: poolId=${poolId}`);
      return;
    }

    pool.status = BatchPayoutStatus.EXECUTED;
    pool.executedAt = new Date();
    await this.batchPayoutRepository.save(pool);

    this.logger.log(`Pool executed on-chain: poolId=${pool.id}, poolId=${poolId}`);
  }
}
