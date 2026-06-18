import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SUI_CLIENT, SUI_KEYPAIR } from './sui.module';
import { SuiClient } from '@mysten/sui';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { BlockchainConfigService } from './blockchain-config.service';
import { v4 as uuidv4 } from 'uuid';

export interface TransactionBuildResult {
  transaction: Transaction;
  idempotencyKey: string;
  sender: string;
  functionPath: string;
  arguments: unknown[];
  gasbudget?: number;
}

export interface SendTransactionInput {
  sender: string;
  recipient: string;
  amount: bigint;
  tier: number;
  idempotencyKey?: string;
}

export interface PoolTransactionInput {
  operator: string;
  poolId: string;
  actionType: 'create' | 'contribute' | 'execute' | 'refund';
  contributors?: Array<{ address: string; amount: bigint }>;
  targetRecipients?: Array<{ address: string; amount: bigint }>;
  contributorAddress?: string;
  contributionAmount?: bigint;
  idempotencyKey?: string;
}

export interface YieldTransactionInput {
  user: string;
  vaultId: string;
  actionType: 'deposit' | 'withdraw';
  amount?: bigint;
  shares?: bigint;
  idempotencyKey?: string;
}

export interface CircleTransactionInput {
  member: string;
  circleId: string;
  actionType: 'create' | 'contribute';
  name?: string;
  members?: string[];
  payoutSchedule?: unknown[];
  contributionAmount?: bigint;
  idempotencyKey?: string;
}

export interface RateLockTransactionInput {
  business: string;
  lockedAmount: bigint;
  fxRate: string;
  expiryHours?: number;
  actionType: 'create' | 'expire';
  lockId?: string;
  idempotencyKey?: string;
}

export interface BridgeTransactionInput {
  receiver: string;
  amount: bigint;
  messageId: string;
  actionType: 'cctp' | 'wormhole';
  nonce?: string;
  burnProof?: string;
  attestation?: string;
  vaaBytes?: string;
  idempotencyKey?: string;
}

@Injectable()
export class TransactionBuilderService {
  private readonly logger = new Logger(TransactionBuilderService.name);

  constructor(
    @Inject(SUI_CLIENT) private suiClient: SuiClient,
    @Inject(SUI_KEYPAIR) private keypair: Ed25519Keypair,
    private blockchainConfigService: BlockchainConfigService,
  ) {}

  /**
   * Validate a Sui address format
   */
  private validateAddress(address: string, fieldName: string = 'address'): void {
    if (!address || typeof address !== 'string') {
      throw new BadRequestException(`${fieldName} must be a valid string`);
    }

    if (!address.startsWith('0x')) {
      throw new BadRequestException(
        `${fieldName} must start with 0x (received: ${address.substring(0, 10)}...)`,
      );
    }

    const hexPart = address.substring(2);
    if (!/^[0-9a-fA-F]*$/.test(hexPart)) {
      throw new BadRequestException(
        `${fieldName} must be a valid hex address (received: ${address.substring(0, 20)}...)`,
      );
    }
  }

  /**
   * Validate a positive amount
   */
  private validateAmount(amount: bigint, fieldName: string = 'amount'): void {
    if (typeof amount !== 'bigint' && typeof amount !== 'number') {
      throw new BadRequestException(
        `${fieldName} must be a positive integer (received: ${typeof amount})`,
      );
    }

    const amountBig = typeof amount === 'bigint' ? amount : BigInt(amount);
    if (amountBig <= 0n) {
      throw new BadRequestException(
        `${fieldName} must be positive (received: ${amount})`,
      );
    }

    // Check for u64 overflow
    if (amountBig > BigInt('18446744073709551615')) {
      throw new BadRequestException(
        `${fieldName} exceeds maximum uint64 value`,
      );
    }
  }

