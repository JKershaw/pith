import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, 'index.ts');

describe('CLI', () => {
  it('shows help when run with --help', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} --help`,
      { encoding: 'utf-8' }
    );
    assert.ok(result.includes('pith'));
    assert.ok(result.includes('extract'));
  });

  it('has extract command', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract --help`,
      { encoding: 'utf-8' }
    );
    assert.ok(result.includes('extract'));
    assert.ok(result.includes('path'));
  });
});
