import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus } from '../blockchain/entities/transaction.entity';
import { User } from '../auth/entities/user.entity';
import { TransactionBuilderService, SendTransactionInput } from './transaction-builder.service';
import { TransactionSubmissionService } from './transaction-submission.service';
import { ComplianceEngine, ComplianceResult } from './compliance-engine.service';

export interface SendRequest {
  sender: string;
  recipient: string;
  amount: bigint;
  rateLockId?: string;
}

export interface SendResponse {
  transactionId: string;
  status: string;
  digest?: string;
  estimatedFee: string;
  createdAt: string;
}

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private transactionBuilderService: TransactionBuilderService,
    private transactionSubmissionService: TransactionSubmissionService,
    private complianceEngine: ComplianceEngine,
  ) {}

  /**
   * Initiate a send transaction with compliance validation
   * 
   * Flow:
   * 1. Validate compliance (KYC, limit, blacklist, OFAC)
   * 2. Fetch user and build transaction
   * 3. Submit to Sui with retry logic
   * 4. Return submission result to caller
   * 
   * @param request Send request with sender, recipient, amount
   * @returns Send response with transaction ID and status
   * @throws ForbiddenException if compliance validation fails
   * @throws BadRequestException if input validation fails
   */
  async initiateSend(request: SendRequest): Promise<SendResponse> {
    const { sender, recipient, amount } = request;

    this.logger.debug(`Send initiated: sender=${sender}, recipient=${recipient}, amount=${amount}`);

    // Input validation
    if (!sender || !recipient) {
      throw new BadRequestException('Sender and recipient addresses are required');
    }
    if (!amount || amount <= 0n) {
      throw new BadRequestException('Amount must be positive');
    }

    // Compliance validation: KYC, limits, blacklist, OFAC
    const complianceResult = await this.complianceEngine.validateBeforeSubmission(
      sender,
      recipient,
      amount,
      'send',
    );

    if (!complianceResult.approved) {
      this.logger.warn(
        `Send rejected by compliance: sender=${sender}, reason=${complianceResult.reason}`,
      );
      throw new ForbiddenException(complianceResult.reason);
    }

    // Fetch user for additional context
    const user = await this.userRepository.findOne({ where: { wallet_address: sender } });
    if (!user) {
      throw new BadRequestException('Sender user not found');
    }

    // Build Send transaction
    const buildResult = await this.transactionBuilderService.buildSendTransaction({
      sender,
      recipient,
      amount,
      tier: complianceResult.kycTier || 0,
    } as SendTransactionInput);

    // Calculate fee (0.80% of amount)
    const fee = (amount * 80n) / 10000n;

    // Submit transaction with retry logic
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        sender,
        'send',
        [recipient, amount.toString(), complianceResult.kycTier || 0],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Send submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(`Transaction submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Store transaction in database
    const txEntity = this.transactionRepository.create({
      sender,
      recipient,
      amount: BigInt(amount.toString()),
      fee,
      kycTier: complianceResult.kycTier || 0,
      status: TransactionStatus.SUBMITTED,
      onChainDigest: submitResult.digest,
      userId: user.id,
    });

    await this.transactionRepository.save(txEntity);

    this.logger.log(
      `Send submitted successfully: txId=${txEntity.id}, digest=${submitResult.digest}, amount=${amount}`,
    );

    return {
      transactionId: txEntity.id,
      status: 'SUBMITTED',
      digest: submitResult.digest,
      estimatedFee: fee.toString(),
      createdAt: txEntity.createdAt.toISOString(),
    };
  }

  /**
   * Query transaction status by ID
   * 
   * @param transactionId Transaction UUID
   * @returns Transaction details with current status
   * @throws BadRequestException if transaction not found
   */
  async getTransactionStatus(transactionId: string): Promise<any> {
    const tx = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new BadRequestException('Transaction not found');
    }

    return {
      id: tx.id,
      sender: tx.sender,
      recipient: tx.recipient,
      amount: tx.amount,
      fee: tx.fee,
      kycTier: tx.kycTier,
      status: tx.status,
      onChainDigest: tx.onChainDigest,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
    };
  }

  /**
   * Query transaction history with filtering
   * 
   * @param filter Optional sender, recipient, status
   * @param limit Pagination limit (default 20)
   * @param offset Pagination offset (default 0)
   * @returns Paginated transaction list
   */
  async getTransactionHistory(
    filter?: { sender?: string; recipient?: string; status?: string },
    limit = 20,
    offset = 0,
  ): Promise<any> {
    let query = this.transactionRepository.createQueryBuilder('tx');

    if (filter?.sender) {
      query = query.where('tx.sender = :sender', { sender: filter.sender });
    }

    if (filter?.recipient) {
      query = query.andWhere('tx.recipient = :recipient', { recipient: filter.recipient });
    }

    if (filter?.status) {
      query = query.andWhere('tx.status = :status', { status: filter.status });
    }

    const [items, total] = await query
      .orderBy('tx.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getManyAndCount();

    return {
      items: items.map((tx) => ({
        id: tx.id,
        sender: tx.sender,
        recipient: tx.recipient,
        amount: tx.amount,
        fee: tx.fee,
        status: tx.status,
        createdAt: tx.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Called by StateSyncService when SendEvent is received
   * Updates transaction with on-chain confirmation details
   * 
   * @param digest Transaction digest
   */
  async onSendConfirmed(digest: string): Promise<void> {
    const tx = await this.transactionRepository.findOne({
      where: { onChainDigest: digest },
    });

    if (!tx) {
      this.logger.warn(`SendEvent received but transaction not found: digest=${digest}`);
      return;
    }

    // Update transaction status - use enum value
    tx.status = TransactionStatus.CONFIRMED;
    tx.updatedAt = new Date();
    await this.transactionRepository.save(tx);

    this.logger.log(`Send confirmed on-chain: txId=${tx.id}, digest=${digest}`);
  }

  /**
   * Called by TransactionSubmissionService when Send fails
   * Updates transaction with failure details
   * 
   * @param digest Transaction digest
   * @param error Error reason
   */
  async onSendFailed(digest: string, error: string): Promise<void> {
    const tx = await this.transactionRepository.findOne({
      where: { onChainDigest: digest },
    });

    if (!tx) {
      this.logger.warn(`Send failure but transaction not found: digest=${digest}`);
      return;
    }

    // Update transaction status - use enum value
    tx.status = TransactionStatus.FAILED;
    tx.rootCause = error;
    tx.updatedAt = new Date();
    await this.transactionRepository.save(tx);

    this.logger.error(`Send failed: txId=${tx.id}, digest=${digest}, error=${error}`);
  }
}
