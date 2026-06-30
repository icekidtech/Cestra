import { Test, TestingModule } from '@nestjs/testing';
import { EventDeduplicationService } from './event-deduplication.service';
import * as fc from 'fast-check';

describe('EventDeduplicationService', () => {
  let service: EventDeduplicationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventDeduplicationService],
    }).compile();

    service = module.get<EventDeduplicationService>(
      EventDeduplicationService,
    );

    // Ensure a clean Redis namespace for each test (state can otherwise leak
    // between tests that reuse digests like '0xtest').
    await service.clearCache();
  });

  afterEach(async () => {
    // Clean up Redis
    await service.disconnect();
  });

  describe('deduplication', () => {
    it('should mark new event as not duplicate', async () => {
      const result = await service.checkAndMarkDuplicate('0xtest', 0);

      expect(result.isDuplicate).toBe(false);
      expect(result.wasNew).toBe(true);
    });

    it('should detect duplicate when event is seen twice', async () => {
      const digest = '0xtest';
      const eventSeq = 0;

      // First call
      const result1 = await service.checkAndMarkDuplicate(digest, eventSeq);
      expect(result1.isDuplicate).toBe(false);

      // Second call - should be duplicate
      const result2 = await service.checkAndMarkDuplicate(digest, eventSeq);
      expect(result2.isDuplicate).toBe(true);
    });

    it('should treat different event sequences as distinct', async () => {
      const digest = '0xtest';

      const result1 = await service.checkAndMarkDuplicate(digest, 0);
      const result2 = await service.checkAndMarkDuplicate(digest, 1);

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
    });

    it('should treat different digests as distinct', async () => {
      const eventSeq = 0;

      const result1 = await service.checkAndMarkDuplicate('0xtest1', eventSeq);
      const result2 = await service.checkAndMarkDuplicate('0xtest2', eventSeq);

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
    });
  });

  describe('batch operations', () => {
    it('should mark multiple events at once', async () => {
      const events = [
        { digest: '0xtest1', eventSeq: 0 },
        { digest: '0xtest2', eventSeq: 1 },
        { digest: '0xtest3', eventSeq: 2 },
      ];

      const count = await service.markMultipleDuplicates(events);

      expect(count).toBe(3);

      // Verify all were marked
      for (const event of events) {
        const hasSeen = await service.hasBeenSeen(
          event.digest,
          event.eventSeq,
        );
        expect(hasSeen).toBe(true);
      }
    });

    it('should handle empty batch', async () => {
      const count = await service.markMultipleDuplicates([]);

      expect(count).toBe(0);
    });
  });

  describe('cache operations', () => {
    it('should check if event has been seen', async () => {
      const digest = '0xtest';
      const eventSeq = 0;

      let hasSeen = await service.hasBeenSeen(digest, eventSeq);
      expect(hasSeen).toBe(false);

      await service.checkAndMarkDuplicate(digest, eventSeq);

      hasSeen = await service.hasBeenSeen(digest, eventSeq);
      expect(hasSeen).toBe(true);
    });

    it('should get TTL for cached event', async () => {
      const digest = '0xtest';
      const eventSeq = 0;

      await service.checkAndMarkDuplicate(digest, eventSeq);

      const ttl = await service.getTTL(digest, eventSeq);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should clear deduplication cache', async () => {
      const events = [
        { digest: '0xtest1', eventSeq: 0 },
        { digest: '0xtest2', eventSeq: 1 },
      ];

      await service.markMultipleDuplicates(events);

      let hasSeenFirst = await service.hasBeenSeen('0xtest1', 0);
      expect(hasSeenFirst).toBe(true);

      await service.clearCache();

      hasSeenFirst = await service.hasBeenSeen('0xtest1', 0);
      expect(hasSeenFirst).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should report deduplication statistics', async () => {
      const events = [
        { digest: '0xtest1', eventSeq: 0 },
        { digest: '0xtest2', eventSeq: 1 },
      ];

      await service.markMultipleDuplicates(events);

      const stats = await service.getStats();

      expect(stats.totalKeys).toBeGreaterThanOrEqual(2);
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('property-based tests', () => {
    it('Property 3: Event Deduplication Idempotence - Same event always produces same dedup result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.hexaString({ minLength: 64, maxLength: 64 }),
          fc.integer({ min: 0, max: 1000 }),
          async (digest, eventSeq) => {
            const result1 = await service.checkAndMarkDuplicate(
              `0x${digest}`,
              eventSeq,
            );
            const result2 = await service.checkAndMarkDuplicate(
              `0x${digest}`,
              eventSeq,
            );

            // First call should be new, second should be duplicate
            expect(result1.isDuplicate).toBe(false);
            expect(result2.isDuplicate).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('Property: Deduplication Consistency - Event key uniqueness', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.hexaString({ minLength: 64, maxLength: 64 }),
          fc.integer({ min: 0, max: 1000 }),
          fc.hexaString({ minLength: 64, maxLength: 64 }),
          fc.integer({ min: 0, max: 1000 }),
          async (digest1, seq1, digest2, seq2) => {
            // Skip if same event
            if (digest1 === digest2 && seq1 === seq2) {
              return;
            }

            const result1 = await service.checkAndMarkDuplicate(
              `0x${digest1}`,
              seq1,
            );
            const result2 = await service.checkAndMarkDuplicate(
              `0x${digest2}`,
              seq2,
            );

            // Different events should not be duplicates of each other
            expect(result1.isDuplicate).toBe(false);
            expect(result2.isDuplicate).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
