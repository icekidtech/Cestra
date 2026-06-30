import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StateSyncService } from './state-sync.service';
import { EventRoutingService } from './event-routing.service';
import { ParsedEvent } from './on-chain-monitor.service';
import { Transaction } from '../blockchain/entities/transaction.entity';
import { BatchPayout } from '../blockchain/entities/batch-payout.entity';
import { YieldDeposit } from '../blockchain/entities/yield-deposit.entity';
import { SavingsCircle } from '../blockchain/entities/savings-circle.entity';
import { RateLock } from '../blockchain/entities/rate-lock.entity';
import { CrossChainTransfer } from '../blockchain/entities/cross-chain-transfer.entity';

describe('StateSyncService', () => {
  let service: StateSyncService;
  let mockDataSource: Partial<DataSource>;
  let mockTransactionRepository: any;
  let mockBatchPayoutRepository: any;
  let mockYieldDepositRepository: any;
  let mockSavingsCircleRepository: any;
  let mockRateLockRepository: any;
  let mockCrossChainTransferRepository: any;
  let mockEventRoutingService: Partial<EventRoutingService>;

  beforeEach(async () => {
    mockDataSource = {
      transaction: jest.fn(async (callback: any) => {
        return callback({
          create: jest.fn((entity, data) => ({ ...data })),
          findOne: jest.fn(),
          save: jest.fn(async (entity) => entity),
          find: jest.fn(),
        } as any);
      }) as any,
    };

    mockTransactionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockBatchPayoutRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockYieldDepositRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    mockSavingsCircleRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockRateLockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockCrossChainTransferRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockEventRoutingService = {
      registerHandlers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateSyncService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(BatchPayout),
          useValue: mockBatchPayoutRepository,
        },
        {
          provide: getRepositoryToken(YieldDeposit),
          useValue: mockYieldDepositRepository,
        },
        {
          provide: getRepositoryToken(SavingsCircle),
          useValue: mockSavingsCircleRepository,
        },
        {
          provide: getRepositoryToken(RateLock),
          useValue: mockRateLockRepository,
        },
        {
          provide: getRepositoryToken(CrossChainTransfer),
          useValue: mockCrossChainTransferRepository,
        },
        {
          provide: EventRoutingService,
          useValue: mockEventRoutingService,
        },
      ],
    }).compile();

    service = module.get<StateSyncService>(StateSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onSendEvent', () => {
    it('should create Transaction entity from SendEvent', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'send',
        eventType: 'cestra::send::SentEvent',
        sender: '0xsender',
        parsedJson: {
          sender: '0xsender',
          recipient: '0xrecipient',
          amount: '1000000',
          fee: '8000',
        },
        timestamp: Date.now(),
      };

      await service.onSendEvent(event);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should reject SendEvent with missing required fields', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'send',
        eventType: 'cestra::send::SentEvent',
        sender: '0xsender',
        parsedJson: {
          sender: '0xsender',
          // Missing recipient, amount, fee
        },
        timestamp: Date.now(),
      };

      await expect(service.onSendEvent(event)).rejects.toThrow(
        'Event missing required field: recipient',
      );
    });
  });

  describe('onPoolCreatedEvent', () => {
    it('should create BatchPayout entity from PoolCreatedEvent', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'pool',
        eventType: 'cestra::pool::PoolCreatedEvent',
        sender: '0xsender',
        parsedJson: {
          pool_id: 'pool_123',
          name: 'Test Pool',
          target_recipients: [
            { address: '0xrecipient1', amount: '1000000' },
            { address: '0xrecipient2', amount: '2000000' },
          ],
        },
        timestamp: Date.now(),
      };

      await service.onPoolCreatedEvent(event);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should reject PoolCreatedEvent with missing pool_id', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'pool',
        eventType: 'cestra::pool::PoolCreatedEvent',
        sender: '0xsender',
        parsedJson: {
          // Missing pool_id
          name: 'Test Pool',
        },
        timestamp: Date.now(),
      };

      await expect(service.onPoolCreatedEvent(event)).rejects.toThrow(
        'Event missing required field: poolId',
      );
    });
  });

  describe('onYieldDepositedEvent', () => {
    it('should create YieldDeposit entity from YieldDepositedEvent', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'yield',
        eventType: 'cestra::yield::YieldDepositedEvent',
        sender: '0xuser',
        parsedJson: {
          user_address: '0xuser',
          vault_id: 'vault_123',
          amount: '1000000',
          shares: '1000000',
        },
        timestamp: Date.now(),
      };

      await service.onYieldDepositedEvent(event);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should reject YieldDepositedEvent with missing required fields', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'yield',
        eventType: 'cestra::yield::YieldDepositedEvent',
        sender: '0xuser',
        parsedJson: {
          user_address: '0xuser',
          // Missing vault_id, amount, shares
        },
        timestamp: Date.now(),
      };

      await expect(service.onYieldDepositedEvent(event)).rejects.toThrow();
    });
  });

  describe('onRateLockCreatedEvent', () => {
    it('should create RateLock entity from RateLockCreatedEvent', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'ratelock',
        eventType: 'cestra::ratelock::RateLockCreatedEvent',
        sender: '0xbusiness',
        parsedJson: {
          lock_id: 'lock_123',
          business_id: '0xbusiness',
          locked_amount: '1000000',
          fx_rate: '1.05',
          expiry_at: Math.floor(Date.now() / 1000) + 86400,
        },
        timestamp: Date.now(),
      };

      await service.onRateLockCreatedEvent(event);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('onBridgeCctpCompletedEvent', () => {
    it('should update CrossChainTransfer with received status', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'bridge',
        eventType: 'cestra::bridge::BridgeCctpReceiveCompleted',
        sender: '0xrelayer',
        parsedJson: {
          message_id: '12345',
          receiver: '0xreceiver',
          amount: '1000000',
        },
        timestamp: Date.now(),
      };

      await service.onBridgeCctpCompletedEvent(event);

      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const event: ParsedEvent = {
        digest: '0xabcd1234',
        eventSeq: 0,
        packageId: '0x...',
        module: 'send',
        eventType: 'cestra::send::SentEvent',
        sender: '0xsender',
        parsedJson: {
          sender: '0xsender',
          recipient: '0xrecipient',
          amount: '1000000',
          fee: '8000',
        },
        timestamp: Date.now(),
      };

      // Mock transaction to throw error
      (mockDataSource.transaction as jest.Mock).mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(service.onSendEvent(event)).rejects.toThrow('Database error');
    });
  });

  describe('manualSyncTransaction', () => {
    it('should return success if transaction found', async () => {
      const mockTransaction = { id: '123', on_chain_digest: '0xabcd' };
      mockTransactionRepository.findOne.mockResolvedValueOnce(mockTransaction);

      const result = await service.manualSyncTransaction('0xabcd');

      expect(result.success).toBe(true);
      expect(result.entityType).toBe('Transaction');
      expect(result.entityId).toBe('123');
    });

    it('should return failure if transaction not found', async () => {
      mockTransactionRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.manualSyncTransaction('0xnonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should handle errors gracefully', async () => {
      mockTransactionRepository.findOne.mockRejectedValueOnce(
        new Error('Database error'),
      );

      const result = await service.manualSyncTransaction('0xabcd');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
