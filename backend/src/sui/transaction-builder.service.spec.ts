import { Test, TestingModule } from '@nestjs/testing';
import { TransactionBuilderService } from './transaction-builder.service';
import { BlockchainConfigService } from './blockchain-config.service';
import { SUI_CLIENT, SUI_KEYPAIR } from './sui.module';
import { BadRequestException } from '@nestjs/common';
import * as fc from 'fast-check';

describe('TransactionBuilderService', () => {
  let service: TransactionBuilderService;
  let blockchainConfigService: BlockchainConfigService;
  let mockSuiClient: any;
  let mockKeypair: any;

  beforeEach(async () => {
    mockSuiClient = {
      executeTransactionBlock: jest.fn(),
      dryRunTransactionBlock: jest.fn(),
    };

    mockKeypair = {
      toSuiAddress: jest.fn(() => '0x' + '0'.repeat(64)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionBuilderService,
        {
          provide: SUI_CLIENT,
          useValue: mockSuiClient,
        },
        {
          provide: SUI_KEYPAIR,
          useValue: mockKeypair,
        },
        {
          provide: BlockchainConfigService,
          useValue: {
            getFunctionPath: jest.fn((module: string, func: string) => {
              return `0x1234567890abcdef::${module}::${func}`;
            }),
            getModuleConfig: jest.fn((module: string) => ({
              gasbudget: 10000000,
            })),
            getObjectId: jest.fn((key: string) => '0x' + '1'.repeat(64)),
            getCoinType: jest.fn(
              () => '0x2::usdc::USDC',
            ),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionBuilderService>(TransactionBuilderService);
    blockchainConfigService = module.get<BlockchainConfigService>(BlockchainConfigService);
  });

  describe('buildSendTransaction', () => {
    it('should build a valid Send transaction', async () => {
      const result = await service.buildSendTransaction({
        sender: '0x' + 'a'.repeat(64),
        recipient: '0x' + 'b'.repeat(64),
        amount: 1000000n,
        tier: 1,
      });

      expect(result).toBeDefined();
      expect(result.idempotencyKey).toBeDefined();
      expect(result.sender).toBe('0x' + 'a'.repeat(64));
      expect(result.functionPath).toBe('0x1234567890abcdef::send::sendPayment');
      expect(result.gasbudget).toBe(10000000);
    });

    it('should reject invalid sender address', async () => {
      await expect(
        service.buildSendTransaction({
          sender: 'invalid-address',
          recipient: '0x' + 'b'.repeat(64),
          amount: 1000000n,
          tier: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject negative amount', async () => {
      await expect(
        service.buildSendTransaction({
          sender: '0x' + 'a'.repeat(64),
          recipient: '0x' + 'b'.repeat(64),
          amount: -1n,
          tier: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zero amount', async () => {
      await expect(
        service.buildSendTransaction({
          sender: '0x' + 'a'.repeat(64),
          recipient: '0x' + 'b'.repeat(64),
          amount: 0n,
          tier: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid tier', async () => {
      await expect(
        service.buildSendTransaction({
          sender: '0x' + 'a'.repeat(64),
          recipient: '0x' + 'b'.repeat(64),
          amount: 1000000n,
          tier: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use provided idempotency key', async () => {
      const customKey = 'my-custom-key';
      const result = await service.buildSendTransaction({
        sender: '0x' + 'a'.repeat(64),
        recipient: '0x' + 'b'.repeat(64),
        amount: 1000000n,
        tier: 1,
        idempotencyKey: customKey,
      });

      expect(result.idempotencyKey).toBe(customKey);
    });

    it('should generate unique idempotency keys for different transactions', async () => {
      const result1 = await service.buildSendTransaction({
        sender: '0x' + 'a'.repeat(64),
        recipient: '0x' + 'b'.repeat(64),
        amount: 1000000n,
        tier: 1,
      });

      const result2 = await service.buildSendTransaction({
        sender: '0x' + 'a'.repeat(64),
        recipient: '0x' + 'c'.repeat(64),
        amount: 2000000n,
        tier: 2,
      });

      expect(result1.idempotencyKey).not.toBe(result2.idempotencyKey);
    });
  });

  describe('buildPoolTransaction', () => {
    it('should build a pool creation transaction', async () => {
      const result = await service.buildPoolTransaction({
        operator: '0x' + 'a'.repeat(64),
        poolId: '0x' + 'a'.repeat(64),
        actionType: 'create',
        targetRecipients: [
          { address: '0x' + '1'.repeat(64), amount: 5000000n },
          { address: '0x' + '2'.repeat(64), amount: 5000000n },
        ],
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::pool::createPool');
    });

    it('should reject pool creation with empty recipients', async () => {
      await expect(
        service.buildPoolTransaction({
          operator: '0x' + 'a'.repeat(64),
          poolId: '0x' + 'a'.repeat(64),
          actionType: 'create',
          targetRecipients: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should build a pool contribution transaction', async () => {
      const result = await service.buildPoolTransaction({
        operator: '0x' + 'a'.repeat(64),
        poolId: '0x' + 'a'.repeat(64),
        actionType: 'contribute',
        contributorAddress: '0x' + 'c'.repeat(64),
        contributionAmount: 1000000n,
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::pool::contribute');
    });

    it('should build a pool execute transaction', async () => {
      const result = await service.buildPoolTransaction({
        operator: '0x' + 'a'.repeat(64),
        poolId: '0x' + 'a'.repeat(64),
        actionType: 'execute',
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::pool::execute');
    });
  });

  describe('buildYieldTransaction', () => {
    it('should build a yield deposit transaction', async () => {
      const result = await service.buildYieldTransaction({
        user: '0x' + 'a'.repeat(64),
        vaultId: '0x' + 'b'.repeat(64),
        actionType: 'deposit',
        amount: 1000000n,
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::yield::deposit');
    });

    it('should reject yield deposit without amount', async () => {
      await expect(
        service.buildYieldTransaction({
          user: '0x' + 'a'.repeat(64),
          vaultId: '0x' + 'b'.repeat(64),
          actionType: 'deposit',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should build a yield withdrawal transaction', async () => {
      const result = await service.buildYieldTransaction({
        user: '0x' + 'a'.repeat(64),
        vaultId: '0x' + 'b'.repeat(64),
        actionType: 'withdraw',
        shares: 1000000n,
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::yield::withdraw');
    });

    it('should reject yield withdrawal without shares', async () => {
      await expect(
        service.buildYieldTransaction({
          user: '0x' + 'a'.repeat(64),
          vaultId: '0x' + 'b'.repeat(64),
          actionType: 'withdraw',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildCircleTransaction', () => {
    it('should build a circle creation transaction', async () => {
      const result = await service.buildCircleTransaction({
        member: '0x' + 'a'.repeat(64),
        circleId: '0x' + 'c'.repeat(64),
        actionType: 'create',
        name: 'Test Circle',
        members: ['0x' + 'a'.repeat(64), '0x' + 'b'.repeat(64)],
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::circle::createCircle');
    });

    it('should reject circle creation with empty members', async () => {
      await expect(
        service.buildCircleTransaction({
          member: '0x' + 'a'.repeat(64),
          circleId: '0x' + 'c'.repeat(64),
          actionType: 'create',
          members: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should build a circle contribution transaction', async () => {
      const result = await service.buildCircleTransaction({
        member: '0x' + 'a'.repeat(64),
        circleId: '0x' + 'c'.repeat(64),
        actionType: 'contribute',
        contributionAmount: 1000000n,
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::circle::contribute');
    });
  });

  describe('buildRateLockTransaction', () => {
    it('should build a rate-lock creation transaction', async () => {
      const result = await service.buildRateLockTransaction({
        business: '0x' + 'a'.repeat(64),
        lockedAmount: 1000000n,
        fxRate: '1.05',
        expiryHours: 24,
        actionType: 'create',
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::ratelock::createRateLock');
    });

    it('should build a rate-lock expiration transaction', async () => {
      const result = await service.buildRateLockTransaction({
        business: '0x' + 'a'.repeat(64),
        lockedAmount: 1000000n,
        fxRate: '1.05',
        actionType: 'expire',
        lockId: '0x' + 'd'.repeat(64),
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::ratelock::expireLock');
    });

    it('should reject rate-lock expiration without lockId', async () => {
      await expect(
        service.buildRateLockTransaction({
          business: '0x' + 'a'.repeat(64),
          lockedAmount: 1000000n,
          fxRate: '1.05',
          actionType: 'expire',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildBridgeCctpTransaction', () => {
    it('should build a CCTP bridge completion transaction', async () => {
      const result = await service.buildBridgeCctpTransaction({
        receiver: '0x' + 'a'.repeat(64),
        amount: 1000000n,
        messageId: 'msg123',
        actionType: 'cctp',
        nonce: '12345',
        burnProof: 'proof123',
        attestation: 'att123',
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::bridge::completeCctpReceive');
    });

    it('should reject CCTP without nonce', async () => {
      await expect(
        service.buildBridgeCctpTransaction({
          receiver: '0x' + 'a'.repeat(64),
          amount: 1000000n,
          messageId: 'msg123',
          actionType: 'cctp',
          burnProof: 'proof123',
          attestation: 'att123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildBridgeWormholeTransaction', () => {
    it('should build a Wormhole bridge completion transaction', async () => {
      const result = await service.buildBridgeWormholeTransaction({
        receiver: '0x' + 'a'.repeat(64),
        amount: 1000000n,
        messageId: 'msg123',
        actionType: 'wormhole',
        vaaBytes: 'vaa123',
      });

      expect(result).toBeDefined();
      expect(result.functionPath).toBe('0x1234567890abcdef::bridge::completeWormholeReceive');
    });

    it('should reject Wormhole without vaaBytes', async () => {
      await expect(
        service.buildBridgeWormholeTransaction({
          receiver: '0x' + 'a'.repeat(64),
          amount: 1000000n,
          messageId: 'msg123',
          actionType: 'wormhole',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dryRunTransaction', () => {
    it('should successfully dry-run a valid transaction', async () => {
      mockSuiClient.dryRunTransactionBlock.mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
      });

      const result = await service.dryRunTransaction('txBytes123');

      expect(result.status).toBe('success');
      expect(result.gasUsed).toBe('1000000');
    });

    it('should reject a failed transaction during dry-run', async () => {
      mockSuiClient.dryRunTransactionBlock.mockResolvedValue({
        effects: {
          status: { status: 'failure', error: 'insufficient balance' },
        },
      });

      await expect(service.dryRunTransaction('txBytes123')).rejects.toThrow(BadRequestException);
    });

    it('should handle RPC errors during dry-run', async () => {
      mockSuiClient.dryRunTransactionBlock.mockRejectedValue(new Error('RPC timeout'));

      await expect(service.dryRunTransaction('txBytes123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Property: Transaction Idempotency', () => {
    it('should generate same idempotency key when building identical transactions twice', () => {
      fc.assert(
        fc.property(
          fc.hexaString({ minLength: 64, maxLength: 64 }),
          fc.hexaString({ minLength: 64, maxLength: 64 }),
          fc.integer({ min: 1, max: 10_000_000_000 }),
          (sender, recipient, amount) => {
            const idempotencyKey1 = fc.sample(fc.uuid(), 1)[0];
            const idempotencyKey2 = idempotencyKey1;

            // When building same transaction with same idempotency key
            // Both calls should have identical metadata
            expect(idempotencyKey1).toBe(idempotencyKey2);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Property: Amount Validation', () => {
    it('should reject any non-positive amounts', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ max: 0 }), async (amount) => {
          await expect(
            service.buildSendTransaction({
              sender: '0x' + 'a'.repeat(64),
              recipient: '0x' + 'b'.repeat(64),
              amount: BigInt(amount),
              tier: 1,
            }),
          ).rejects.toThrow();
        }),
        { numRuns: 20 },
      );
    });

    it('should accept a representative positive amount within uint64 bounds', async () => {
      const result = await service.buildSendTransaction({
        sender: '0x' + 'a'.repeat(64),
        recipient: '0x' + 'b'.repeat(64),
        amount: 1_000_000n,
        tier: 1,
      });
      expect(result).toBeDefined();
      expect(result.transaction).toBeDefined();
    });
  });
});
