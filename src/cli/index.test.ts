import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { getDb, closeDb } from '../db/index.ts';
import type { ExtractedFile } from '../extractor/ast.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, 'index.ts');
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');
const testDataDir = join(__dirname, '../../test-data');

describe('CLI', () => {
  afterEach(async () => {
    // Clean up test database after each test
    await closeDb();
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

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

  it('extracts and stores data from a project', async () => {
    // Run the extract command on the fixture
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir}`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Verify progress output
    assert.ok(result.includes('Extracting from'), 'Should show extraction start');
    assert.ok(result.includes('Found') && result.includes('TypeScript files'), 'Should show file count');
    assert.ok(result.includes('Extracted'), 'Should show per-file progress');
    assert.ok(result.includes('Completed'), 'Should show completion summary');

    // Connect to the test database and verify data was stored
    const db = await getDb(testDataDir);
    const collection = db.collection<ExtractedFile>('extracted');
    const files = await collection.find({}).toArray();

    // Should have extracted all 4 TypeScript files
    assert.strictEqual(files.length, 4, 'Should extract 4 files');

    // Check that each file has required fields
    for (const file of files) {
      // AST fields (from extractFile)
      assert.ok(file.path, 'Should have path');
      assert.ok(file.lines > 0, 'Should have line count');
      assert.ok(Array.isArray(file.imports), 'Should have imports array');
      assert.ok(Array.isArray(file.exports), 'Should have exports array');
      assert.ok(Array.isArray(file.functions), 'Should have functions array');
      assert.ok(Array.isArray(file.classes), 'Should have classes array');
      assert.ok(Array.isArray(file.interfaces), 'Should have interfaces array');

      // Git fields (from extractGitInfo)
      assert.ok(file.git, 'Should have git info');
      assert.ok(typeof file.git.commitCount === 'number', 'Should have commit count');
      assert.ok(file.git.lastModified instanceof Date, 'Should have lastModified date');
      assert.ok(file.git.createdAt instanceof Date, 'Should have createdAt date');
      assert.ok(Array.isArray(file.git.authors), 'Should have authors array');
      assert.ok(typeof file.git.primaryAuthor === 'string', 'Should have primary author');
      assert.ok(Array.isArray(file.git.recentCommits), 'Should have recent commits');

      // Docs fields (from extractDocs)
      assert.ok(file.docs, 'Should have docs info');
      assert.ok(typeof file.docs.jsdoc === 'object', 'Should have jsdoc map');
      assert.ok(Array.isArray(file.docs.inlineComments), 'Should have inline comments array');
      assert.ok(Array.isArray(file.docs.todos), 'Should have todos array');
      assert.ok(Array.isArray(file.docs.deprecations), 'Should have deprecations array');
    }

    // Verify specific file was extracted (e.g., index.ts)
    const indexFile = files.find(f => f.path === 'src/index.ts');
    assert.ok(indexFile, 'Should have extracted src/index.ts');
  });

  it('handles missing path gracefully', () => {
    const nonExistentPath = '/path/that/does/not/exist';

    try {
      execSync(
        `node --experimental-strip-types ${cliPath} extract ${nonExistentPath}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      assert.fail('Should have thrown an error');
    } catch (error) {
      // The command should fail but with a descriptive error message
      const execError = error as { stderr?: string; status?: number };
      assert.strictEqual(execError.status, 1, 'Should exit with code 1');
      assert.ok(
        execError.stderr?.includes('does not exist') ||
        execError.stderr?.includes('Error'),
        'Should show error message about path not existing'
      );
    }
  });

  it('handles parse errors gracefully and continues with other files', async () => {
    // Create a temporary project with mix of valid and invalid files
    const tempDir = join(__dirname, '../../temp-test-project');
    const tempDataDir = join(__dirname, '../../temp-test-data');

    try {
      await mkdir(join(tempDir, 'src'), { recursive: true });

      // Write a valid TypeScript file
      await writeFile(
        join(tempDir, 'src/valid.ts'),
        'export const foo = "bar";'
      );

      // Write an invalid TypeScript file (syntax error)
      await writeFile(
        join(tempDir, 'src/invalid.ts'),
        'export const = "missing name";'
      );

      // Write a tsconfig.json for ts-morph
      await writeFile(
        join(tempDir, 'tsconfig.json'),
        '{"compilerOptions":{"target":"ES2022","module":"ES2022"},"include":["src/**/*.ts"]}'
      );

      // Run the extract command
      const result = execSync(
        `node --experimental-strip-types ${cliPath} extract ${tempDir}`,
        { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: tempDataDir } }
      );

      // Verify the command reported errors but didn't crash
      assert.ok(
        result.includes('Error extracting') || result.includes('Completed'),
        'Should show error message or completion'
      );

      // Check the database - the valid file should still be extracted
      const db = await getDb(tempDataDir);
      const collection = db.collection<ExtractedFile>('extracted');
      const files = await collection.find({}).toArray();

      // At least the valid file should be extracted
      assert.ok(files.length >= 1, 'Should have extracted at least one file');
      const validFile = files.find(f => f.path.includes('valid.ts'));
      assert.ok(validFile, 'Should have extracted the valid file');
    } finally {
      // Clean up
      await closeDb();
      await rm(tempDir, { recursive: true, force: true });
      await rm(tempDataDir, { recursive: true, force: true });
    }
  });
});
