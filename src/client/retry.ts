/**
 * Retry utility with exponential backoff
 *
 * Provides automatic retry functionality for network operations
 * with configurable exponential backoff and jitter.
 */

import { VerifactuError, type RetryInfo } from '../errors/base-error.js';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitterFactor?: number;
  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Validate retry options and return sanitized values
 */
function validateAndSanitizeOptions(options: RetryOptions): Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> & Pick<RetryOptions, 'isRetryable' | 'onRetry'> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries));
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? DEFAULT_RETRY_OPTIONS.initialDelayMs);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs);
  const backoffMultiplier = Math.max(1, options.backoffMultiplier ?? DEFAULT_RETRY_OPTIONS.backoffMultiplier);
  const jitterFactor = Math.max(0, Math.min(1, options.jitterFactor ?? DEFAULT_RETRY_OPTIONS.jitterFactor));

  return {
    maxRetries,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitterFactor,
    isRetryable: options.isRetryable,
    onRetry: options.onRetry,
  };
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  options: RetryOptions = {}
): number {
  const {
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_OPTIONS.backoffMultiplier,
    jitterFactor = DEFAULT_RETRY_OPTIONS.jitterFactor,
  } = options;

  // Sanitize inputs to prevent negative or invalid values
  const safeInitialDelay = Math.max(0, initialDelayMs);
  const safeMaxDelay = Math.max(safeInitialDelay, maxDelayMs);
  const safeMultiplier = Math.max(1, backoffMultiplier);
  const safeJitter = Math.max(0, Math.min(1, jitterFactor));
  const safeAttempt = Math.max(0, Math.floor(attempt));

  // Calculate base delay with exponential backoff
  const baseDelay = safeInitialDelay * Math.pow(safeMultiplier, safeAttempt);

  // Add jitter
  const jitter = baseDelay * safeJitter * (Math.random() * 2 - 1);
  const delayWithJitter = baseDelay + jitter;

  // Clamp to max delay
  return Math.min(Math.max(0, delayWithJitter), safeMaxDelay);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Check if it's a VerifactuError with retry info
  if (error instanceof VerifactuError) {
    return error.isRetryable();
  }

  // Check for common retryable error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('timeout')
    );
  }

  return false;
}

/**
 * Get retry info from error if available
 */
export function getRetryInfoFromError(error: unknown): RetryInfo | undefined {
  if (error instanceof VerifactuError) {
    return error.retry;
  }
  return undefined;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with retry logic
 *
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  // Validate and sanitize options
  const sanitized = validateAndSanitizeOptions(options);
  const {
    maxRetries,
    isRetryable = isRetryableError,
    onRetry,
  } = sanitized;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay, considering error's retry info if available
      const retryInfo = getRetryInfoFromError(error);
      let delayMs: number;

      if (retryInfo?.retryAfterMs !== undefined) {
        // Use error's suggested delay (but ensure it's non-negative)
        delayMs = Math.max(0, retryInfo.retryAfterMs);
      } else {
        // Calculate exponential backoff
        delayMs = calculateBackoffDelay(attempt, sanitized);
      }

      // Notify callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delayMs);
      }

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Result of a retry operation with metadata
 */
export interface RetryResult<T> {
  /** The result value */
  result: T;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTimeMs: number;
}

/**
 * Execute an async operation with retry logic and return metadata
 *
 * @param operation - The async operation to retry
 * @param options - Retry configuration options
 * @returns The result with retry metadata
 */
export async function withRetryAndMetadata<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const result = await withRetry(async () => {
    attempts++;
    return operation();
  }, options);

  return {
    result,
    attempts,
    totalTimeMs: Date.now() - startTime,
  };
}
