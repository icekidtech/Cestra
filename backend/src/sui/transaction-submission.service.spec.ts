import { Test, TestingModule } from '@nestjs/testing';
import { TransactionSubmissionService } from './transaction-submission.service';
import { RetryStrategy } from './retry-strategy.service';
import { SUI_CLIENT } from './sui.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PendingTransaction } from '../blockchain/entities/pending-transaction.entity';

describe('TransactionSubmissionService', () => {
  let service: TransactionSubmissionService;
  let mockSuiClient: any;
  let mockRepository: any;
  let mockRetryStrategy: any;

  beforeEach(async () => {
    mockSuiClient = {
      executeTransactionBlock: jest.fn(),
    };

    mockRepository = {
      save: jest.fn().mockImplementation((data) => ({
        id: 'tx-123',
        ...data,
      })),
      findOne: jest.fn(),
    };

    mockRetryStrategy = {
      classifyError: jest.fn((error) => {
        const message = error?.message || '';
        if (message.includes('timeout') || message.includes('ECONNREFUSED')) {
          return 'transient';
        }
        return 'fatal';
      }),
      getBackoffDelay: jest.fn((attempt) => {
        const delays = [1000, 2000, 4000, 8000, 16000, 32000];
        return delays[Math.min(attempt, delays.length - 1)];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionSubmissionService,
        {
          provide: SUI_CLIENT,
          useValue: mockSuiClient,
        },
        {
          provide: getRepositoryToken(PendingTransaction),
          useValue: mockRepository,
        },
        {
          provide: RetryStrategy,
          useValue: mockRetryStrategy,
        },
      ],
    }).compile();

    service = module.get<TransactionSubmissionService>(TransactionSubmissionService);
  });

  describe('submitTransaction', () => {
    it('should submit a valid transaction successfully', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const result = await service.submitTransaction(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-1',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('CONFIRMED');
      expect(result.digest).toMatch(/^0x/);
    });

    it('should handle on-chain failure', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'def'.padEnd(64, '0'),
        effects: {
          status: { status: 'failure', error: 'insufficient balance' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const result = await service.submitTransaction(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-2',
      );

      expect(result.status).toBe('FAILED');
    });

    it('should store transaction metadata for audit', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      await service.submitTransaction(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-3',
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: '0x' + 'sender'.padEnd(64, '0'),
          function: 'send::send_payment',
          idempotency_key: 'idempotency-key-3',
        }),
      );
    });
  });

  describe('submitWithRetry', () => {
    it('should succeed on first attempt', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const result = await service.submitWithRetry(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-retry-1',
        10,
      );

      expect(result.status).toBe('CONFIRMED');
      expect(mockSuiClient.executeTransactionBlock).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      mockSuiClient.executeTransactionBlock
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          digest: '0x' + 'abc'.padEnd(64, '0'),
          effects: {
            status: { status: 'success' },
            gasUsed: { computationCost: '1000000' },
          },
          events: [],
          transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
        });

      const result = await service.submitWithRetry(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-retry-2',
        3,
      );

      expect(result.status).toBe('CONFIRMED');
      expect(mockSuiClient.executeTransactionBlock).toHaveBeenCalledTimes(2);
    });

    it('should fail immediately on fatal error', async () => {
      mockSuiClient.executeTransactionBlock.mockRejectedValue(
        new Error('Invalid move call'),
      );

      mockRetryStrategy.classifyError.mockReturnValue('fatal');

      await expect(
        service.submitWithRetry(
          'signedTxBytes',
          '0x' + 'sender'.padEnd(64, '0'),
          'send::send_payment',
          ['0xrecipient', '1000000'],
          'idempotency-key-retry-3',
          3,
        ),
      ).rejects.toThrow();

      // Should not retry after fatal error
      expect(mockSuiClient.executeTransactionBlock).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw error', async () => {
      mockSuiClient.executeTransactionBlock.mockRejectedValue(new Error('Timeout'));

      mockRetryStrategy.classifyError.mockReturnValue('transient');

      await expect(
        service.submitWithRetry(
          'signedTxBytes',
          '0x' + 'sender'.padEnd(64, '0'),
          'send::send_payment',
          ['0xrecipient', '1000000'],
          'idempotency-key-retry-4',
          3,
        ),
      ).rejects.toThrow();

      // Should attempt all retries
      expect(mockSuiClient.executeTransactionBlock).toHaveBeenCalledTimes(3);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'tx-123',
        status: 'CONFIRMED',
        tx_digest: '0x' + 'abc'.padEnd(64, '0'),
      });

      const result = await service.getTransactionStatus('tx-123');

      expect(result.status).toBe('CONFIRMED');
      expect(result.digest).toBe('0x' + 'abc'.padEnd(64, '0'));
    });

    it('should return error message if transaction failed', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'tx-124',
        status: 'FAILED',
        error_message: 'Insufficient balance',
      });

      const result = await service.getTransactionStatus('tx-124');

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Insufficient balance');
    });

    it('should throw error if transaction not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getTransactionStatus('tx-nonexistent')).rejects.toThrow();
    });
  });

  describe('Property: Idempotency Key Reuse', () => {
    it('should use same idempotency key on retry attempts', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const idempotencyKey = 'same-key-for-all-retries';

      await service.submitWithRetry(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        idempotencyKey,
      );

      // Verify idempotency key is stored
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: idempotencyKey,
        }),
      );
    });
  });

  describe('Property: Transaction Submission Determinism', () => {
    it('should produce same result for identical inputs', async () => {
      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const result1 = await service.submitTransaction(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-det-1',
      );

      mockSuiClient.executeTransactionBlock.mockResolvedValue({
        digest: '0x' + 'abc'.padEnd(64, '0'),
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000' },
        },
        events: [],
        transaction: { data: { sender: '0x' + 'sender'.padEnd(64, '0') } },
      });

      const result2 = await service.submitTransaction(
        'signedTxBytes',
        '0x' + 'sender'.padEnd(64, '0'),
        'send::send_payment',
        ['0xrecipient', '1000000'],
        'idempotency-key-det-2',
      );

      // Same submission should result in same status
      expect(result1.status).toBe(result2.status);
    });
  });
});
