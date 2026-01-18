/**
 * Tests for Retry Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withRetryAndMetadata,
  calculateBackoffDelay,
  isRetryableError,
  getRetryInfoFromError,
} from '../../src/client/retry.js';
import { VerifactuError, ErrorCode } from '../../src/errors/base-error.js';
import { NetworkError, TimeoutError, ConnectionError, SoapError } from '../../src/errors/network-errors.js';

describe('Retry Utility', () => {
  describe('calculateBackoffDelay', () => {
    it('should calculate delay for first attempt', () => {
      const delay = calculateBackoffDelay(0, { initialDelayMs: 1000, jitterFactor: 0 });
      expect(delay).toBe(1000);
    });

    it('should apply exponential backoff', () => {
      const delay0 = calculateBackoffDelay(0, { initialDelayMs: 1000, jitterFactor: 0 });
      const delay1 = calculateBackoffDelay(1, { initialDelayMs: 1000, jitterFactor: 0 });
      const delay2 = calculateBackoffDelay(2, { initialDelayMs: 1000, jitterFactor: 0 });

      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(4000);
    });

    it('should respect maxDelayMs', () => {
      const delay = calculateBackoffDelay(10, {
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        jitterFactor: 0,
      });

      expect(delay).toBe(5000);
    });

    it('should apply custom backoff multiplier', () => {
      const delay = calculateBackoffDelay(1, {
        initialDelayMs: 1000,
        backoffMultiplier: 3,
        jitterFactor: 0,
      });

      expect(delay).toBe(3000);
    });

    it('should add jitter when jitterFactor > 0', () => {
      const delays = new Set<number>();

      for (let i = 0; i < 100; i++) {
        delays.add(
          calculateBackoffDelay(0, {
            initialDelayMs: 1000,
            jitterFactor: 0.2,
          })
        );
      }

      // Should have some variation due to jitter
      expect(delays.size).toBeGreaterThan(1);

      // All values should be within jitter range (20% = +-200ms from 1000)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(1200);
      }
    });

    it('should use default options', () => {
      const delay = calculateBackoffDelay(0);
      // Default is initialDelayMs: 1000, with some jitter
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for VerifactuError with retryable = true', () => {
      const error = new VerifactuError('Test', ErrorCode.NETWORK_ERROR, {
        retry: { retryable: true },
      });

      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for VerifactuError with retryable = false', () => {
      const error = new VerifactuError('Test', ErrorCode.VALIDATION_ERROR, {
        retry: { retryable: false },
      });

      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for VerifactuError without retry info', () => {
      const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for NetworkError', () => {
      const error = new NetworkError('Connection failed');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('request', 5000);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for ConnectionError', () => {
      const error = new ConnectionError('api.example.com');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for SoapError', () => {
      const error = new SoapError('Fault');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for generic Error with network keywords', () => {
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isRetryableError(new Error('socket hang up'))).toBe(true);
      expect(isRetryableError(new Error('network error'))).toBe(true);
      expect(isRetryableError(new Error('request timeout'))).toBe(true);
    });

    it('should return false for generic Error without network keywords', () => {
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Validation failed'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isRetryableError('error string')).toBe(false);
      expect(isRetryableError(123)).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe('getRetryInfoFromError', () => {
    it('should return retry info from VerifactuError', () => {
      const error = new VerifactuError('Test', ErrorCode.NETWORK_ERROR, {
        retry: { retryable: true, retryAfterMs: 1000, maxRetries: 3 },
      });

      const info = getRetryInfoFromError(error);

      expect(info).toEqual({ retryable: true, retryAfterMs: 1000, maxRetries: 3 });
    });

    it('should return undefined for non-VerifactuError', () => {
      expect(getRetryInfoFromError(new Error('Test'))).toBeUndefined();
      expect(getRetryInfoFromError('error')).toBeUndefined();
      expect(getRetryInfoFromError(null)).toBeUndefined();
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('First fail'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        initialDelayMs: 1,
        jitterFactor: 0,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect maxRetries', async () => {
      const operation = vi.fn().mockRejectedValue(new NetworkError('Always fails'));

      await expect(
        withRetry(operation, {
          maxRetries: 2,
          initialDelayMs: 1,
          jitterFactor: 0,
        })
      ).rejects.toThrow('Always fails');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = new SoapError('Not retryable');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(withRetry(operation, { maxRetries: 3 })).rejects.toThrow('Not retryable');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use custom isRetryable function', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Custom error'))
        .mockResolvedValue('success');

      const isRetryable = vi.fn().mockReturnValue(true);

      const result = await withRetry(operation, {
        isRetryable,
        initialDelayMs: 1,
        jitterFactor: 0,
      });

      expect(result).toBe('success');
      expect(isRetryable).toHaveBeenCalled();
    });

    it('should call onRetry callback', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await withRetry(operation, {
        onRetry,
        initialDelayMs: 1,
        jitterFactor: 0,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(NetworkError), expect.any(Number));
    });

    it('should use error retryAfterMs when available', async () => {
      const error = new VerifactuError('Test', ErrorCode.NETWORK_ERROR, {
        retry: { retryable: true, retryAfterMs: 10 },
      });

      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await withRetry(operation, {
        onRetry,
        initialDelayMs: 1000, // Would be used if error didn't specify
        jitterFactor: 0,
      });

      // onRetry should have received the error-specified delay
      expect(onRetry).toHaveBeenCalledWith(1, error, 10);
    });

    it('should handle multiple retries before success', async () => {
      let callCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new NetworkError(`Fail ${callCount}`);
        }
        return 'finally success';
      });

      const result = await withRetry(operation, {
        maxRetries: 5,
        initialDelayMs: 1,
        jitterFactor: 0,
      });

      expect(result).toBe('finally success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withRetryAndMetadata', () => {
    it('should return result with metadata on success', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const { result, attempts, totalTimeMs } = await withRetryAndMetadata(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(1);
      expect(totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track attempts on retry', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail 1'))
        .mockRejectedValueOnce(new NetworkError('Fail 2'))
        .mockResolvedValue('success');

      const { result, attempts } = await withRetryAndMetadata(operation, {
        initialDelayMs: 1,
        jitterFactor: 0,
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should measure total time including delays', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Fail'))
        .mockResolvedValue('success');

      const { totalTimeMs } = await withRetryAndMetadata(operation, {
        initialDelayMs: 10,
        jitterFactor: 0,
      });

      // Should include at least the delay time
      expect(totalTimeMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Integration with VerifactuClient errors', () => {
    it('should handle TimeoutError retry info', async () => {
      // Use a small timeout to avoid actual waiting in test
      const timeoutError = new TimeoutError('SOAP request', 100);

      const operation = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const result = await withRetry(operation, {
        onRetry,
        initialDelayMs: 1000,
        jitterFactor: 0,
      });

      expect(result).toBe('success');
      // TimeoutError uses min(timeoutMs, 5000) for retryAfterMs
      expect(onRetry).toHaveBeenCalledWith(1, timeoutError, 100);
    });

    it('should verify TimeoutError uses correct retry calculation', () => {
      // Verify the TimeoutError retry calculation without actual waiting
      const timeoutError = new TimeoutError('SOAP request', 30000);
      expect(timeoutError.retry?.retryAfterMs).toBe(5000); // min(30000, 5000) = 5000
      expect(timeoutError.retry?.retryable).toBe(true);
      expect(timeoutError.retry?.maxRetries).toBe(2);

      const smallTimeoutError = new TimeoutError('SOAP request', 2000);
      expect(smallTimeoutError.retry?.retryAfterMs).toBe(2000); // min(2000, 5000) = 2000
    });

    it('should handle ConnectionError with proper retry info', async () => {
      const connError = new ConnectionError('api.aeat.es');

      const operation = vi
        .fn()
        .mockRejectedValueOnce(connError)
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const result = await withRetry(operation, {
        onRetry,
        initialDelayMs: 500,
        jitterFactor: 0,
      });

      expect(result).toBe('success');
      // ConnectionError uses 1000ms retryAfterMs by default
      expect(onRetry).toHaveBeenCalledWith(1, connError, 1000);
    });
  });

  describe('Edge cases', () => {
    it('should handle maxRetries = 0', async () => {
      const operation = vi.fn().mockRejectedValue(new NetworkError('Fail'));

      await expect(withRetry(operation, { maxRetries: 0 })).rejects.toThrow('Fail');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle immediate success with maxRetries = 0', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation, { maxRetries: 0 });

      expect(result).toBe('success');
    });

    it('should use default options when not provided', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should preserve error from final attempt', async () => {
      const lastError = new NetworkError('Final error');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Error 1'))
        .mockRejectedValueOnce(new NetworkError('Error 2'))
        .mockRejectedValue(lastError);

      try {
        await withRetry(operation, {
          maxRetries: 2,
          initialDelayMs: 1,
          jitterFactor: 0,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBe(lastError);
      }
    });

    it('should work with synchronously throwing operations', async () => {
      const operation = vi.fn().mockImplementation(() => {
        throw new NetworkError('Sync throw');
      });

      await expect(
        withRetry(operation, {
          maxRetries: 1,
          initialDelayMs: 1,
          jitterFactor: 0,
        })
      ).rejects.toThrow('Sync throw');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});
