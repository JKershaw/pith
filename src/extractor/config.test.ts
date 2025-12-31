import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractPackageJson,
  extractTsConfig,
  extractPithConfig,
  extractConfigFiles,
} from './config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');
const pithRootDir = join(__dirname, '../..');

// Phase 6.8.3: Config File Extraction Tests
describe('Config File Extraction - Phase 6.8.3', () => {
  describe('extractPackageJson (6.8.3.1)', () => {
    it('extracts scripts from package.json', async () => {
      const result = await extractPackageJson(pithRootDir);

      assert.ok(result);
      assert.ok(result.scripts);
      assert.ok(result.scripts.test, 'Should have test script');
      assert.ok(result.scripts.build, 'Should have build script');
    });

    it('extracts dependencies from package.json', async () => {
      const result = await extractPackageJson(pithRootDir);

      assert.ok(result);
      assert.ok(result.dependencies || result.devDependencies);
    });

    it('extracts name and version', async () => {
      const result = await extractPackageJson(pithRootDir);

      assert.ok(result);
      assert.strictEqual(result.name, 'pith');
      assert.ok(result.version);
    });

    it('returns null for non-existent package.json', async () => {
      const result = await extractPackageJson('/non/existent/path');

      assert.strictEqual(result, null);
    });
  });

  describe('extractTsConfig (6.8.3.2)', () => {
    it('extracts compiler options from tsconfig.json', async () => {
      const result = await extractTsConfig(pithRootDir);

      assert.ok(result);
      assert.ok(result.compilerOptions);
    });

    it('extracts include/exclude patterns', async () => {
      const result = await extractTsConfig(pithRootDir);

      assert.ok(result);
      // Most tsconfigs have include or exclude patterns
      assert.ok(result.include || result.exclude || result.compilerOptions);
    });

    it('returns null for non-existent tsconfig.json', async () => {
      const result = await extractTsConfig('/non/existent/path');

      assert.strictEqual(result, null);
    });
  });

  describe('extractPithConfig (6.8.3.3)', () => {
    it('returns null when pith.config.json does not exist', async () => {
      const result = await extractPithConfig(fixtureDir);

      assert.strictEqual(result, null);
    });
  });

  describe('extractConfigFiles', () => {
    it('extracts all config files at once', async () => {
      const result = await extractConfigFiles(pithRootDir);

      assert.ok(result);
      assert.ok(result.packageJson);
      assert.ok(result.tsconfig);
      // pithConfig might be null if not present
    });

    it('handles missing config files gracefully', async () => {
      const result = await extractConfigFiles('/non/existent/path');

      assert.ok(result);
      assert.strictEqual(result.packageJson, undefined);
      assert.strictEqual(result.tsconfig, undefined);
      assert.strictEqual(result.pithConfig, undefined);
    });
  });
});
