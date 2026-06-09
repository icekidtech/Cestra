import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Blacklist } from '../blockchain/entities/blacklist.entity';
import { OFACService } from './ofac-aml.service';

/**
 * Result of a compliance check
 */
export interface ComplianceResult {
  approved: boolean;
  reason?: string;
  kycTier?: number;
}

/**
 * OFAC/AML risk score result
 */
export interface OFACRiskScore {
  address: string;
  risk: number;
  details?: string;
}

/**
 * Compliance check context for audit logging
 */
export interface ComplianceContext {
  timestamp: Date;
  operation: string;
  sender?: string;
  recipient?: string;
  amount?: bigint;
  result: 'APPROVED' | 'REJECTED';
  kycTier?: number;
  checksPerformed: string[];
  failedCheck?: string;
  reason?: string;
}

/**
 * ComplianceEngine validates transactions against KYC tiers, transaction limits,
 * blacklist status, and OFAC/AML checks before blockchain submission.
 *
 * All compliance rules are fetched fresh on each call (no caching) to ensure
 * rule updates are applied immediately without requiring application restart.
 */
@Injectable()
export class ComplianceEngine {
  private readonly logger = new Logger(ComplianceEngine.name);

  // KYC tier limits in USDC base units (18 decimals)
  private readonly TIER_LIMITS = {
    1: BigInt(999_000_000), // Tier 1: $999
    2: BigInt(3_000_000_000), // Tier 2: $3,000
    3: BigInt(10_000_000_000), // Tier 3: $10,000
  };

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Blacklist)
    private readonly blacklistRepository: Repository<Blacklist>,
    private readonly ofacService: OFACService,
  ) {}

  /**
   * Validate a transaction before blockchain submission
   *
   * Checks in order:
   * 1. KYC tier verification (must be >= 1)
   * 2. Transaction limit validation (amount <= tier limit)
   * 3. Blacklist check (recipient not in blacklist)
   * 4. OFAC/AML check (async, with retry)
   *
   * Each check is performed fresh from the database (no caching) to ensure
   * rule updates apply immediately.
   *
   * @param sender Sui address of transaction sender
   * @param recipient Sui address of transaction recipient
   * @param amount Amount in USDC base units
   * @param transactionType Type of transaction (send, pool, ratelock)
   * @returns ComplianceResult with approval status and reason if rejected
   */
  async validateBeforeSubmission(
    sender: string,
    recipient: string,
    amount: bigint,
    transactionType: 'send' | 'pool' | 'ratelock',
  ): Promise<ComplianceResult> {
    const context: ComplianceContext = {
      timestamp: new Date(),
      operation: 'compliance_check',
      sender,
      recipient,
      amount,
      result: 'APPROVED',
      checksPerformed: [],
    };

    try {
      // 1. KYC Tier Validation
      context.checksPerformed.push('kyc_tier_check');
      const kycTierResult = await this.checkKYCTier(sender);
      if (!kycTierResult.approved) {
        context.result = 'REJECTED';
        context.failedCheck = 'kyc_tier_check';
        context.reason = kycTierResult.reason;
        this.logComplianceCheck(context);
        return kycTierResult;
      }
      context.kycTier = kycTierResult.kycTier;

      // 2. Transaction Limit Validation
      context.checksPerformed.push('transaction_limit_check');
      const limitResult = await this.checkTransactionLimit(
        sender,
        amount,
        context.kycTier,
      );
      if (!limitResult.approved) {
        context.result = 'REJECTED';
        context.failedCheck = 'transaction_limit_check';
        context.reason = limitResult.reason;
        this.logComplianceCheck(context);
        return limitResult;
      }

      // 3. Blacklist Check
      context.checksPerformed.push('blacklist_check');
      const blacklistResult = await this.checkBlacklist(recipient);
      if (!blacklistResult.approved) {
        context.result = 'REJECTED';
        context.failedCheck = 'blacklist_check';
        context.reason = blacklistResult.reason;
        this.logComplianceCheck(context);
        return blacklistResult;
      }

      // 4. OFAC/AML Check (async with retry)
      context.checksPerformed.push('ofac_check');
      const ofacResult = await this.checkOFAC(sender, recipient);
      if (!ofacResult.approved) {
        context.result = 'REJECTED';
        context.failedCheck = 'ofac_check';
        context.reason = ofacResult.reason;
        this.logComplianceCheck(context);
        return ofacResult;
      }

      // All checks passed
      context.result = 'APPROVED';
      this.logComplianceCheck(context);
      return {
        approved: true,
        kycTier: context.kycTier,
      };
    } catch (error) {
      this.logger.error(
        `Unexpected error in compliance validation: ${error.message}`,
        error.stack,
      );
      return {
        approved: false,
        reason: 'Compliance check failed unexpectedly',
      };
    }
  }

  /**
   * Check if sender has valid KYC tier (must be >= 1)
   *
   * @param sender Sui address of sender
   * @returns Result with approval status and KYC tier if approved
   */
  private async checkKYCTier(sender: string): Promise<ComplianceResult> {
    const user = await this.userRepository.findOne({
      where: { wallet_address: sender },
    });

    if (!user || user.kyc_tier === 0) {
      return {
        approved: false,
        reason: 'User not KYC-verified',
      };
    }

    return {
      approved: true,
      kycTier: user.kyc_tier,
    };
  }

  /**
   * Check if transaction amount is within KYC tier limit
   *
   * Tier 1: $999 USDC
   * Tier 2: $3,000 USDC
   * Tier 3: $10,000 USDC
   *
   * @param sender Sui address (used for getting KYC tier)
   * @param amount Amount in USDC base units
   * @param kycTier User's KYC tier
   * @returns Result with approval status
   */
  private async checkTransactionLimit(
    sender: string,
    amount: bigint,
    kycTier: number,
  ): Promise<ComplianceResult> {
    // Ensure tier is valid
    if (kycTier < 1 || kycTier > 3) {
      return {
        approved: false,
        reason: 'Invalid KYC tier',
      };
    }

    const limit = this.TIER_LIMITS[kycTier];
    if (amount > limit) {
      const limitUSD = this.formatUSDC(limit);
      const amountUSD = this.formatUSDC(amount);
      return {
        approved: false,
        reason: `Transaction exceeds KYC limit: ${amountUSD} > ${limitUSD}`,
      };
    }

    return { approved: true };
  }

  /**
   * Check if recipient is blacklisted
   *
   * @param recipient Sui address to check
   * @returns Result with approval status
   */
  private async checkBlacklist(recipient: string): Promise<ComplianceResult> {
    const blacklistedEntry = await this.blacklistRepository.findOne({
      where: {
        address: recipient,
        isActive: true,
      },
    });

    if (blacklistedEntry) {
      return {
        approved: false,
        reason: `Recipient is blacklisted: ${blacklistedEntry.reason}`,
      };
    }

    return { approved: true };
  }

  /**
   * Check sender and recipient against OFAC/AML provider
   *
   * Delegates to OFACService which handles retries with exponential backoff
   * (1s, 2s, 4s) on transient failures.
   *
   * @param sender Sui address of sender
   * @param recipient Sui address of recipient
   * @returns Result with approval status
   */
  private async checkOFAC(
    sender: string,
    recipient: string,
  ): Promise<ComplianceResult> {
    try {
      const isHighRiskSender = await this.ofacService.isHighRisk(sender);
      if (isHighRiskSender) {
        return {
          approved: false,
          reason: `Sender address flagged by AML check: ${sender}`,
        };
      }

      const isHighRiskRecipient = await this.ofacService.isHighRisk(recipient);
      if (isHighRiskRecipient) {
        return {
          approved: false,
          reason: `Recipient address flagged by AML check: ${recipient}`,
        };
      }

      return { approved: true };
    } catch (error) {
      // OFAC service handles its own retries and throws on failure
      this.logger.error(
        `OFAC check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        approved: false,
        reason: 'Compliance check unavailable, please try again',
      };
    }
  }

  /**
   * Get the KYC tier for a user (for on-chain enforcement)
   *
   * @param sender Sui address
   * @returns KYC tier (0-3)
   */
  async fetchKYCTier(sender: string): Promise<number> {
    const user = await this.userRepository.findOne({
      where: { wallet_address: sender },
    });
    return user?.kyc_tier ?? 0;
  }

  /**
   * Add an address to the blacklist
   *
   * @param address Sui address to blacklist
   * @param reason Reason for blacklisting
   * @param addedBy User ID of the user adding to blacklist
   */
  async addToBlacklist(
    address: string,
    reason: string,
    addedBy: string,
  ): Promise<Blacklist> {
    // Check if already exists
    const existing = await this.blacklistRepository.findOne({
      where: { address },
    });

    if (existing) {
      if (existing.isActive) {
        throw new Error(`Address already blacklisted: ${address}`);
      }
      // Re-activate existing entry
      existing.isActive = true;
      existing.removedAt = null;
      return await this.blacklistRepository.save(existing);
    }

    // Create new entry
    const entry = this.blacklistRepository.create({
      address,
      reason,
      addedById: addedBy,
      isActive: true,
    });

    return await this.blacklistRepository.save(entry);
  }

  /**
   * Remove an address from the blacklist
   *
   * @param address Sui address to remove
   */
  async removeFromBlacklist(address: string): Promise<void> {
    const entry = await this.blacklistRepository.findOne({
      where: { address },
    });

    if (!entry) {
      throw new Error(`Address not found in blacklist: ${address}`);
    }

    entry.isActive = false;
    entry.removedAt = new Date();
    await this.blacklistRepository.save(entry);
  }

  /**
   * Log compliance check for audit trail
   *
   * Structured JSON logging for compliance reporting and debugging.
   * All fields are included to enable comprehensive audit trails.
   *
   * @param context Compliance check context
   */
  private logComplianceCheck(context: ComplianceContext): void {
    const logData = {
      timestamp: context.timestamp.toISOString(),
      level: context.result === 'APPROVED' ? 'INFO' : 'WARN',
      service: 'ComplianceEngine',
      operation: context.operation,
      sender: context.sender,
      recipient: context.recipient,
      amount: context.amount?.toString(),
      result: context.result,
      kycTier: context.kycTier,
      checksPerformed: context.checksPerformed,
      failedCheck: context.failedCheck,
      reason: context.reason,
    };

    if (context.result === 'APPROVED') {
      this.logger.log(JSON.stringify(logData));
    } else {
      this.logger.warn(JSON.stringify(logData));
    }
  }

  /**
   * Format USDC amount (base units) as readable USD string
   *
   * @param amount Amount in USDC base units (18 decimals in Move, but we use 6 for display)
   * @returns Formatted USD string
   */
  private formatUSDC(amount: bigint): string {
    const usd = Number(amount) / 1_000_000;
    return `$${usd.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Helper to add timeout to async operations
   *
   * @param promise Promise to wrap
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that rejects if timeout exceeded
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Helper to delay execution
   *
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
