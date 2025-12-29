import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, closeDb } from './index.ts';

describe('database', () => {
  let testDir: string;

  after(async () => {
    await closeDb();
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('can connect and query', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDir);

    // Test basic operations
    const collection = db.collection('test');
    await collection.insertOne({ name: 'test', value: 42 });

    const result = await collection.findOne({ name: 'test' });
    assert.ok(result);
    assert.strictEqual(result.name, 'test');
    assert.strictEqual(result.value, 42);
  });

  it('returns same db instance when called multiple times', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db1 = await getDb(testDir);
    const db2 = await getDb(testDir);
    assert.strictEqual(db1, db2);
  });
});
