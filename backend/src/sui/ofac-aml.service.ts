import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OFAC/AML risk assessment result
 */
export interface OFACCheckResult {
  address: string;
  risk: number; // 0-1 scale, >0.8 considered high risk
  isSanctioned: boolean;
  details?: string;
  source?: string;
}

/**
 * OFAC provider response (generic)
 */
export interface ProviderResponse {
  scores?: OFACCheckResult[];
  results?: OFACCheckResult[];
  data?: OFACCheckResult[];
  error?: string;
  message?: string;
}

/**
 * OFACService integrates with external OFAC/AML providers to check
 * addresses against sanctions lists and high-risk assessments.
 *
 * Supports multiple providers:
 * - Chainalysis (https://docs.chainalysis.com)
 * - TRM Labs (https://docs.trmlabs.com)
 * - Sardine (https://docs.sardine.ai)
 *
 * Implements exponential backoff retry logic with configurable timeouts.
 */
@Injectable()
export class OFACService {
  private readonly logger = new Logger(OFACService.name);

  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly provider: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly retryDelays: number[];

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = configService.get<string>('OFAC_API_URL');
    this.apiKey = configService.get<string>('OFAC_API_KEY');
    this.provider = configService.get<string>('OFAC_PROVIDER', 'chainalysis');
    this.maxRetries = configService.get<number>('OFAC_MAX_RETRIES', 3);
    this.timeoutMs = configService.get<number>('OFAC_TIMEOUT_MS', 30000);
    this.retryDelays = [1000, 2000, 4000]; // exponential backoff

    if (this.apiUrl && this.apiKey) {
      this.logger.log(
        `OFAC service initialized with provider: ${this.provider} (URL: ${this.apiUrl})`,
      );
    } else {
      this.logger.warn(
        'OFAC provider not configured (OFAC_API_URL/OFAC_API_KEY). All addresses will pass.',
      );
    }
  }

  /**
   * Check addresses against OFAC/AML provider
   *
   * Returns array of risk scores for each address.
   * If provider is not configured, returns all addresses with risk=0 (pass).
   * If provider call fails after retries, throws error.
   *
   * @param addresses Array of Sui addresses to check
   * @returns Array of risk scores
   * @throws Error if provider unavailable after retries
   */
  async checkAddresses(addresses: string[]): Promise<OFACCheckResult[]> {
    // If no provider configured, pass all addresses
    if (!this.apiUrl || !this.apiKey) {
      this.logger.debug('No OFAC provider configured, all addresses pass');
      return addresses.map((address) => ({
        address,
        risk: 0,
        isSanctioned: false,
      }));
    }

    // Retry logic with exponential backoff
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const results = await this.callProvider(addresses);
        this.logger.debug(
          `OFAC check succeeded on attempt ${attempt + 1}/${this.maxRetries}`,
        );
        return results;
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries - 1) {
          const delayMs = this.retryDelays[attempt];
          this.logger.warn(
            `OFAC check attempt ${attempt + 1}/${this.maxRetries} failed, ` +
              `retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`,
          );
          await this.delay(delayMs);
        }
      }
    }

    // All retries exhausted
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(
      `OFAC check failed after ${this.maxRetries} retries: ${errorMsg}`,
    );
    throw new Error(
      `OFAC/AML check unavailable after ${this.maxRetries} retries: ${errorMsg}`,
    );
  }

  /**
   * Call the configured OFAC provider
   *
   * Supports different provider APIs through normalization.
   *
   * @param addresses Addresses to check
   * @returns Normalized risk scores
   */
  private async callProvider(addresses: string[]): Promise<OFACCheckResult[]> {
    const payload = this.buildProviderPayload(addresses);

    const response = await this.withTimeout(
      fetch(this.apiUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'Cestra/1.0',
        },
        body: JSON.stringify(payload),
      }),
      this.timeoutMs,
    );

    if (!response.ok) {
      throw new Error(
        `Provider API returned ${response.status}: ${response.statusText}`,
      );
    }

    const data: ProviderResponse = await response.json();
    return this.normalizeResponse(data);
  }

  /**
   * Build provider-specific request payload
   *
   * @param addresses Addresses to check
   * @returns Provider-specific payload
   */
  private buildProviderPayload(addresses: string[]): Record<string, any> {
    switch (this.provider.toLowerCase()) {
      case 'chainalysis':
        return {
          addresses: addresses,
        };

      case 'trmlabs':
        return {
          addresses: addresses,
          authorizationKey: this.apiKey,
        };

      case 'sardine':
        return {
          addresses: addresses,
        };

      default:
        // Generic payload for unknown providers
        return {
          addresses: addresses,
        };
    }
  }

  /**
   * Normalize provider response to standard format
   *
   * Different providers return responses in different formats,
   * this normalizes them to a standard OFACCheckResult array.
   *
   * @param response Provider response
   * @returns Normalized risk scores
   */
  private normalizeResponse(response: ProviderResponse): OFACCheckResult[] {
    if (response.error || response.message) {
      throw new Error(`Provider returned error: ${response.error || response.message}`);
    }

    // Try different response formats
    const results =
      response.scores || response.results || response.data || [];

    if (!Array.isArray(results)) {
      throw new Error('Provider response is not an array');
    }

    // Normalize each result
    return results.map((result: any) => {
      // Different providers use different field names
      const address =
        result.address || result.wallet || result.account || '';
      const risk = result.risk || result.riskScore || result.score || 0;
      const isSanctioned =
        result.isSanctioned ||
        result.sanctioned ||
        result.is_sanctioned ||
        false;

      return {
        address: address.toLowerCase(),
        risk: parseFloat(risk.toString()),
        isSanctioned: Boolean(isSanctioned),
        details: result.details || result.reason || undefined,
        source: this.provider,
      };
    });
  }

  /**
   * Helper to add timeout to fetch calls
   *
   * @param promise Promise to wrap
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that rejects if timeout exceeded
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`OFAC API call timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Helper to delay execution
   *
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if a single address is high-risk
   *
   * @param address Address to check
   * @returns True if risk > 0.8 or sanctioned
   */
  async isHighRisk(address: string): Promise<boolean> {
    try {
      const results = await this.checkAddresses([address]);
      if (results.length === 0) return false;

      const result = results[0];
      return result.risk > 0.8 || result.isSanctioned;
    } catch (error) {
      // On provider failure, throw to caller
      throw error;
    }
  }

  /**
   * Get health status of OFAC provider
   *
   * @returns True if provider is configured and responsive
   */
  async getHealthStatus(): Promise<boolean> {
    if (!this.apiUrl || !this.apiKey) {
      return false; // Not configured
    }

    try {
      // Quick check with a test address
      await this.checkAddresses(['0x' + '0'.repeat(64)]);
      return true;
    } catch {
      return false;
    }
  }
}
