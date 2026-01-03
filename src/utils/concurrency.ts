/**
 * Concurrency limiting utilities for Pith
 * Provides a simple semaphore-based limiter for parallel async operations
 */

/**
 * Creates a concurrency limiter that restricts parallel async operations.
 * Tasks beyond the limit are queued and executed in FIFO order.
 *
 * @param concurrency - Maximum number of concurrent operations (must be >= 1)
 * @returns A limit function that wraps async operations
 *
 * @example
 * ```typescript
 * const limit = createConcurrencyLimiter(5);
 *
 * // These will run with at most 5 concurrent operations
 * const results = await Promise.all(
 *   items.map(item => limit(() => processItem(item)))
 * );
 * ```
 */
export function createConcurrencyLimiter(concurrency: number) {
  const maxConcurrent = Math.max(1, concurrency);
  let activeCount = 0;
  const queue: Array<() => void> = [];

  async function limit<T>(fn: () => Promise<T>): Promise<T> {
    // If at capacity, wait in queue
    if (activeCount >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount++;
    try {
      return await fn();
    } finally {
      activeCount--;
      // Release next waiting task (FIFO)
      const next = queue.shift();
      if (next) next();
    }
  }

  return limit;
}
