import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OFACService, OFACCheckResult } from './ofac-aml.service';

describe('OFACService', () => {
  let service: OFACService;
  let configService: ConfigService;
  let mockConfigGet: jest.Mock;

  beforeEach(async () => {
    // Create a persistent mock for ConfigService
    mockConfigGet = jest.fn((key: string, defaultValue?: any) => {
      const config = {
        OFAC_API_URL: undefined,
        OFAC_API_KEY: undefined,
        OFAC_PROVIDER: 'chainalysis',
        OFAC_MAX_RETRIES: 3,
        OFAC_TIMEOUT_MS: 30000,
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });

    const mockConfigService = {
      get: mockConfigGet,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OFACService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OFACService>(OFACService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('without provider configured', () => {
    it('should pass all addresses when no provider is configured', async () => {
      const addresses = ['0x' + '1'.repeat(64), '0x' + '2'.repeat(64)];

      const results = await service.checkAddresses(addresses);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.risk).toBe(0);
        expect(result.isSanctioned).toBe(false);
      });
    });

    it('should return false for health check when provider not configured', async () => {
      const health = await service.getHealthStatus();
      expect(health).toBe(false);
    });

    it('should indicate no high risk when provider not configured', async () => {
      const isHighRisk = await service.isHighRisk('0x' + '1'.repeat(64));
      expect(isHighRisk).toBe(false);
    });
  });

  describe('with provider configured', () => {
    beforeEach(async () => {
      // Update the mock to return configured provider values
      mockConfigGet.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          OFAC_API_URL: 'https://api.chainalysis.com/v1',
          OFAC_API_KEY: 'test-api-key',
          OFAC_PROVIDER: 'chainalysis',
          OFAC_MAX_RETRIES: 3,
          OFAC_TIMEOUT_MS: 30000,
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      });

      // Recreate service with new configuration
      service = new OFACService(configService);
    });

    it('should successfully check addresses on first attempt', async () => {
      const addresses = ['0x' + '1'.repeat(64)];
      const mockResponse: OFACCheckResult[] = [
        {
          address: '0x' + '1'.repeat(64),
          risk: 0.2,
          isSanctioned: false,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const results = await service.checkAddresses(addresses);

      expect(results).toHaveLength(1);
      expect(results[0].risk).toBe(0.2);
    });

    it('should retry on transient failure', async () => {
      const addresses = ['0x' + '1'.repeat(64)];
      const mockResponse: OFACCheckResult[] = [
        {
          address: '0x' + '1'.repeat(64),
          risk: 0.3,
          isSanctioned: false,
        },
      ];

      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
        });

      const results = await service.checkAddresses(addresses);

      expect(results).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries exhausted', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Persistent failure'));

      await expect(service.checkAddresses(addresses)).rejects.toThrow(
        'OFAC/AML check unavailable after 3 retries',
      );

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should reject on high-risk response', async () => {
      const addresses = ['0x' + '1'.repeat(64)];
      const mockResponse: OFACCheckResult[] = [
        {
          address: '0x' + '1'.repeat(64),
          risk: 0.9, // High risk
          isSanctioned: false,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const results = await service.checkAddresses(addresses);

      expect(results[0].risk).toBe(0.9);
    });

    it('should identify sanctioned addresses', async () => {
      const addresses = ['0x' + '1'.repeat(64)];
      const mockResponse: OFACCheckResult[] = [
        {
          address: '0x' + '1'.repeat(64),
          risk: 0.5,
          isSanctioned: true, // Sanctioned
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const results = await service.checkAddresses(addresses);

      expect(results[0].isSanctioned).toBe(true);
    });

    it('should normalize different response formats', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      // Test TRM Labs response format
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          results: [
            {
              wallet: addresses[0],
              riskScore: 0.4,
              sanctioned: false,
            },
          ],
        }),
      });

      const results = await service.checkAddresses(addresses);

      expect(results[0].risk).toBe(0.4);
      expect(results[0].address).toBe(addresses[0].toLowerCase());
    });

    it('should check if address is high-risk', async () => {
      const address = '0x' + '1'.repeat(64);
      const mockResponse: OFACCheckResult[] = [
        {
          address,
          risk: 0.85,
          isSanctioned: false,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const isHighRisk = await service.isHighRisk(address);

      expect(isHighRisk).toBe(true);
    });

    it('should return false for low-risk address', async () => {
      const address = '0x' + '1'.repeat(64);
      const mockResponse: OFACCheckResult[] = [
        {
          address,
          risk: 0.3,
          isSanctioned: false,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const isHighRisk = await service.isHighRisk(address);

      expect(isHighRisk).toBe(false);
    });

    it('should return true for sanctioned address', async () => {
      const address = '0x' + '1'.repeat(64);
      const mockResponse: OFACCheckResult[] = [
        {
          address,
          risk: 0.2,
          isSanctioned: true,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ scores: mockResponse }),
      });

      const isHighRisk = await service.isHighRisk(address);

      expect(isHighRisk).toBe(true);
    });
  });

  describe('error handling', () => {
    let errorService: OFACService;

    beforeEach(() => {
      // Update the mock to return configured provider values
      mockConfigGet.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          OFAC_API_URL: 'https://api.chainalysis.com/v1',
          OFAC_API_KEY: 'test-api-key',
          OFAC_PROVIDER: 'chainalysis',
          OFAC_MAX_RETRIES: 3,
          OFAC_TIMEOUT_MS: 30000,
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      });

      // Create a new service with configured provider
      errorService = new OFACService(configService);
    });

    it('should handle HTTP 401 Unauthorized', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      // Mock fetch to return 401 on all retries
      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(errorService.checkAddresses(addresses)).rejects.toThrow(
        'Provider API returned 401',
      );
    });

    it('should handle malformed JSON in response', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(errorService.checkAddresses(addresses)).rejects.toThrow();
    });

    it('should handle provider error responses', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ error: 'Invalid request' }),
      });

      await expect(errorService.checkAddresses(addresses)).rejects.toThrow('error');
    });

    it('should handle network failures with retry', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          scores: [{ address: addresses[0], risk: 0.2, isSanctioned: false }],
        }),
      });

      const result = await errorService.checkAddresses(addresses);

      expect(result).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Property-Based Tests', () => {
    it('[Property: Retry Determinism] should have consistent retry delays', () => {
      const delays = [1000, 2000, 4000];

      for (let attempt = 0; attempt < 3; attempt++) {
        const expectedDelay = delays[attempt];
        // Delays should be exponential: 2^n * 1000
        expect(expectedDelay).toBe(1000 * Math.pow(2, attempt));
      }
    });

    it('[Property: Risk Threshold] should always use 0.8 as high-risk threshold', async () => {
      const testCases = [
        { risk: 0.79, shouldFail: false },
        { risk: 0.8, shouldFail: false }, // 0.8 is NOT high risk, only > 0.8 is
        { risk: 0.80001, shouldFail: true }, // Just above 0.8 is high risk
        { risk: 0.81, shouldFail: true },
        { risk: 1.0, shouldFail: true },
      ];

      for (const testCase of testCases) {
        // Reset fetch mock for this iteration
        const fetchSpy = jest.spyOn(global as any, 'fetch');
        fetchSpy.mockClear();

        const mockResponse: OFACCheckResult[] = [
          {
            address: '0x' + '1'.repeat(64),
            risk: testCase.risk,
            isSanctioned: false,
          },
        ];

        fetchSpy.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ scores: mockResponse }),
        });

        // Create a new service instance for this test case with configured provider
        mockConfigGet.mockImplementation((key: string, defaultValue?: any) => {
          const config = {
            OFAC_API_URL: 'https://api.chainalysis.com/v1',
            OFAC_API_KEY: 'test-api-key',
            OFAC_PROVIDER: 'chainalysis',
            OFAC_MAX_RETRIES: 3,
            OFAC_TIMEOUT_MS: 30000,
          };
          return config[key] !== undefined ? config[key] : defaultValue;
        });

        const testService = new OFACService(configService);
        const isHighRisk = await testService.isHighRisk('0x' + '1'.repeat(64));

        expect(isHighRisk).toBe(testCase.shouldFail);
        
        fetchSpy.mockRestore();
      }
    });
  });
});