  /**
   * Validate a generic object ID (for pool_id, vault_id, etc.)
   */
  private validateObjectId(objectId: string, fieldName: string = 'objectId'): void {
    if (!objectId || typeof objectId !== 'string') {
      throw new BadRequestException(`${fieldName} must be a valid string`);
    }

    // Object IDs can start with 0x or be in other formats
    if (!/^0x[0-9a-fA-F]+$/.test(objectId)) {
      throw new BadRequestException(
        `${fieldName} must be a valid Sui object ID format (received: ${objectId.substring(0, 20)}...)`,
      );
    }
  }

  /**
   * Generate or use provided idempotency key
   */
  private getIdempotencyKey(provided?: string): string {
    if (provided) {
      if (typeof provided !== 'string' || provided.length === 0) {
        throw new BadRequestException('Invalid idempotency key format');
      }
      return provided;
    }
    return uuidv4();
  }

  /**
   * Build a Send transaction
   */
  async buildSendTransaction(input: SendTransactionInput): Promise<TransactionBuildResult> {
    // Validate inputs
    this.validateAddress(input.sender, 'sender');
    this.validateAddress(input.recipient, 'recipient');
    this.validateAmount(input.amount, 'amount');

    if (typeof input.tier !== 'number' || input.tier < 0 || input.tier > 3) {
      throw new BadRequestException('tier must be between 0 and 3');
    }

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath('send', 'sendPayment');
    const gasbudget = this.blockchainConfigService.getModuleConfig('send').gasbudget;

    this.logger.debug(
      `Building Send transaction: sender=${input.sender}, recipient=${input.recipient}, amount=${input.amount}`,
    );

    // Build transaction block
    const tx = new Transaction();
    tx.moveCall({
      target: functionPath,
      arguments: [
        tx.pure.address(input.sender),
        tx.pure.address(input.recipient),
        tx.pure.u64(input.amount),
        tx.pure.u8(input.tier),
      ],
    });

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.sender,
      functionPath,
      arguments: [input.sender, input.recipient, input.amount, input.tier],
      gasbudget,
    };
  }

  /**
   * Build a Pool transaction
   */
  async buildPoolTransaction(input: PoolTransactionInput): Promise<TransactionBuildResult> {
    // Validate inputs
    this.validateAddress(input.operator, 'operator');
    this.validateObjectId(input.poolId, 'poolId');

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'pool',
      input.actionType === 'create' ? 'createPool' : input.actionType,
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('pool').gasbudget;

    this.logger.debug(
      `Building Pool ${input.actionType} transaction for pool=${input.poolId}`,
    );

    const tx = new Transaction();

    switch (input.actionType) {
      case 'create':
        if (!input.targetRecipients || input.targetRecipients.length === 0) {
          throw new BadRequestException('targetRecipients must not be empty for pool creation');
        }

        for (const recipient of input.targetRecipients) {
          this.validateAddress(recipient.address, 'recipient.address');
          this.validateAmount(recipient.amount, 'recipient.amount');
        }

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.string(input.poolId),
            tx.pure.vector('address', input.targetRecipients.map(r => r.address)),
            tx.pure.vector('u64', input.targetRecipients.map(r => r.amount)),
          ],
        });
        break;

      case 'contribute':
        this.validateAddress(input.contributorAddress || input.operator, 'contributorAddress');
        this.validateAmount(input.contributionAmount || 0n, 'contributionAmount');

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.string(input.poolId),
            tx.pure.address(input.contributorAddress || input.operator),
            tx.pure.u64(input.contributionAmount || 0n),
          ],
        });
        break;

      case 'execute':
        tx.moveCall({
          target: functionPath,
          arguments: [tx.pure.string(input.poolId)],
        });
        break;

      case 'refund':
        tx.moveCall({
          target: functionPath,
          arguments: [tx.pure.string(input.poolId)],
        });
        break;

      default:
        throw new BadRequestException(`Unknown pool action type: ${input.actionType}`);
    }

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.operator,
      functionPath,
      arguments: [input.poolId, input.actionType],
      gasbudget,
    };
  }

  /**
   * Build a Yield transaction
   */
  async buildYieldTransaction(input: YieldTransactionInput): Promise<TransactionBuildResult> {
    this.validateAddress(input.user, 'user');
    this.validateObjectId(input.vaultId, 'vaultId');

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'yield',
      input.actionType === 'deposit' ? 'deposit' : 'withdraw',
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('yield').gasbudget;

    this.logger.debug(
      `Building Yield ${input.actionType} transaction for vault=${input.vaultId}`,
    );

    const tx = new Transaction();

    switch (input.actionType) {
      case 'deposit':
        if (!input.amount) {
          throw new BadRequestException('amount is required for deposit');
        }
        this.validateAmount(input.amount, 'amount');

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.address(input.user),
            tx.pure.string(input.vaultId),
            tx.pure.u64(input.amount),
          ],
        });
        break;

      case 'withdraw':
        if (!input.shares) {
          throw new BadRequestException('shares is required for withdrawal');
        }
        this.validateAmount(input.shares, 'shares');

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.address(input.user),
            tx.pure.string(input.vaultId),
            tx.pure.u64(input.shares),
          ],
        });
        break;

      default:
        throw new BadRequestException(`Unknown yield action type: ${input.actionType}`);
    }

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.user,
      functionPath,
      arguments: [input.user, input.vaultId, input.actionType],
      gasbudget,
    };
  }

  /**
   * Build a Circle transaction
   */
  async buildCircleTransaction(input: CircleTransactionInput): Promise<TransactionBuildResult> {
    this.validateAddress(input.member, 'member');
    this.validateObjectId(input.circleId, 'circleId');

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'circle',
      input.actionType === 'create' ? 'createCircle' : 'contribute',
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('circle').gasbudget;

    this.logger.debug(
      `Building Circle ${input.actionType} transaction for circle=${input.circleId}`,
    );

    const tx = new Transaction();

    switch (input.actionType) {
      case 'create':
        if (!input.members || input.members.length === 0) {
          throw new BadRequestException('members must not be empty for circle creation');
        }

        for (const member of input.members) {
          this.validateAddress(member, 'member');
        }

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.string(input.circleId),
            tx.pure.string(input.name || 'Savings Circle'),
            tx.pure.vector('address', input.members),
          ],
        });
        break;

      case 'contribute':
        if (!input.contributionAmount) {
          throw new BadRequestException('contributionAmount is required for contribution');
        }
        this.validateAmount(input.contributionAmount, 'contributionAmount');

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.string(input.circleId),
            tx.pure.address(input.member),
            tx.pure.u64(input.contributionAmount),
          ],
        });
        break;

      default:
        throw new BadRequestException(`Unknown circle action type: ${input.actionType}`);
    }

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.member,
      functionPath,
      arguments: [input.circleId, input.actionType],
      gasbudget,
    };
  }

  /**
   * Build a RateLock transaction
   */
  async buildRateLockTransaction(input: RateLockTransactionInput): Promise<TransactionBuildResult> {
    this.validateAddress(input.business, 'business');
    this.validateAmount(input.lockedAmount, 'lockedAmount');

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'ratelock',
      input.actionType === 'create' ? 'createRateLock' : 'expireLock',
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('ratelock').gasbudget;

    this.logger.debug(
      `Building RateLock ${input.actionType} transaction for business=${input.business}`,
    );

    const tx = new Transaction();

    switch (input.actionType) {
      case 'create':
        if (!input.fxRate || typeof input.fxRate !== 'string') {
          throw new BadRequestException('fxRate must be a valid string');
        }

        tx.moveCall({
          target: functionPath,
          arguments: [
            tx.pure.address(input.business),
            tx.pure.u64(input.lockedAmount),
            tx.pure.string(input.fxRate),
            tx.pure.u32(input.expiryHours || 24),
          ],
        });
        break;

      case 'expire':
        if (!input.lockId) {
          throw new BadRequestException('lockId is required for expire action');
        }
        this.validateObjectId(input.lockId, 'lockId');

        tx.moveCall({
          target: functionPath,
          arguments: [tx.pure.string(input.lockId)],
        });
        break;

      default:
        throw new BadRequestException(`Unknown ratelock action type: ${input.actionType}`);
    }

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.business,
      functionPath,
      arguments: [input.business, input.actionType],
      gasbudget,
    };
  }

  /**
   * Build a Bridge transaction (CCTP)
   */
  async buildBridgeCctpTransaction(input: BridgeTransactionInput): Promise<TransactionBuildResult> {
    this.validateAddress(input.receiver, 'receiver');
    this.validateAmount(input.amount, 'amount');

    if (!input.nonce || !input.burnProof || !input.attestation) {
      throw new BadRequestException('nonce, burnProof, and attestation are required for CCTP');
    }

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'bridge',
      'completeCctpReceive',
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('bridge').gasbudget;

    this.logger.debug(
      `Building Bridge CCTP completion transaction for receiver=${input.receiver}, amount=${input.amount}`,
    );

    const tx = new Transaction();
    tx.moveCall({
      target: functionPath,
      arguments: [
        tx.pure.u64(BigInt(input.nonce)),
        tx.pure.string(input.burnProof),
        tx.pure.string(input.attestation),
        tx.pure.address(input.receiver),
        tx.pure.u64(input.amount),
      ],
    });

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.receiver,
      functionPath,
      arguments: [input.nonce, input.burnProof, input.attestation, input.receiver, input.amount],
      gasbudget,
    };
  }

  /**
   * Build a Bridge transaction (Wormhole)
   */
  async buildBridgeWormholeTransaction(
    input: BridgeTransactionInput,
  ): Promise<TransactionBuildResult> {
    this.validateAddress(input.receiver, 'receiver');
    this.validateAmount(input.amount, 'amount');

    if (!input.vaaBytes) {
      throw new BadRequestException('vaaBytes is required for Wormhole');
    }

    const idempotencyKey = this.getIdempotencyKey(input.idempotencyKey);
    const functionPath = this.blockchainConfigService.getFunctionPath(
      'bridge',
      'completeWormholeReceive',
    );
    const gasbudget = this.blockchainConfigService.getModuleConfig('bridge').gasbudget;

    this.logger.debug(
      `Building Bridge Wormhole completion transaction for receiver=${input.receiver}, amount=${input.amount}`,
    );

    const tx = new Transaction();
    tx.moveCall({
      target: functionPath,
      arguments: [
        tx.pure.string(input.vaaBytes),
        tx.pure.address(input.receiver),
        tx.pure.u64(input.amount),
      ],
    });

    return {
      transaction: tx,
      idempotencyKey,
      sender: input.receiver,
      functionPath,
      arguments: [input.vaaBytes, input.receiver, input.amount],
      gasbudget,
    };
  }

  /**
   * Perform dry-run validation of a transaction
   */
  async dryRunTransaction(txBytes: string): Promise<{ gasUsed: string; status: string }> {
    this.logger.debug('Performing dry-run validation of transaction');

    try {
      const result = await this.suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      const status = result.effects?.status?.status;
      const gasUsed = result.effects?.gasUsed?.computationCost;

      if (status !== 'success') {
        const error = result.effects?.status?.error || 'Unknown error';
        this.logger.error(`Dry-run failed with status: ${status}, error: ${error}`);
        throw new BadRequestException(`Transaction validation failed: ${error}`);
      }

      this.logger.debug(`Dry-run succeeded with gas usage: ${gasUsed}`);
      return { gasUsed: gasUsed || '0', status };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Dry-run validation error: ${errorMessage}`);
      throw new BadRequestException(`Transaction validation error: ${errorMessage}`);
    }
  }
}
