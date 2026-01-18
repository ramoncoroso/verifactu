/**
 * Concurrency Limiter for Verifactu
 *
 * Controls the number of concurrent requests to AEAT services.
 * Uses a semaphore-like pattern to limit simultaneous operations.
 */

/**
 * Options for concurrency limiting
 */
export interface ConcurrencyOptions {
  /** Maximum number of concurrent operations (default: unlimited) */
  maxConcurrency?: number;
  /** Timeout in ms for waiting in queue (default: 30000) */
  queueTimeout?: number;
}

/**
 * Default concurrency options
 */
export const DEFAULT_CONCURRENCY_OPTIONS: Required<ConcurrencyOptions> = {
  maxConcurrency: Infinity,
  queueTimeout: 30000,
};

/**
 * Error thrown when queue timeout is exceeded
 */
export class QueueTimeoutError extends Error {
  readonly timeout: number;
  readonly queueLength: number;

  constructor(timeout: number, queueLength: number) {
    super(`Queue timeout exceeded: waited ${timeout}ms with ${queueLength} operations in queue`);
    this.name = 'QueueTimeoutError';
    this.timeout = timeout;
    this.queueLength = queueLength;
  }
}

/**
 * Queued operation waiting for a slot
 */
interface QueuedOperation {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Concurrency limiter using semaphore pattern
 *
 * Limits the number of concurrent async operations. Operations that exceed
 * the limit are queued and executed when a slot becomes available.
 */
export class ConcurrencyLimiter {
  private readonly maxConcurrency: number;
  private readonly queueTimeout: number;
  private activeCount: number = 0;
  private readonly queue: QueuedOperation[] = [];

  constructor(options: ConcurrencyOptions = {}) {
    const opts = { ...DEFAULT_CONCURRENCY_OPTIONS, ...options };
    this.maxConcurrency = Math.max(1, Math.floor(opts.maxConcurrency));
    this.queueTimeout = Math.max(0, Math.floor(opts.queueTimeout));
  }

  /**
   * Execute an operation with concurrency limiting
   *
   * If the concurrency limit is reached, the operation will be queued
   * and executed when a slot becomes available.
   *
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws QueueTimeoutError if queue timeout is exceeded
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // If unlimited concurrency, just run the operation
    if (this.maxConcurrency === Infinity) {
      return operation();
    }

    // Wait for a slot if at capacity
    if (this.activeCount >= this.maxConcurrency) {
      await this.waitForSlot();
    }

    // Acquire slot
    this.activeCount++;

    try {
      return await operation();
    } finally {
      // Release slot and process queue
      this.activeCount--;
      this.processQueue();
    }
  }

  /**
   * Wait for a slot to become available
   */
  private waitForSlot(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue on timeout
        const index = this.queue.findIndex(q => q.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new QueueTimeoutError(this.queueTimeout, this.queue.length));
      }, this.queueTimeout);

      this.queue.push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Process the next item in queue
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timeoutId);
        next.resolve();
      }
    }
  }

  /**
   * Get current number of active operations
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the maximum concurrency limit
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Check if the limiter is at capacity
   */
  isAtCapacity(): boolean {
    return this.activeCount >= this.maxConcurrency;
  }

  /**
   * Get statistics about the limiter
   */
  getStats(): ConcurrencyStats {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      isAtCapacity: this.isAtCapacity(),
    };
  }
}

/**
 * Statistics about concurrency limiter state
 */
export interface ConcurrencyStats {
  /** Number of currently active operations */
  activeCount: number;
  /** Number of operations waiting in queue */
  queueLength: number;
  /** Maximum allowed concurrent operations */
  maxConcurrency: number;
  /** Whether the limiter is at capacity */
  isAtCapacity: boolean;
}

/**
 * Create a concurrency limiter
 */
export function createConcurrencyLimiter(options?: ConcurrencyOptions): ConcurrencyLimiter {
  return new ConcurrencyLimiter(options);
}

/**
 * Execute an operation with concurrency limiting using a shared limiter
 *
 * This is a convenience function for one-off usage.
 * For repeated use, create a ConcurrencyLimiter instance.
 */
export async function withConcurrencyLimit<T>(
  operation: () => Promise<T>,
  limiter: ConcurrencyLimiter
): Promise<T> {
  return limiter.execute(operation);
}
