import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CircuitBreakerService,
          useValue: new CircuitBreakerService({
            failureThreshold: 5,
            failureWindow: 10000,
            recoveryTimeout: 100, // Short timeout for testing
          }),
        },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(service.getState()).toBe('CLOSED');
    });

    it('should have zero failures initially', () => {
      expect(service.getFailureCount()).toBe(0);
    });
  });

  describe('CLOSED State', () => {
    it('should succeed for normal operation', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await service.execute(fn);

      expect(result).toBe('success');
      expect(service.getState()).toBe('CLOSED');
    });

    it('should count failures while in CLOSED state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      for (let i = 0; i < 3; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getFailureCount()).toBe(3);
      expect(service.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after threshold failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('OPEN');
    });
  });

  describe('OPEN State', () => {
    it('should reject requests while OPEN', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('OPEN');

      // Next request should fail immediately
      const nextFn = jest.fn().mockResolvedValue('success');
      await expect(service.execute(nextFn)).rejects.toThrow(ServiceUnavailableException);

      // nextFn should not have been called (fail fast)
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('OPEN');

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Attempt a call which should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await service.execute(successFn);

      expect(result).toBe('success');
      expect(service.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN State', () => {
    it('should close after 3 consecutive successes', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(failFn);
        } catch {
          // Expected
        }
      }

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 3 successful calls should close the circuit
      const successFn = jest.fn().mockResolvedValue('success');

      await service.execute(successFn);
      expect(service.getState()).toBe('HALF_OPEN');

      await service.execute(successFn);
      expect(service.getState()).toBe('HALF_OPEN');

      await service.execute(successFn);
      expect(service.getState()).toBe('CLOSED');
    });

    it('should reopen on failure in HALF_OPEN', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(failFn);
        } catch {
          // Expected
        }
      }

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // One successful call to enter HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await service.execute(successFn);

      expect(service.getState()).toBe('HALF_OPEN');

      // Failed call should reopen
      await expect(service.execute(failFn)).rejects.toThrow();
      expect(service.getState()).toBe('OPEN');
    });
  });

  describe('Reset', () => {
    it('should reset to CLOSED state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('OPEN');

      service.reset();

      expect(service.getState()).toBe('CLOSED');
      expect(service.getFailureCount()).toBe(0);
    });

    it('should allow requests after reset', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      service.reset();

      // Should now accept successful calls
      const successFn = jest.fn().mockResolvedValue('success');
      const result = await service.execute(successFn);

      expect(result).toBe('success');
      expect(service.getState()).toBe('CLOSED');
    });
  });

  describe('Status', () => {
    it('should return circuit status', async () => {
      const status1 = service.getStatus();

      expect(status1.state).toBe('CLOSED');
      expect(status1.failureCount).toBe(0);
      expect(status1.timeSinceLastFailure).toBe(0);

      const failFn = jest.fn().mockRejectedValue(new Error('test error'));

      try {
        await service.execute(failFn);
      } catch {
        // Expected
      }

      const status2 = service.getStatus();

      expect(status2.failureCount).toBeGreaterThan(0);
      expect(status2.lastFailureTime).toBeGreaterThan(0);
      expect(status2.timeSinceLastFailure).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Property: State Transition Determinism', () => {
    it('should transition states predictably from failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      // CLOSED -> OPEN on 5 failures
      expect(service.getState()).toBe('CLOSED');

      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(fn);
        } catch {
          // Expected
        }
      }

      expect(service.getState()).toBe('CLOSED');

      try {
        await service.execute(fn);
      } catch {
        // Expected
      }

      expect(service.getState()).toBe('OPEN');
    });

    it('should provide consistent status information', async () => {
      const status1 = service.getStatus();
      const status2 = service.getStatus();

      expect(status1.state).toBe(status2.state);
      expect(status1.failureCount).toBe(status2.failureCount);
    });
  });
});
