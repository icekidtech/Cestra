import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SuiModule, SUI_CLIENT, SUI_KEYPAIR } from './sui.module';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PendingTransaction } from '../blockchain/entities/pending-transaction.entity';
import { Transaction } from '../blockchain/entities/transaction.entity';
import { BatchPayout } from '../blockchain/entities/batch-payout.entity';
import { YieldDeposit } from '../blockchain/entities/yield-deposit.entity';
import { SavingsCircle } from '../blockchain/entities/savings-circle.entity';
import { RateLock } from '../blockchain/entities/rate-lock.entity';
import { CrossChainTransfer } from '../blockchain/entities/cross-chain-transfer.entity';
import { Blacklist } from '../blockchain/entities/blacklist.entity';
import { User } from '../auth/entities/user.entity';

// Entities whose repositories SuiModule registers via TypeOrmModule.forFeature.
const SUI_ENTITIES = [
  PendingTransaction,
  Transaction,
  BatchPayout,
  YieldDeposit,
  SavingsCircle,
  RateLock,
  CrossChainTransfer,
  Blacklist,
  User,
];

/**
 * Build a TestingModule for SuiModule with all external dependencies stubbed:
 * a global ConfigService (SuiModule injects it for onModuleInit) plus mock
 * repositories and DataSource. SuiModule does not import ConfigModule itself —
 * in the real app ConfigModule is registered globally — so the test supplies a
 * global module that exports a mock ConfigService.
 */
function buildSuiTestModule(mockConfigService: { get: jest.Mock }) {
  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  // SuiModule imports TypeOrmModule.forFeature([...]), whose providers call
  // dataSource.getRepository(entity). Supplying a DataSource with getRepository
  // lets those providers resolve without a real database.
  const mockDataSource = {
    getRepository: jest.fn(() => mockRepo),
    getTreeRepository: jest.fn(() => mockRepo),
    transaction: jest.fn(),
    entityMetadatas: [],
    options: { type: 'postgres' },
  };

  @Global()
  @Module({
    providers: [
      { provide: ConfigService, useValue: mockConfigService },
      { provide: getDataSourceToken(), useValue: mockDataSource },
      { provide: DataSource, useValue: mockDataSource },
    ],
    exports: [ConfigService, getDataSourceToken(), DataSource],
  })
  class MockInfraModule {}

  return Test.createTestingModule({
    imports: [MockInfraModule, SuiModule],
  }).compile();
}

describe('SuiModule', () => {
  let module: TestingModule;
  let configService: ConfigService;

  describe('initialization with valid configuration', () => {
    beforeEach(async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config = {
            SUI_RPC_URL: 'https://fullnode.testnet.sui.io:443',
            SUI_NETWORK: 'testnet',
            // 32-byte raw secret, base64 — matches the module's decode path.
            SUI_PRIVATE_KEY: Buffer.from(new Uint8Array(32).fill(7)).toString(
              'base64',
            ),
            SUI_PACKAGE_ID: '0x123456789abcdef',
          };
          return config[key];
        }),
      };

      module = await buildSuiTestModule(mockConfigService);

      configService = module.get<ConfigService>(ConfigService);
    });

    afterEach(async () => {
      // Close the module so OnChainMonitorService's Redis client + polling
      // timers are torn down and jest can exit cleanly.
      await module?.close();
    });

    it('should export SUI_CLIENT', () => {
      const client = module.get<SuiClient>(SUI_CLIENT);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(SuiClient);
    });

    it('should export SUI_KEYPAIR', () => {
      const keypair = module.get<Ed25519Keypair>(SUI_KEYPAIR);
      expect(keypair).toBeDefined();
      expect(keypair).toBeInstanceOf(Ed25519Keypair);
    });
  });

  describe('initialization with missing SUI_RPC_URL', () => {
    it('should throw error when SUI_RPC_URL is not provided', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'SUI_RPC_URL') return null;
          return 'mock_value';
        }),
      };

      await expect(buildSuiTestModule(mockConfigService)).rejects.toThrow(
        'SUI_RPC_URL environment variable is not set',
      );
    });
  });

  describe('initialization with missing SUI_PRIVATE_KEY', () => {
    it('should throw error when SUI_PRIVATE_KEY is not provided', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config = {
            SUI_RPC_URL: 'https://fullnode.testnet.sui.io:443',
          };
          return config[key];
        }),
      };

      await expect(buildSuiTestModule(mockConfigService)).rejects.toThrow(
        'SUI_PRIVATE_KEY environment variable is not set',
      );
    });
  });

  describe('initialization with invalid private key format', () => {
    it('should throw error when SUI_PRIVATE_KEY has invalid base64', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config = {
            SUI_RPC_URL: 'https://fullnode.testnet.sui.io:443',
            SUI_PRIVATE_KEY: 'invalid_base64!!!',
          };
          return config[key];
        }),
      };

      await expect(buildSuiTestModule(mockConfigService)).rejects.toThrow(
        'Failed to initialize Ed25519Keypair',
      );
    });
  });
});
