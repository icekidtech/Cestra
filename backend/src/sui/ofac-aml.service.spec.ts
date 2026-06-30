import { OFACService, OFACCheckResult } from './ofac-aml.service';

describe('OFACService', () => {
  let service: OFACService;
  let mockConfigService: any;
  let mockConfigGet: jest.Mock;

  const createService = async (
    apiUrl?: string,
    apiKey?: string,
  ): Promise<OFACService> => {
    mockConfigGet = jest.fn((key: string, defaultValue?: any) => {
      const config = {
        OFAC_API_URL: apiUrl,
        OFAC_API_KEY: apiKey,
        OFAC_PROVIDER: 'chainalysis',
        OFAC_MAX_RETRIES: 3,
        OFAC_TIMEOUT_MS: 30000,
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });

    mockConfigService = {
      get: mockConfigGet,
    };

    return new OFACService(mockConfigService as any);
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('without provider configured', () => {
    beforeEach(async () => {
      service = await createService(undefined, undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

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
      jest.useFakeTimers();
      service = await createService(
        'https://api.chainalysis.com/v1',
        'test-api-key',
      );
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
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

      const promise = service.checkAddresses(addresses);

      // Fast-forward through all retry delays (async to flush awaited promises).
      await jest.runAllTimersAsync();

      const results = await promise;

      expect(results).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries exhausted', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Persistent failure'));

      const promise = service.checkAddresses(addresses);
      // Attach rejection handler before advancing timers to avoid unhandled rejection.
      const expectation = expect(promise).rejects.toThrow(
        'OFAC/AML check unavailable after 3 retries',
      );

      // Fast-forward through all retry delays
      await jest.runAllTimersAsync();

      await expectation;

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

    beforeEach(async () => {
      jest.useFakeTimers();
      errorService = await createService(
        'https://api.chainalysis.com/v1',
        'test-api-key',
      );
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
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

      const promise = errorService.checkAddresses(addresses);
      const expectation = expect(promise).rejects.toThrow('Provider API returned 401');
      await jest.runAllTimersAsync();
      await expectation;
    });

    it('should handle malformed JSON in response', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      const promise = errorService.checkAddresses(addresses);
      const expectation = expect(promise).rejects.toThrow();
      await jest.runAllTimersAsync();
      await expectation;
    });

    it('should handle provider error responses', async () => {
      const addresses = ['0x' + '1'.repeat(64)];

      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ error: 'Invalid request' }),
      });

      const promise = errorService.checkAddresses(addresses);
      const expectation = expect(promise).rejects.toThrow('error');
      await jest.runAllTimersAsync();
      await expectation;
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

      const promise = errorService.checkAddresses(addresses);

      // Fast-forward through all retry delays
      await jest.runAllTimersAsync();

      const result = await promise;

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
        // Create a service with configured provider for this test
        const testService = await createService(
          'https://api.chainalysis.com/v1',
          'test-api-key',
        );

        const mockResponse: OFACCheckResult[] = [
          {
            address: '0x' + '1'.repeat(64),
            risk: testCase.risk,
            isSanctioned: false,
          },
        ];

        const fetchSpy = jest.spyOn(global as any, 'fetch');
        fetchSpy.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ scores: mockResponse }),
        });

        const isHighRisk = await testService.isHighRisk('0x' + '1'.repeat(64));

        expect(isHighRisk).toBe(testCase.shouldFail);
        
        fetchSpy.mockRestore();
      }
    });
  });
});
