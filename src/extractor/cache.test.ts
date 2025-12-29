import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import {
  getFileHash,
  loadExtractionCache,
  saveExtractionCache,
  shouldExtract,
  type ExtractionCache,
} from './cache.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, '../../test/cache-test-temp');

describe('cache', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getFileHash', () => {
    it('computes hash for a file (C1)', async () => {
      const filePath = join(testDir, 'test.ts');
      await writeFile(filePath, 'console.log("test");');

      const hash = await getFileHash(filePath);

      assert.ok(typeof hash === 'string');
      assert.ok(hash.startsWith('sha256-'));
      assert.ok(hash.length > 10);
    });

    it('returns same hash for identical content (C2)', async () => {
      const filePath1 = join(testDir, 'test1.ts');
      const filePath2 = join(testDir, 'test2.ts');
      const content = 'export const x = 42;';

      await writeFile(filePath1, content);
      await writeFile(filePath2, content);

      const hash1 = await getFileHash(filePath1);
      const hash2 = await getFileHash(filePath2);

      assert.strictEqual(hash1, hash2);
    });

    it('returns different hash for different content (C3)', async () => {
      const filePath1 = join(testDir, 'test1.ts');
      const filePath2 = join(testDir, 'test2.ts');

      await writeFile(filePath1, 'export const x = 42;');
      await writeFile(filePath2, 'export const y = 99;');

      const hash1 = await getFileHash(filePath1);
      const hash2 = await getFileHash(filePath2);

      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('loadExtractionCache', () => {
    it('returns empty cache when file does not exist (C4)', async () => {
      const cache = await loadExtractionCache(testDir);

      assert.strictEqual(cache.version, 1);
      assert.deepStrictEqual(cache.files, {});
    });

    it('loads existing cache from file (C5)', async () => {
      const cacheData: ExtractionCache = {
        version: 1,
        files: {
          'src/index.ts': {
            hash: 'sha256-abc123',
            extractedAt: '2025-01-01T00:00:00.000Z',
          },
        },
      };

      await writeFile(
        join(testDir, 'extraction-cache.json'),
        JSON.stringify(cacheData, null, 2)
      );

      const cache = await loadExtractionCache(testDir);

      assert.strictEqual(cache.version, 1);
      assert.ok(cache.files['src/index.ts']);
      assert.strictEqual(cache.files['src/index.ts'].hash, 'sha256-abc123');
      assert.strictEqual(cache.files['src/index.ts'].extractedAt, '2025-01-01T00:00:00.000Z');
    });

    it('returns empty cache on invalid JSON (C6)', async () => {
      await writeFile(join(testDir, 'extraction-cache.json'), 'invalid json');

      const cache = await loadExtractionCache(testDir);

      assert.strictEqual(cache.version, 1);
      assert.deepStrictEqual(cache.files, {});
    });
  });

  describe('saveExtractionCache', () => {
    it('saves cache to file (C7)', async () => {
      const cache: ExtractionCache = {
        version: 1,
        files: {
          'src/test.ts': {
            hash: 'sha256-xyz789',
            extractedAt: new Date().toISOString(),
          },
        },
      };

      await saveExtractionCache(testDir, cache);

      // Load it back
      const loaded = await loadExtractionCache(testDir);
      assert.deepStrictEqual(loaded, cache);
    });

    it('overwrites existing cache (C8)', async () => {
      const cache1: ExtractionCache = {
        version: 1,
        files: { 'src/old.ts': { hash: 'sha256-old', extractedAt: '2025-01-01T00:00:00.000Z' } },
      };
      const cache2: ExtractionCache = {
        version: 1,
        files: { 'src/new.ts': { hash: 'sha256-new', extractedAt: '2025-01-02T00:00:00.000Z' } },
      };

      await saveExtractionCache(testDir, cache1);
      await saveExtractionCache(testDir, cache2);

      const loaded = await loadExtractionCache(testDir);
      assert.deepStrictEqual(loaded, cache2);
    });
  });

  describe('shouldExtract', () => {
    it('returns true for new file not in cache (C9)', async () => {
      const cache: ExtractionCache = { version: 1, files: {} };
      const filePath = join(testDir, 'new.ts');
      await writeFile(filePath, 'export const x = 1;');

      const result = await shouldExtract(filePath, 'new.ts', cache);

      assert.strictEqual(result, true);
    });

    it('returns true for file with changed content (C10)', async () => {
      const filePath = join(testDir, 'changed.ts');
      await writeFile(filePath, 'export const x = 1;');

      const oldHash = await getFileHash(filePath);
      const cache: ExtractionCache = {
        version: 1,
        files: {
          'changed.ts': {
            hash: oldHash,
            extractedAt: new Date().toISOString(),
          },
        },
      };

      // Modify the file
      await writeFile(filePath, 'export const x = 2; // changed');

      const result = await shouldExtract(filePath, 'changed.ts', cache);

      assert.strictEqual(result, true);
    });

    it('returns false for unchanged file (C11)', async () => {
      const filePath = join(testDir, 'unchanged.ts');
      await writeFile(filePath, 'export const x = 1;');

      const hash = await getFileHash(filePath);
      const cache: ExtractionCache = {
        version: 1,
        files: {
          'unchanged.ts': {
            hash,
            extractedAt: new Date().toISOString(),
          },
        },
      };

      const result = await shouldExtract(filePath, 'unchanged.ts', cache);

      assert.strictEqual(result, false);
    });
  });
});
