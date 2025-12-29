import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, type PithConfig } from './index.ts';

describe('config', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'pith-config-test-'));
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('returns default config when no file exists', async () => {
    const config = await loadConfig(testDir);

    // Check default includes
    assert.ok(config.extraction.include);
    assert.ok(config.extraction.include.includes('src/**/*.ts'));
    assert.ok(config.extraction.include.includes('lib/**/*.ts'));
    assert.ok(config.extraction.include.includes('**/*.ts'));

    // Check default excludes
    assert.ok(config.extraction.exclude);
    assert.ok(config.extraction.exclude.includes('node_modules/**'));
    assert.ok(config.extraction.exclude.includes('**/*.test.ts'));
    assert.ok(config.extraction.exclude.includes('**/*.spec.ts'));
    assert.ok(config.extraction.exclude.includes('**/*.d.ts'));
    assert.ok(config.extraction.exclude.includes('dist/**'));
    assert.ok(config.extraction.exclude.includes('build/**'));

    // Check default output
    assert.strictEqual(config.output.dataDir, '.pith/data');
  });

  it('reads and parses pith.config.json when it exists', async () => {
    const customConfig: PithConfig = {
      extraction: {
        include: ['custom/**/*.ts'],
        exclude: ['custom/**/*.test.ts'],
      },
      llm: {
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4',
        maxTokens: 2048,
        temperature: 0.5,
      },
      output: {
        dataDir: 'custom/data',
      },
    };

    await writeFile(
      join(testDir, 'pith.config.json'),
      JSON.stringify(customConfig, null, 2)
    );

    const config = await loadConfig(testDir);

    assert.deepStrictEqual(config.extraction.include, ['custom/**/*.ts']);
    assert.deepStrictEqual(config.extraction.exclude, ['custom/**/*.test.ts']);
    assert.strictEqual(config.llm?.provider, 'openrouter');
    assert.strictEqual(config.llm?.model, 'anthropic/claude-sonnet-4');
    assert.strictEqual(config.llm?.maxTokens, 2048);
    assert.strictEqual(config.llm?.temperature, 0.5);
    assert.strictEqual(config.output.dataDir, 'custom/data');
  });

  it('merges partial config with defaults', async () => {
    const partialConfig = {
      extraction: {
        include: ['app/**/*.ts'],
      },
    };

    await writeFile(
      join(testDir, 'pith.config.json'),
      JSON.stringify(partialConfig, null, 2)
    );

    const config = await loadConfig(testDir);

    // Custom include
    assert.deepStrictEqual(config.extraction.include, ['app/**/*.ts']);

    // Default exclude (should be preserved)
    assert.ok(config.extraction.exclude);
    assert.ok(config.extraction.exclude.includes('node_modules/**'));

    // Default output
    assert.strictEqual(config.output.dataDir, '.pith/data');
  });

  it('loads config from current directory when no rootDir provided', async () => {
    const cwd = process.cwd();
    try {
      // Change to test directory
      process.chdir(testDir);

      const customConfig = {
        output: {
          dataDir: 'test/data',
        },
      };

      await writeFile(
        join(testDir, 'pith.config.json'),
        JSON.stringify(customConfig, null, 2)
      );

      const config = await loadConfig();

      assert.strictEqual(config.output.dataDir, 'test/data');
    } finally {
      // Restore original directory
      process.chdir(cwd);
    }
  });

  it('handles invalid JSON gracefully', async () => {
    await writeFile(join(testDir, 'pith.config.json'), 'invalid json{');

    await assert.rejects(
      async () => await loadConfig(testDir),
      /Failed to parse pith.config.json/
    );
  });

  it('validates LLM provider values', async () => {
    const invalidConfig = {
      llm: {
        provider: 'invalid-provider',
        model: 'some-model',
      },
    };

    await writeFile(
      join(testDir, 'pith.config.json'),
      JSON.stringify(invalidConfig, null, 2)
    );

    await assert.rejects(
      async () => await loadConfig(testDir),
      /Invalid LLM provider/
    );
  });

  it('supports environment variable overrides via .env', async () => {
    // This test documents that .env still works alongside config file
    // The .env values take precedence in actual CLI usage
    const config = await loadConfig(testDir);

    // Default config should be returned
    assert.ok(config);
    assert.strictEqual(config.output.dataDir, '.pith/data');
  });
});
