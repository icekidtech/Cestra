import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { YieldDeposit, YieldDepositStatus } from '../blockchain/entities/yield-deposit.entity';
import { User } from '../auth/entities/user.entity';
import { TransactionBuilderService, YieldTransactionInput } from './transaction-builder.service';
import { TransactionSubmissionService } from './transaction-submission.service';
import { ComplianceEngine } from './compliance-engine.service';

export interface YieldDepositRequest {
  user: string;
  vaultId: string;
  amount: bigint;
}

export interface YieldWithdrawRequest {
  depositId: string;
  user: string;
  shares: bigint;
}

export interface YieldDepositResponse {
  depositId: string;
  vaultId: string;
  depositAmount: string;
  shares: string;
  accruedValue: string;
  status: string;
  depositedAt: string;
}

@Injectable()
export class YieldService {
  private readonly logger = new Logger(YieldService.name);

  constructor(
    @InjectRepository(YieldDeposit)
    private yieldDepositRepository: Repository<YieldDeposit>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private transactionBuilderService: TransactionBuilderService,
    private transactionSubmissionService: TransactionSubmissionService,
    private complianceEngine: ComplianceEngine,
  ) {}

  /**
   * Deposit to yield vault
   *
   * Flow:
   * 1. Validate user and compliance
   * 2. Build deposit transaction
   * 3. Submit to Sui
   * 4. Store deposit record
   * 5. Return deposit ID
   *
   * @param request Deposit request
   * @returns Deposit response
   * @throws BadRequestException if validation fails
   */
  async deposit(request: YieldDepositRequest): Promise<YieldDepositResponse> {
    const { user: userAddress, vaultId, amount } = request;

    this.logger.debug(`Yield deposit initiated: user=${userAddress}, vault=${vaultId}, amount=${amount}`);

    // Input validation
    if (!userAddress || !vaultId || !amount || amount <= 0n) {
      throw new BadRequestException('User address, vault ID, and positive amount are required');
    }

    // Validate user KYC
    const result = await this.complianceEngine.validateBeforeSubmission(
      userAddress,
      userAddress,
      amount,
      'yield_deposit',
    );

    if (!result.approved) {
      this.logger.warn(`Yield deposit rejected by compliance: user=${userAddress}, reason=${result.reason}`);
      throw new BadRequestException(result.reason);
    }

    // Fetch user
    const userEntity = await this.userRepository.findOne({ where: { wallet_address: userAddress } });
    if (!userEntity) {
      throw new BadRequestException('User not found');
    }

    // Build deposit transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildYieldTransaction({
        operation: 'deposit',
        user: userAddress,
        vaultId,
        amount,
        tier: result.kycTier || 0,
      } as any);
    } catch (error) {
      this.logger.error(`Failed to build yield deposit transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'deposit',
        [userAddress, vaultId, amount],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Yield deposit submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Deposit submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Store deposit record
    const deposit = this.yieldDepositRepository.create({
      userId: userEntity.id,
      vaultId,
      amount,
      shares: amount,
      accruedValue: amount,
      status: YieldDepositStatus.ACTIVE,
      depositedAt: new Date(),
    });

    await this.yieldDepositRepository.save(deposit);

    this.logger.log(`Yield deposit submitted: depositId=${deposit.id}, digest=${submitResult.digest}`);

    return {
      depositId: deposit.id,
      vaultId,
      depositAmount: amount.toString(),
      shares: amount.toString(),
      accruedValue: amount.toString(),
      status: 'ACTIVE',
      depositedAt: deposit.createdAt.toISOString(),
    };
  }

  /**
   * Withdraw from yield vault
   *
   * @param request Withdrawal request
   * @returns Withdrawal confirmation
   * @throws BadRequestException if validation fails
   */
  async withdraw(request: YieldWithdrawRequest): Promise<{ depositId: string; status: string; digest: string }> {
    const { depositId, user: userAddress, shares } = request;

    this.logger.debug(`Yield withdrawal initiated: depositId=${depositId}, shares=${shares}`);

    // Validate deposit exists
    const deposit = await this.yieldDepositRepository.findOne({ where: { id: depositId } });
    if (!deposit) {
      throw new BadRequestException('Deposit not found');
    }

    if (deposit.status !== YieldDepositStatus.ACTIVE) {
      throw new BadRequestException(`Deposit is not active. Current status: ${deposit.status}`);
    }

    // Build withdrawal transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildYieldTransaction({
        operation: 'withdraw',
        depositId,
        user: userAddress,
        shares,
      } as any);
    } catch (error) {
      this.logger.error(`Failed to build yield withdrawal transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'withdraw',
        [depositId, userAddress, shares],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Yield withdrawal submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Withdrawal submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update deposit status
    deposit.status = YieldDepositStatus.WITHDRAWN;
    deposit.withdrawnAt = new Date();
    await this.yieldDepositRepository.save(deposit);

    this.logger.log(`Yield withdrawal submitted: depositId=${depositId}, digest=${submitResult.digest}`);

    return {
      depositId,
      status: 'WITHDRAWN',
      digest: submitResult.digest,
    };
  }

  /**
   * Get active deposits for a user
   *
   * @param userAddress User wallet address
   * @returns List of active deposits
   */
  async getActiveDeposits(userAddress: string): Promise<YieldDepositResponse[]> {
    const user = await this.userRepository.findOne({ where: { wallet_address: userAddress } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const deposits = await this.yieldDepositRepository.find({
      where: { userId: user.id, status: YieldDepositStatus.ACTIVE },
    });

    return deposits.map((d) => ({
      depositId: d.id,
      vaultId: d.vaultId,
      depositAmount: d.amount.toString(),
      shares: d.shares.toString(),
      accruedValue: d.accruedValue.toString(),
      status: d.status,
      depositedAt: d.createdAt.toISOString(),
    }));
  }

  /**
   * Scheduled job: Every hour, accrue interest to all active yield deposits
   *
   * This job calls the on-chain accrue_interest function and updates all deposits
   * with the latest accrued values from the Sui blockchain.
   */
  @Cron('0 * * * *')
  async accrueInterest(): Promise<void> {
    this.logger.debug('Starting hourly yield interest accrual job');

    try {
      // Get all active deposits
      const deposits = await this.yieldDepositRepository.find({
        where: { status: YieldDepositStatus.ACTIVE },
      });

      if (deposits.length === 0) {
        this.logger.debug('No active deposits to accrue');
        return;
      }

      // Build accrual transaction
      let buildResult;
      try {
        buildResult = await this.transactionBuilderService.buildYieldTransaction({
          operation: 'accrue_interest',
          vaultIds: deposits.map((d) => d.vaultId),
        } as any);
      } catch (buildError) {
        this.logger.error(`Failed to build yield accrual transaction: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`);
        return;
      }

      // Submit transaction
      try {
        await this.transactionSubmissionService.submitWithRetry(
          buildResult.transaction.toString(),
          buildResult.sender,
          'accrue_interest',
          [deposits.map((d) => d.vaultId)],
          buildResult.idempotencyKey,
        );

        this.logger.log(`Hourly yield accrual submitted successfully, deposits count: ${deposits.length}`);
      } catch (error) {
        this.logger.error(`Yield accrual submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error(
        `Hourly yield accrual job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Called by StateSyncService when YieldDepositedEvent is received
   * Creates yield deposit record
   *
   * @param userAddress User wallet address
   * @param vaultId Vault ID
   * @param amount Deposit amount
   * @param shares Share count
   * @param digest Transaction digest
   */
  async onDepositConfirmed(
    userAddress: string,
    vaultId: string,
    amount: bigint,
    shares: bigint,
    digest: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { wallet_address: userAddress } });
    if (!user) {
      this.logger.warn(`Deposit confirmed but user not found: address=${userAddress}`);
      return;
    }

    const deposit = this.yieldDepositRepository.create({
      userId: user.id,
      vaultId,
      amount,
      shares,
      accruedValue: amount,
      status: YieldDepositStatus.ACTIVE,
      depositedAt: new Date(),
    });

    await this.yieldDepositRepository.save(deposit);

    this.logger.log(`Yield deposit confirmed on-chain: depositId=${deposit.id}, digest=${digest}`);
  }

  /**
   * Called by StateSyncService when accrual is updated
   * Updates deposit accrued values
   *
   * @param vaultId Vault ID
   * @param accruedValues Map of deposit ID to accrued value
   */
  async onAccrualUpdated(vaultId: string, accruedValues: Map<string, bigint>): Promise<void> {
    const deposits = await this.yieldDepositRepository.find({
      where: { vaultId, status: YieldDepositStatus.ACTIVE },
    });

    for (const deposit of deposits) {
      const accrued = accruedValues.get(deposit.id);
      if (accrued !== undefined) {
        deposit.accruedValue = accrued;
        await this.yieldDepositRepository.save(deposit);
      }
    }

    this.logger.log(`Yield accrual updated for vault: ${vaultId}, deposits updated: ${deposits.length}`);
  }

  /**
   * Called by StateSyncService when YieldWithdrawnEvent is received
   * Updates deposit status to WITHDRAWN
   *
   * @param depositId Deposit ID
   */
  async onWithdrawalConfirmed(depositId: string): Promise<void> {
    const deposit = await this.yieldDepositRepository.findOne({ where: { id: depositId } });

    if (!deposit) {
      this.logger.warn(`Withdrawal confirmed but deposit not found: depositId=${depositId}`);
      return;
    }

    deposit.status = YieldDepositStatus.WITHDRAWN;
    deposit.withdrawnAt = new Date();
    await this.yieldDepositRepository.save(deposit);

    this.logger.log(`Yield withdrawal confirmed on-chain: depositId=${depositId}`);
  }
}
