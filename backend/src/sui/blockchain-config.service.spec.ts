import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BlockchainConfigService } from './blockchain-config.service';

describe('BlockchainConfigService', () => {
  let service: BlockchainConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          SUI_NETWORK: 'testnet',
          SUI_RPC_URL: 'https://fullnode.testnet.sui.io:443',
          SUI_PACKAGE_ID: '0x123456789abcdef0123456789abcdef0',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<BlockchainConfigService>(BlockchainConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('getConfig', () => {
    it('should return complete blockchain configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.network).toBe('testnet');
      expect(config.rpcUrl).toBe('https://fullnode.testnet.sui.io:443');
      expect(config.packageId).toBe('0x123456789abcdef0123456789abcdef0');
      expect(config.defaultGasBudget).toBe(10_000_000);
    });

    it('should include all seven modules in config', () => {
      const config = service.getConfig();

      expect(config.modules).toHaveProperty('send');
      expect(config.modules).toHaveProperty('pool');
      expect(config.modules).toHaveProperty('yield');
      expect(config.modules).toHaveProperty('circle');
      expect(config.modules).toHaveProperty('ratelock');
      expect(config.modules).toHaveProperty('bridge');
      expect(config.modules).toHaveProperty('compliance');
    });
  });

  describe('getModuleConfig', () => {
    it('should return configuration for a specific module', () => {
      const sendConfig = service.getModuleConfig('send');

      expect(sendConfig).toBeDefined();
      expect(sendConfig.name).toBe('send');
      expect(sendConfig.functions).toHaveProperty('sendPayment');
      expect(sendConfig.gasbudget).toBe(10_000_000);
    });

    it('should throw error for unknown module', () => {
      expect(() => service.getModuleConfig('unknown')).toThrow(
        'Module configuration not found: unknown',
      );
    });

    it('should return pool module configuration', () => {
      const poolConfig = service.getModuleConfig('pool');

      expect(poolConfig.functions).toHaveProperty('createPool');
      expect(poolConfig.functions).toHaveProperty('contribute');
      expect(poolConfig.functions).toHaveProperty('execute');
      expect(poolConfig.functions).toHaveProperty('refund');
    });

    it('should return yield module configuration', () => {
      const yieldConfig = service.getModuleConfig('yield');

      expect(yieldConfig.functions).toHaveProperty('deposit');
      expect(yieldConfig.functions).toHaveProperty('withdraw');
      expect(yieldConfig.functions).toHaveProperty('accrueInterest');
    });
  });

  describe('getFunctionPath', () => {
    it('should construct correct function path for send module', () => {
      const path = service.getFunctionPath('send', 'sendPayment');

      expect(path).toBe(
        '0x123456789abcdef0123456789abcdef0::send::send',
      );
    });

    it('should throw error for unknown function', () => {
      expect(() => service.getFunctionPath('send', 'unknownFunction')).toThrow(
        'Function not found in module send: unknownFunction',
      );
    });

    it('should throw error for unknown module', () => {
      expect(() =>
        service.getFunctionPath('unknown', 'someFunction'),
      ).toThrow('Module configuration not found: unknown');
    });

    it('should construct correct path for pool execute function', () => {
      const path = service.getFunctionPath('pool', 'execute');

      expect(path).toBe(
        '0x123456789abcdef0123456789abcdef0::pool::execute',
      );
    });
  });

  describe('getNetwork', () => {
    it('should return the configured network', () => {
      const network = service.getNetwork();
      expect(network).toBe('testnet');
    });
  });

  describe('getRpcUrl', () => {
    it('should return the configured RPC URL', () => {
      const rpcUrl = service.getRpcUrl();
      expect(rpcUrl).toBe('https://fullnode.testnet.sui.io:443');
    });
  });

  describe('getPackageId', () => {
    it('should return the configured package ID', () => {
      const packageId = service.getPackageId();
      expect(packageId).toBe('0x123456789abcdef0123456789abcdef0');
    });
  });

  describe('getDefaultGasBudget', () => {
    it('should return the default gas budget', () => {
      const gasBudget = service.getDefaultGasBudget();
      expect(gasBudget).toBe(10_000_000);
    });
  });

  describe('initialization with missing configuration', () => {
    it('should throw error when SUI_RPC_URL is missing', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'SUI_RPC_URL') return null;
          if (key === 'SUI_PACKAGE_ID') return '0x123';
          return 'testnet';
        }),
      };

      expect(
        () =>
          new BlockchainConfigService(
            mockConfigService as unknown as ConfigService,
          ),
      ).toThrow(
        'SUI_RPC_URL and SUI_PACKAGE_ID must be configured in environment variables',
      );
    });

    it('should throw error when SUI_PACKAGE_ID is missing', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'SUI_PACKAGE_ID') return null;
          if (key === 'SUI_RPC_URL') return 'https://fullnode.testnet.sui.io';
          return 'testnet';
        }),
      };

      expect(
        () =>
          new BlockchainConfigService(
            mockConfigService as unknown as ConfigService,
          ),
      ).toThrow(
        'SUI_RPC_URL and SUI_PACKAGE_ID must be configured in environment variables',
      );
    });
  });
});
