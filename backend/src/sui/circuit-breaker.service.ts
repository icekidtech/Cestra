import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold?: number; // Number of failures to open
  failureWindow?: number; // Time window in milliseconds
  recoveryTimeout?: number; // Time to wait before attempting recovery
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCountInHalfOpen = 0;
  private readonly failureThreshold: number;
  private readonly failureWindow: number;
  private readonly recoveryTimeout: number;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold || 5;
    this.failureWindow = config?.failureWindow || 10000; // 10 seconds
    this.recoveryTimeout = config?.recoveryTimeout || 30000; // 30 seconds

    this.logger.log(
      `CircuitBreaker initialized: threshold=${this.failureThreshold}, ` +
        `window=${this.failureWindow}ms, timeout=${this.recoveryTimeout}ms`,
    );
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition to HALF_OPEN
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCountInHalfOpen = 0;
        this.logger.log('Circuit breaker transitioned to HALF_OPEN - attempting recovery');
      } else {
        const remainingTime = this.recoveryTimeout - timeSinceLastFailure;
        throw new ServiceUnavailableException(
          `Circuit breaker is OPEN - will retry in ${Math.ceil(remainingTime / 1000)}s`,
        );
      }
    }

    try {
      const result = await fn();

      // Success path
      if (this.state === 'HALF_OPEN') {
        this.successCountInHalfOpen++;

        // Need 3 successful calls to close the circuit
        if (this.successCountInHalfOpen >= 3) {
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.logger.log(
            'Circuit breaker CLOSED - recovery successful after ' +
              `${this.successCountInHalfOpen} successful calls`,
          );
        }
      }

      return result;
    } catch (error) {
      // Failure path
      this.lastFailureTime = Date.now();

      if (this.state === 'HALF_OPEN') {
        // Failure in HALF_OPEN transitions back to OPEN
        this.state = 'OPEN';
        this.logger.error(
          'Circuit breaker OPEN - recovery attempt failed, going back to OPEN state',
        );
        throw error;
      }

      // In CLOSED state, count failures
      this.failureCount++;

      // Check if we should open the circuit
      const timeInWindow = Date.now() - (this.lastFailureTime - this.failureWindow);
      if (this.failureCount >= this.failureThreshold && timeInWindow <= this.failureWindow) {
        this.state = 'OPEN';
        this.logger.error(
          `Circuit breaker OPEN - ${this.failureCount} failures detected ` +
            `within ${this.failureWindow}ms window`,
        );
      }

      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get success count in HALF_OPEN state
   */
  getSuccessCountInHalfOpen(): number {
    return this.successCountInHalfOpen;
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  reset(): void {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCountInHalfOpen = 0;
    this.lastFailureTime = 0;

    this.logger.log(`Circuit breaker reset from ${previousState} to CLOSED`);
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number;
    timeSinceLastFailure: number;
    successCountInHalfOpen: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: this.lastFailureTime > 0 ? Date.now() - this.lastFailureTime : 0,
      successCountInHalfOpen: this.successCountInHalfOpen,
    };
  }
}
