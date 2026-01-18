/**
 * Tests for the Concurrency Limiter module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConcurrencyLimiter,
  QueueTimeoutError,
  createConcurrencyLimiter,
  withConcurrencyLimit,
  DEFAULT_CONCURRENCY_OPTIONS,
} from '../../src/client/concurrency.js';

describe('ConcurrencyLimiter', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const limiter = new ConcurrencyLimiter();
      expect(limiter.getMaxConcurrency()).toBe(Infinity);
      expect(limiter.getActiveCount()).toBe(0);
      expect(limiter.getQueueLength()).toBe(0);
    });

    it('should create with custom maxConcurrency', () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 5 });
      expect(limiter.getMaxConcurrency()).toBe(5);
    });

    it('should enforce minimum maxConcurrency of 1', () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 0 });
      expect(limiter.getMaxConcurrency()).toBe(1);

      const limiter2 = new ConcurrencyLimiter({ maxConcurrency: -5 });
      expect(limiter2.getMaxConcurrency()).toBe(1);
    });

    it('should floor floating point maxConcurrency', () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 3.7 });
      expect(limiter.getMaxConcurrency()).toBe(3);
    });

    it('should handle negative queueTimeout', () => {
      const limiter = new ConcurrencyLimiter({ queueTimeout: -100 });
      // Should not throw, just use 0
      expect(limiter).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute a simple operation', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });
      const result = await limiter.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track active count during execution', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });

      let activeCountDuring = 0;
      await limiter.execute(async () => {
        activeCountDuring = limiter.getActiveCount();
        return 'done';
      });

      expect(activeCountDuring).toBe(1);
      expect(limiter.getActiveCount()).toBe(0);
    });

    it('should run operations in parallel up to limit', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 3 });
      const executionOrder: number[] = [];
      const startTimes: number[] = [];

      const createDelayedOp = (id: number, delay: number) => async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, delay));
        executionOrder.push(id);
        return id;
      };

      const start = Date.now();
      const results = await Promise.all([
        limiter.execute(createDelayedOp(1, 50)),
        limiter.execute(createDelayedOp(2, 50)),
        limiter.execute(createDelayedOp(3, 50)),
      ]);

      const elapsed = Date.now() - start;

      expect(results).toEqual([1, 2, 3]);
      // All 3 should run in parallel, so total time should be ~50ms not 150ms
      expect(elapsed).toBeLessThan(100);
    });

    it('should queue operations when at capacity', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });
      const executionOrder: number[] = [];

      const createDelayedOp = (id: number, delay: number) => async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
        executionOrder.push(id);
        return id;
      };

      const start = Date.now();
      const results = await Promise.all([
        limiter.execute(createDelayedOp(1, 30)),
        limiter.execute(createDelayedOp(2, 30)),
        limiter.execute(createDelayedOp(3, 30)), // Should be queued
      ]);

      const elapsed = Date.now() - start;

      expect(results).toEqual([1, 2, 3]);
      // First 2 run in parallel (~30ms), then 3rd runs (~30ms) = ~60ms total
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100);
    });

    it('should release slot on operation error', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });

      try {
        await limiter.execute(async () => {
          throw new Error('Operation failed');
        });
      } catch (e) {
        // Expected
      }

      expect(limiter.getActiveCount()).toBe(0);

      // Should be able to run another operation
      const result = await limiter.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should handle unlimited concurrency', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: Infinity });
      const operations = Array.from({ length: 100 }, (_, i) =>
        limiter.execute(async () => i)
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(100);
    });
  });

  describe('queue timeout', () => {
    it('should throw QueueTimeoutError when timeout exceeded', async () => {
      const limiter = new ConcurrencyLimiter({
        maxConcurrency: 1,
        queueTimeout: 50
      });

      // Start a long-running operation
      const longOp = limiter.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'long';
      });

      // Try to execute another operation (should timeout)
      await expect(limiter.execute(async () => 'short'))
        .rejects.toThrow(QueueTimeoutError);

      // Clean up
      await longOp;
    });

    it('should include timeout and queue length in error', async () => {
      const limiter = new ConcurrencyLimiter({
        maxConcurrency: 1,
        queueTimeout: 30
      });

      const longOp = limiter.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'long';
      });

      try {
        await limiter.execute(async () => 'short');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(QueueTimeoutError);
        const queueError = error as QueueTimeoutError;
        expect(queueError.timeout).toBe(30);
        expect(queueError.name).toBe('QueueTimeoutError');
      }

      await longOp;
    });

    it('should remove timed out operations from queue', async () => {
      const limiter = new ConcurrencyLimiter({
        maxConcurrency: 1,
        queueTimeout: 20
      });

      const longOp = limiter.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'long';
      });

      // These should all timeout
      const timedOutOps = [
        limiter.execute(async () => 'a').catch(() => 'timeout'),
        limiter.execute(async () => 'b').catch(() => 'timeout'),
      ];

      // Wait for timeouts
      const results = await Promise.all(timedOutOps);
      expect(results).toEqual(['timeout', 'timeout']);

      // Queue should be empty now
      expect(limiter.getQueueLength()).toBe(0);

      await longOp;
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });

      const stats1 = limiter.getStats();
      expect(stats1).toEqual({
        activeCount: 0,
        queueLength: 0,
        maxConcurrency: 2,
        isAtCapacity: false,
      });

      // Start one operation
      const op = limiter.execute(async () => {
        const statsWhileRunning = limiter.getStats();
        expect(statsWhileRunning.activeCount).toBe(1);
        expect(statsWhileRunning.isAtCapacity).toBe(false);
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      await op;

      const stats3 = limiter.getStats();
      expect(stats3.activeCount).toBe(0);
    });

    it('should show isAtCapacity correctly', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });

      const op = limiter.execute(async () => {
        expect(limiter.isAtCapacity()).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(limiter.isAtCapacity()).toBe(true);

      await op;
      expect(limiter.isAtCapacity()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid sequential operations', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });
      const results: number[] = [];

      for (let i = 0; i < 10; i++) {
        await limiter.execute(async () => {
          results.push(i);
          return i;
        });
      }

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle operation that returns undefined', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });
      const result = await limiter.execute(async () => undefined);
      expect(result).toBeUndefined();
    });

    it('should handle operation that returns null', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });
      const result = await limiter.execute(async () => null);
      expect(result).toBeNull();
    });

    it('should propagate operation errors correctly', async () => {
      const limiter = new ConcurrencyLimiter({ maxConcurrency: 1 });
      const customError = new Error('Custom error');

      await expect(limiter.execute(async () => {
        throw customError;
      })).rejects.toBe(customError);
    });
  });
});

describe('createConcurrencyLimiter', () => {
  it('should create a ConcurrencyLimiter instance', () => {
    const limiter = createConcurrencyLimiter({ maxConcurrency: 5 });
    expect(limiter).toBeInstanceOf(ConcurrencyLimiter);
    expect(limiter.getMaxConcurrency()).toBe(5);
  });

  it('should use default options when none provided', () => {
    const limiter = createConcurrencyLimiter();
    expect(limiter.getMaxConcurrency()).toBe(Infinity);
  });
});

describe('withConcurrencyLimit', () => {
  it('should execute operation with limiter', async () => {
    const limiter = createConcurrencyLimiter({ maxConcurrency: 2 });
    const result = await withConcurrencyLimit(async () => 'success', limiter);
    expect(result).toBe('success');
  });
});

describe('QueueTimeoutError', () => {
  it('should have correct properties', () => {
    const error = new QueueTimeoutError(5000, 3);
    expect(error.name).toBe('QueueTimeoutError');
    expect(error.timeout).toBe(5000);
    expect(error.queueLength).toBe(3);
    expect(error.message).toContain('5000ms');
    expect(error.message).toContain('3 operations');
  });
});

describe('DEFAULT_CONCURRENCY_OPTIONS', () => {
  it('should have expected defaults', () => {
    expect(DEFAULT_CONCURRENCY_OPTIONS.maxConcurrency).toBe(Infinity);
    expect(DEFAULT_CONCURRENCY_OPTIONS.queueTimeout).toBe(30000);
  });
});

describe('Integration with VerifactuClient pattern', () => {
  it('should handle concurrent invoice-like submissions', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });
    const processedIds: string[] = [];

    const submitInvoice = async (id: string) => {
      return limiter.execute(async () => {
        // Simulate network call
        await new Promise(resolve => setTimeout(resolve, 20));
        processedIds.push(id);
        return { id, status: 'accepted' };
      });
    };

    const start = Date.now();
    const results = await Promise.all([
      submitInvoice('INV-001'),
      submitInvoice('INV-002'),
      submitInvoice('INV-003'),
      submitInvoice('INV-004'),
    ]);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(4);
    expect(results.every(r => r.status === 'accepted')).toBe(true);
    // With concurrency 2, should take ~40ms (2 batches of 20ms each)
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(100);
  });

  it('should handle mixed success and failure operations', async () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });

    const operations = [
      limiter.execute(async () => ({ success: true, id: 1 })),
      limiter.execute(async () => { throw new Error('Network error'); }),
      limiter.execute(async () => ({ success: true, id: 3 })),
    ];

    const results = await Promise.allSettled(operations);

    expect(results[0]).toEqual({ status: 'fulfilled', value: { success: true, id: 1 } });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: { success: true, id: 3 } });

    // All slots should be released
    expect(limiter.getActiveCount()).toBe(0);
  });
});
