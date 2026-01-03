/**
 * Test fixture for Phase 7.7.3: Bottleneck detection patterns
 * Contains various loop and async patterns for key statement extraction testing.
 */

// Example 1: Sequential await in for-of loop (bottleneck)
export async function processFilesSequential(files: string[]): Promise<void> {
  for (const file of files) {
    await processFile(file);
  }
}

// Example 2: Batch processing with Promise.all (efficient)
export async function processFilesBatch(files: string[]): Promise<void> {
  await Promise.all(files.map((file) => processFile(file)));
}

// Example 3: Classic for loop
export function countItems(items: number[]): number {
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += items[i];
  }
  return sum;
}

// Example 4: While loop with condition
export function waitForCondition(getValue: () => number): number {
  let value = getValue();
  while (value < 100) {
    value = getValue();
  }
  return value;
}

// Example 5: Promise.allSettled pattern
export async function processWithSettled(urls: string[]): Promise<void> {
  const results = await Promise.allSettled(urls.map((url) => fetch(url)));
  console.log(results);
}

// Example 6: For-in loop (object iteration)
export function collectKeys(obj: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
  }
  return keys;
}

// Example 7: Sequential await in while loop (bottleneck)
export async function pollUntilReady(check: () => Promise<boolean>): Promise<void> {
  let ready = false;
  while (!ready) {
    ready = await check();
  }
}

// Helper function (private)
async function processFile(path: string): Promise<void> {
  // Simulated file processing
  console.log(`Processing ${path}`);
}

// Helper for fetch
declare function fetch(url: string): Promise<Response>;
interface Response {
  ok: boolean;
}
