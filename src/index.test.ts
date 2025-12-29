import { describe, it } from 'node:test';
import assert from 'node:assert';
import { version } from './index.ts';

describe('pith', () => {
  it('exports a version', () => {
    assert.strictEqual(typeof version, 'string');
    assert.ok(version.length > 0);
  });
});
