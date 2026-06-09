import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ComplianceEngine, ComplianceResult } from './compliance-engine.service';
import { OFACService } from './ofac-aml.service';
import { User } from '../auth/entities/user.entity';
import { Blacklist } from '../blockchain/entities/blacklist.entity';

describe('ComplianceEngine', () => {
  let service: ComplianceEngine;
  let userRepository: Repository<User>;
  let blacklistRepository: Repository<Blacklist>;
  let ofacService: OFACService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceEngine,
        OFACService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                OFAC_API_URL: undefined,
                OFAC_API_KEY: undefined,
                OFAC_PROVIDER: 'chainalysis',
                OFAC_MAX_RETRIES: 3,
                OFAC_TIMEOUT_MS: 30000,
              };
              return config[key] !== undefined ? config[key] : defaultValue;
            }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Blacklist),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ComplianceEngine>(ComplianceEngine);
    ofacService = module.get<OFACService>(OFACService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    blacklistRepository = module.get<Repository<Blacklist>>(
      getRepositoryToken(Blacklist),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBeforeSubmission', () => {
    const sender = '0x' + '1'.repeat(64);
    const recipient = '0x' + '2'.repeat(64);
    const amount = BigInt(500_000_000); // $500

    it('should reject transaction if user has KYC tier 0', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('User not KYC-verified');
    });

    it('should reject transaction if amount exceeds KYC tier 1 limit', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 1 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const excessAmount = BigInt(1_500_000_000); // $1,500 > $999 limit

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        excessAmount,
        'send',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('exceeds KYC limit');
    });

    it('should allow transaction if amount is within KYC tier 1 limit', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 1 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const validAmount = BigInt(500_000_000); // $500 < $999 limit

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        validAmount,
        'send',
      );

      expect(result.approved).toBe(true);
      expect(result.kycTier).toBe(1);
    });

    it('should allow transaction if amount is within KYC tier 2 limit', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const validAmount = BigInt(2_000_000_000); // $2,000 < $3,000 limit

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        validAmount,
        'send',
      );

      expect(result.approved).toBe(true);
      expect(result.kycTier).toBe(2);
    });

    it('should allow transaction if amount is within KYC tier 3 limit', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 3 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const validAmount = BigInt(5_000_000_000); // $5,000 < $10,000 limit

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        validAmount,
        'send',
      );

      expect(result.approved).toBe(true);
      expect(result.kycTier).toBe(3);
    });

    it('should reject transaction if recipient is blacklisted', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);

      const blacklistEntry = {
        address: recipient,
        reason: 'Fraud detected',
        isActive: true,
      };
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(blacklistEntry as Blacklist);

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('blacklisted');
    });

    it('should pass blacklist check if recipient is not blacklisted', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      expect(result.approved).toBe(true);
    });

    it('should include all checks performed in context', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      // Spy on logging to verify checks are performed
      const logSpy = jest.spyOn(service as any, 'logComplianceCheck');

      const result = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      expect(result.approved).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          checksPerformed: expect.arrayContaining([
            'kyc_tier_check',
            'transaction_limit_check',
            'blacklist_check',
            'ofac_check',
          ]),
        }),
      );
    });
  });

  describe('fetchKYCTier', () => {
    const sender = '0x' + '1'.repeat(64);

    it('should return KYC tier for existing user', async () => {
      const user = { id: '1', wallet_address: sender, kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);

      const tier = await service.fetchKYCTier(sender);

      expect(tier).toBe(2);
    });

    it('should return 0 for non-existing user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const tier = await service.fetchKYCTier(sender);

      expect(tier).toBe(0);
    });
  });

  describe('blacklist management', () => {
    const address = '0x' + '1'.repeat(64);
    const reason = 'Fraud detected';
    const addedBy = 'admin-user-id';

    it('should add address to blacklist', async () => {
      const mockEntry = {
        address,
        reason,
        addedById: addedBy,
        isActive: true,
      };

      jest.spyOn(blacklistRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(blacklistRepository, 'create')
        .mockReturnValue(mockEntry as Blacklist);
      jest
        .spyOn(blacklistRepository, 'save')
        .mockResolvedValue(mockEntry as Blacklist);

      const result = await service.addToBlacklist(address, reason, addedBy);

      expect(result.address).toBe(address);
      expect(result.reason).toBe(reason);
      expect(result.isActive).toBe(true);
    });

    it('should throw error if address already blacklisted', async () => {
      const existingEntry = {
        address,
        reason,
        isActive: true,
      };

      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(existingEntry as Blacklist);

      await expect(
        service.addToBlacklist(address, reason, addedBy),
      ).rejects.toThrow('already blacklisted');
    });

    it('should re-activate previously blacklisted address', async () => {
      const inactiveEntry = {
        address,
        reason,
        isActive: false,
        removedAt: new Date(),
      };

      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(inactiveEntry as Blacklist);
      jest
        .spyOn(blacklistRepository, 'save')
        .mockResolvedValue(inactiveEntry as Blacklist);

      const result = await service.addToBlacklist(address, reason, addedBy);

      expect(result.isActive).toBe(true);
    });

    it('should remove address from blacklist', async () => {
      const entry = {
        address,
        reason,
        isActive: true,
      };

      jest.spyOn(blacklistRepository, 'findOne').mockResolvedValue(entry as Blacklist);
      jest
        .spyOn(blacklistRepository, 'save')
        .mockResolvedValue(entry as Blacklist);

      await service.removeFromBlacklist(address);

      expect(blacklistRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        }),
      );
    });

    it('should throw error if trying to remove non-existing address', async () => {
      jest.spyOn(blacklistRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.removeFromBlacklist(address),
      ).rejects.toThrow('not found');
    });
  });

  describe('Property-Based Tests', () => {
    it('[Property 2] should return consistent compliance validation result for same input', async () => {
      const user = { id: '1', wallet_address: '0x' + '1'.repeat(64), kyc_tier: 2 };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const sender = user.wallet_address;
      const recipient = '0x' + '2'.repeat(64);
      const amount = BigInt(1_000_000_000); // Within tier 2 limit

      // Call validation twice
      const result1 = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      // Reset mocks for second call
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
      jest
        .spyOn(blacklistRepository, 'findOne')
        .mockResolvedValue(null);

      const result2 = await service.validateBeforeSubmission(
        sender,
        recipient,
        amount,
        'send',
      );

      // Results should be identical
      expect(result1.approved).toBe(result2.approved);
      expect(result1.kycTier).toBe(result2.kycTier);
      expect(result1.reason).toBe(result2.reason);
    });

    it('[Property 2] should consistently reject transactions exceeding tier limit', async () => {
      const amounts = [
        BigInt(1_000_000_000),
        BigInt(1_500_000_000),
        BigInt(2_000_000_000),
      ];

      for (const testAmount of amounts) {
        const user = { id: '1', wallet_address: '0x' + '1'.repeat(64), kyc_tier: 1 };
        jest.spyOn(userRepository, 'findOne').mockResolvedValue(user as User);
        jest
          .spyOn(blacklistRepository, 'findOne')
          .mockResolvedValue(null);

        const result = await service.validateBeforeSubmission(
          user.wallet_address,
          '0x' + '2'.repeat(64),
          testAmount,
          'send',
        );

        // All should be rejected (tier 1 limit is $999)
        expect(result.approved).toBe(false);
        expect(result.reason).toContain('exceeds KYC limit');
      }
    });
  });
});
