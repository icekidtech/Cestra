import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SuiModule, SUI_CLIENT, SUI_KEYPAIR } from './sui.module';
import { SuiClient } from '@mysten/sui';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

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
            SUI_PRIVATE_KEY: Buffer.from(
              Ed25519Keypair.generate().getSecretKey(),
            ).toString('base64'),
            SUI_PACKAGE_ID: '0x123456789abcdef',
          };
          return config[key];
        }),
      };

      module = await Test.createTestingModule({
        imports: [SuiModule],
      })
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .compile();

      configService = module.get<ConfigService>(ConfigService);
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

      await expect(
        Test.createTestingModule({
          imports: [SuiModule],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('SUI_RPC_URL environment variable is not set');
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

      await expect(
        Test.createTestingModule({
          imports: [SuiModule],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('SUI_PRIVATE_KEY environment variable is not set');
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

      await expect(
        Test.createTestingModule({
          imports: [SuiModule],
        })
          .overrideProvider(ConfigService)
          .useValue(mockConfigService)
          .compile(),
      ).rejects.toThrow('Failed to initialize Ed25519Keypair');
    });
  });
});
