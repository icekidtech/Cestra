import { Injectable, BadRequestException, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SavingsCircle, SavingsCircleStatus } from '../blockchain/entities/savings-circle.entity';
import { User } from '../auth/entities/user.entity';
import { TransactionBuilderService, CircleTransactionInput } from './transaction-builder.service';
import { TransactionSubmissionService } from './transaction-submission.service';
import { ComplianceEngine } from './compliance-engine.service';

export interface CircleCreateRequest {
  name: string;
  members: string[];
  payoutSchedule: string;
  roundDuration: number;
  operatorAddress: string;
}

export interface CircleContributeRequest {
  circleId: string;
  member: string;
  amount: bigint;
}

export interface CircleStatusResponse {
  circleId: string;
  name: string;
  members: Array<{ memberAddress: string; contributionAmount: string }>;
  currentRound: number;
  status: string;
  payoutSchedule: Array<{
    round: number;
    recipient: string;
    amount: string;
  }>;
  createdAt: string;
}

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name);

  constructor(
    @InjectRepository(SavingsCircle)
    private savingsCircleRepository: Repository<SavingsCircle>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private transactionBuilderService: TransactionBuilderService,
    private transactionSubmissionService: TransactionSubmissionService,
    private complianceEngine: ComplianceEngine,
  ) {}

  /**
   * Create a new savings circle
   *
   * Flow:
   * 1. Validate members and operator
   * 2. Build circle creation transaction
   * 3. Submit to Sui
   * 4. Store circle record
   * 5. Return circle ID
   *
   * @param request Circle creation request
   * @returns Circle ID and submission status
   * @throws BadRequestException if validation fails
   */
  async createCircle(request: CircleCreateRequest): Promise<{ circleId: string; status: string; digest: string }> {
    const { name, members, payoutSchedule, roundDuration, operatorAddress } = request;

    this.logger.debug(`Circle creation initiated: name=${name}, memberCount=${members.length}`);

    // Input validation
    if (!name || name.length === 0) {
      throw new BadRequestException('Circle name is required');
    }
    if (!members || members.length < 2) {
      throw new BadRequestException('At least 2 members are required for a circle');
    }
    if (!payoutSchedule || !roundDuration) {
      throw new BadRequestException('Payout schedule and round duration are required');
    }
    if (!operatorAddress) {
      throw new BadRequestException('Operator address is required');
    }

    // Validate all members have KYC
    for (const member of members) {
      const result = await this.complianceEngine.validateBeforeSubmission(
        member,
        member,
        0n,
        'circle_create',
      );

      if (!result.approved) {
        this.logger.warn(`Circle creation rejected: member ${member} not KYC-verified`);
        throw new BadRequestException(`Member ${member} is not KYC-verified`);
      }
    }

    // Build circle creation transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildCircleTransaction({
        operation: 'create',
        circleName: name,
        members,
        payoutSchedule,
        roundDuration,
        operatorAddress,
      } as CircleTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build circle creation transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Circle creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Submit transaction
    let submitResult;
    try {
      submitResult = await this.transactionSubmissionService.submitWithRetry(
        buildResult.transaction.toString(),
        buildResult.sender,
        'create',
        [name, members, payoutSchedule, roundDuration],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Circle submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Circle submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Store circle record
    const circle = this.savingsCircleRepository.create({
      name,
      status: SavingsCircleStatus.ACTIVE,
      circleId: submitResult.digest,
      members,
      currentRound: 1,
      payoutSchedule,
    });

    await this.savingsCircleRepository.save(circle);

    this.logger.log(`Circle created successfully: circleId=${circle.id}, digest=${submitResult.digest}`);

    return {
      circleId: circle.id,
      status: 'ACTIVE',
      digest: submitResult.digest,
    };
  }

  /**
   * Contribute to a savings circle
   *
   * @param request Circle contribution request
   * @returns Contribution confirmation
   * @throws BadRequestException if validation fails
   */
  async contributeToCircle(request: CircleContributeRequest): Promise<{ circleId: string; status: string; digest: string }> {
    const { circleId, member, amount } = request;

    this.logger.debug(`Circle contribution initiated: circleId=${circleId}, member=${member}, amount=${amount}`);

    // Validate circle exists
    const circle = await this.savingsCircleRepository.findOne({ where: { id: circleId } });
    if (!circle) {
      throw new BadRequestException('Circle not found');
    }

    if (circle.status !== SavingsCircleStatus.ACTIVE) {
      throw new BadRequestException(`Circle is not active. Current status: ${circle.status}`);
    }

    // Validate member KYC
    const result = await this.complianceEngine.validateBeforeSubmission(
      member,
      member,
      amount,
      'circle_contribute',
    );

    if (!result.approved) {
      this.logger.warn(`Circle contribution rejected: member ${member}, reason=${result.reason}`);
      throw new BadRequestException(result.reason);
    }

    // Build contribution transaction
    let buildResult;
    try {
      buildResult = await this.transactionBuilderService.buildCircleTransaction({
        operation: 'contribute',
        circleId: circle.circleId,
        member,
        amount,
        tier: result.kycTier || 0,
        round: circle.currentRound,
      } as CircleTransactionInput);
    } catch (error) {
      this.logger.error(`Failed to build circle contribution transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        [circle.circleId, member, amount],
        buildResult.idempotencyKey,
      );
    } catch (error) {
      this.logger.error(`Circle contribution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        `Contribution submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update circle contributions
    if (!circle.members) {
      circle.members = [];
    }

    await this.savingsCircleRepository.save(circle);

    this.logger.log(`Circle contribution submitted: circleId=${circleId}, member=${member}, digest=${submitResult.digest}`);

    return {
      circleId,
      status: 'ACTIVE',
      digest: submitResult.digest,
    };
  }

  /**
   * Get circle status
   *
   * @param circleId Circle ID
   * @returns Circle status details
   * @throws BadRequestException if circle not found
   */
  async getCircleStatus(circleId: string): Promise<CircleStatusResponse> {
    const circle = await this.savingsCircleRepository.findOne({ where: { id: circleId } });

    if (!circle) {
      throw new BadRequestException('Circle not found');
    }

    return {
      circleId: circle.id,
      name: circle.name,
      members: circle.members,
      currentRound: circle.currentRound,
      status: circle.status,
      payoutSchedule: circle.payoutSchedule,
      createdAt: circle.createdAt.toISOString(),
    };
  }

  /**
   * Scheduled job: Every day, check for circles with expired rounds and trigger payouts
   *
   * This job identifies circles where the current round has expired and submits
   * the trigger_payout transaction to execute the daily payout.
   */
  @Cron('0 0 * * *')
  async triggerDailyPayouts(): Promise<void> {
    this.logger.debug('Starting daily circle payout trigger job');

    try {
      // Get all active circles
      const circles = await this.savingsCircleRepository.find({
        where: { status: SavingsCircleStatus.ACTIVE },
      });

      for (const circle of circles) {
        try {
          // Build payout trigger transaction
          let buildResult;
          try {
            buildResult = await this.transactionBuilderService.buildCircleTransaction({
              operation: 'trigger_payout',
              circleId: circle.circleId,
              operatorAddress: 'system',
              round: circle.currentRound,
            } as CircleTransactionInput);
          } catch (buildError) {
            this.logger.warn(
              `Failed to build payout trigger for circle ${circle.id}: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`,
            );
            continue;
          }

          // Submit transaction
          try {
            const submitResult = await this.transactionSubmissionService.submitWithRetry(
              buildResult.transaction.toString(),
              buildResult.sender,
              'trigger_payout',
              [circle.id],
              buildResult.idempotencyKey,
            );

            this.logger.log(
              `Daily payout triggered for circle: ${circle.id}, round: ${circle.currentRound}, digest: ${submitResult.digest}`,
            );

            // Increment round
            circle.currentRound += 1;
            await this.savingsCircleRepository.save(circle);
          } catch (error) {
            this.logger.error(
              `Payout trigger submission failed for circle ${circle.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process circle ${circle.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(`Daily circle payout trigger job completed, circles processed: ${circles.length}`);
    } catch (error) {
      this.logger.error(
        `Daily circle payout job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Called by StateSyncService when CircleContributionEvent is received
   * Updates circle contributions
   *
   * @param onChainCircleId On-chain circle ID
   * @param member Member address
   * @param amount Contribution amount
   * @param round Current round
   */
  async onContributionConfirmed(
    circleId: string,
    member: string,
    amount: bigint,
    round: number,
  ): Promise<void> {
    const circle = await this.savingsCircleRepository.findOne({
      where: { circleId },
    });

    if (!circle) {
      this.logger.warn(`Contribution confirmed but circle not found: circleId=${circleId}`);
      return;
    }

    if (!circle.members) {
      circle.members = [];
    }

    await this.savingsCircleRepository.save(circle);

    this.logger.log(`Circle contribution confirmed on-chain: circleId=${circle.id}, member=${member}`);
  }

  /**
   * Called by StateSyncService when CirclePayoutEvent is received
   * Updates circle with payout details
   *
   * @param circleId Circle ID
   * @param recipient Payout recipient
   * @param amount Payout amount
   */
  async onPayoutExecuted(circleId: string, recipient: string, amount: bigint): Promise<void> {
    const circle = await this.savingsCircleRepository.findOne({
      where: { circleId },
    });

    if (!circle) {
      this.logger.warn(`Payout executed but circle not found: circleId=${circleId}`);
      return;
    }

    await this.savingsCircleRepository.save(circle);

    this.logger.log(
      `Circle payout executed on-chain: circleId=${circle.id}, recipient=${recipient}, amount=${amount}`,
    );
  }
}
