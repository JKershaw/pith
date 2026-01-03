import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createConcurrencyLimiter } from './concurrency.ts';

describe('createConcurrencyLimiter', () => {
  it('returns a limit function', () => {
    const limit = createConcurrencyLimiter(3);
    assert.strictEqual(typeof limit, 'function');
  });

  it('executes a single task and returns its result', async () => {
    const limit = createConcurrencyLimiter(3);
    const result = await limit(async () => 'hello');
    assert.strictEqual(result, 'hello');
  });

  it('respects the concurrency limit', async () => {
    const limit = createConcurrencyLimiter(2);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const task = async (id: number): Promise<number> => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentCount--;
      return id;
    };

    // Start 5 tasks, but only 2 should run at once
    const results = await Promise.all([
      limit(() => task(1)),
      limit(() => task(2)),
      limit(() => task(3)),
      limit(() => task(4)),
      limit(() => task(5)),
    ]);

    assert.strictEqual(maxConcurrent, 2);
    assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
  });

  it('processes queued tasks in FIFO order', async () => {
    const limit = createConcurrencyLimiter(1);
    const completionOrder: number[] = [];

    const task = async (id: number): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completionOrder.push(id);
    };

    await Promise.all([limit(() => task(1)), limit(() => task(2)), limit(() => task(3))]);

    assert.deepStrictEqual(completionOrder, [1, 2, 3]);
  });

  it('propagates errors without breaking the queue', async () => {
    const limit = createConcurrencyLimiter(1);
    const results: Array<string | Error> = [];

    const successTask = async (id: number): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `success-${id}`;
    };

    const failTask = async (): Promise<string> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error('task failed');
    };

    // Run tasks, second one will fail
    const promises = [
      limit(() => successTask(1)).then((r) => results.push(r)),
      limit(() => failTask()).catch((e) => results.push(e)),
      limit(() => successTask(3)).then((r) => results.push(r)),
    ];

    await Promise.all(promises);

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0], 'success-1');
    assert.ok(results[1] instanceof Error);
    assert.strictEqual((results[1] as Error).message, 'task failed');
    assert.strictEqual(results[2], 'success-3');
  });

  it('handles concurrency limit of 1 (sequential execution)', async () => {
    const limit = createConcurrencyLimiter(1);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const task = async (): Promise<void> => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCount--;
    };

    await Promise.all([limit(() => task()), limit(() => task()), limit(() => task())]);

    assert.strictEqual(maxConcurrent, 1);
  });

  it('handles concurrency limit greater than task count', async () => {
    const limit = createConcurrencyLimiter(10);
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const task = async (id: number): Promise<number> => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setTimeout(resolve, 20));
      concurrentCount--;
      return id;
    };

    // Only 3 tasks, but limit is 10
    const results = await Promise.all([
      limit(() => task(1)),
      limit(() => task(2)),
      limit(() => task(3)),
    ]);

    // All 3 should run concurrently
    assert.strictEqual(maxConcurrent, 3);
    assert.deepStrictEqual(results, [1, 2, 3]);
  });

  it('releases slot even when task throws synchronously', async () => {
    const limit = createConcurrencyLimiter(1);

    const syncThrow = async (): Promise<never> => {
      throw new Error('sync error');
    };

    const normalTask = async (): Promise<string> => {
      return 'completed';
    };

    // First task throws
    await limit(() => syncThrow()).catch(() => {});

    // Second task should still run (slot was released)
    const result = await limit(() => normalTask());
    assert.strictEqual(result, 'completed');
  });

  it('handles many concurrent tasks without deadlock', async () => {
    const limit = createConcurrencyLimiter(3);
    const taskCount = 50;
    let completed = 0;

    const task = async (id: number): Promise<number> => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      completed++;
      return id;
    };

    const promises = Array.from({ length: taskCount }, (_, i) => limit(() => task(i)));
    const results = await Promise.all(promises);

    assert.strictEqual(completed, taskCount);
    assert.strictEqual(results.length, taskCount);
    // Verify all IDs are present
    const sortedResults = [...results].sort((a, b) => a - b);
    assert.deepStrictEqual(
      sortedResults,
      Array.from({ length: taskCount }, (_, i) => i)
    );
  });
});
