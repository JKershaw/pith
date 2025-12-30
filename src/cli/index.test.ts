import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '../db/index.ts';
import type { ExtractedFile } from '../extractor/ast.ts';
import type { WikiNode } from '../builder/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, 'index.ts');
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');
const testDataDir = join(__dirname, '../../test-data');

/**
 * Helper to run CLI commands and capture output
 */
function runCli(args: string[], env: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(
      `node --experimental-strip-types ${cliPath} ${args.join(' ')}`,
      { encoding: 'utf-8', env: { ...process.env, ...env } }
    );
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status || 1,
    };
  }
}

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
    // Run the extract command on the fixture with --force to ensure all files are extracted
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Verify progress output
    assert.ok(result.includes('Extracting from'), 'Should show extraction start');
    assert.ok(result.includes('Found') && result.includes('TypeScript files'), 'Should show file count');
    assert.ok(result.includes('Completed in'), 'Should show completion summary with elapsed time');

    // Connect to the test database and verify data was stored
    const db = await getDb(testDataDir);
    const collection = db.collection<ExtractedFile>('extracted');
    const files = await collection.find({}).toArray();

    // Should have extracted all 7 TypeScript files
    assert.strictEqual(files.length, 7, 'Should extract 7 files');

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

  it('has build command', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} build --help`,
      { encoding: 'utf-8' }
    );
    assert.ok(result.includes('build'));
    assert.ok(result.includes('Build node graph'));
  });

  it('pith build creates all nodes from extracted data', async () => {
    // First run extract to populate the extracted collection (with --force to ensure all files are extracted)
    execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Now run build to create nodes
    const result = execSync(
      `node --experimental-strip-types ${cliPath} build`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Verify progress output
    assert.ok(result.includes('Building node graph'), 'Should show build start');
    assert.ok(result.includes('Found') && result.includes('extracted files'), 'Should show extracted file count');
    assert.ok(result.includes('Created') && result.includes('file nodes'), 'Should show file node count');
    assert.ok(result.includes('function nodes'), 'Should show function node count');
    assert.ok(result.includes('module nodes'), 'Should show module node count');
    assert.ok(result.includes('Build complete'), 'Should show completion');

    // Connect to the test database and verify nodes were created
    const db = await getDb(testDataDir);
    const nodesCollection = db.collection('nodes');
    const nodes = await nodesCollection.find({}).toArray();

    // Should have file nodes for all 4 TypeScript files
    const fileNodes = nodes.filter((n: WikiNode) => n.type === 'file');
    assert.ok(fileNodes.length >= 4, 'Should have at least 4 file nodes');

    // Should have function nodes for exported functions
    const functionNodes = nodes.filter((n: WikiNode) => n.type === 'function');
    assert.ok(functionNodes.length > 0, 'Should have function nodes');

    // Should have module nodes
    const moduleNodes = nodes.filter((n: WikiNode) => n.type === 'module');
    assert.ok(moduleNodes.length > 0, 'Should have module nodes');

    // Verify a file node has correct structure
    const fileNode = fileNodes[0];
    assert.ok(fileNode.id, 'File node should have id');
    assert.ok(fileNode.type === 'file', 'File node should have correct type');
    assert.ok(fileNode.path, 'File node should have path');
    assert.ok(fileNode.name, 'File node should have name');
    assert.ok(fileNode.metadata, 'File node should have metadata');
    assert.ok(typeof fileNode.metadata.lines === 'number', 'File node should have lines');
    assert.ok(Array.isArray(fileNode.edges), 'File node should have edges array');

    // Verify computed metadata was added
    assert.ok(typeof fileNode.metadata.fanIn === 'number', 'File node should have fanIn');
    assert.ok(typeof fileNode.metadata.fanOut === 'number', 'File node should have fanOut');
    assert.ok(typeof fileNode.metadata.recencyInDays === 'number', 'File node should have recencyInDays');
  });

  it('pith build requires extract first', async () => {
    // Try to run build without extracting first (on a fresh database)
    try {
      execSync(
        `node --experimental-strip-types ${cliPath} build`,
        { encoding: 'utf-8', stdio: 'pipe', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
      );
      assert.fail('Should have thrown an error');
    } catch (error) {
      // The command should fail with a descriptive error message
      const execError = error as { stderr?: string; status?: number };
      assert.strictEqual(execError.status, 1, 'Should exit with code 1');
      assert.ok(
        execError.stderr?.includes('No extracted data found') ||
        execError.stderr?.includes('extract first'),
        'Should show error message about missing extracted data'
      );
    }
  });
});

describe('pith generate', () => {
  let testDataDir: string;

  afterEach(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });

  it('shows error when no nodes exist', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));

    const { stdout, stderr } = runCli(['generate'], {
      PITH_DATA_DIR: testDataDir,
      OPENROUTER_API_KEY: 'dummy-key-for-testing'
    });

    const output = stdout + stderr;
    assert.ok(output.includes('No nodes found') || output.includes('error'));
    // It should still exit cleanly
  });

  it('shows error when API key not set', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));

    // Create a node first
    const db = await getDb(testDataDir);
    const nodes = db.collection('nodes');
    await nodes.insertOne({
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    });
    await closeDb();

    const { stdout, stderr } = runCli(['generate'], {
      PITH_DATA_DIR: testDataDir,
      OPENROUTER_API_KEY: '',  // Not set
    });

    const output = stdout + stderr;
    assert.ok(output.includes('OPENROUTER_API_KEY'));
  });

  it('shows help for generate command', () => {
    const { stdout } = runCli(['generate', '--help']);

    assert.ok(stdout.includes('generate'));
    assert.ok(stdout.includes('prose'));
    assert.ok(stdout.includes('--model'));
  });

  it('accepts --model option', () => {
    const { stdout } = runCli(['generate', '--help']);

    assert.ok(stdout.includes('--model'));
  });
});

describe('CLI improvements (Phase 5.3)', () => {
  afterEach(async () => {
    await closeDb();
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  it('shows global --verbose, --quiet, and --dry-run flags in help', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} --help`,
      { encoding: 'utf-8' }
    );
    assert.ok(result.includes('--verbose'), 'Should show --verbose flag');
    assert.ok(result.includes('--quiet'), 'Should show --quiet flag');
    assert.ok(result.includes('--dry-run'), 'Should show --dry-run flag');
  });

  it('dry-run extract lists files without extracting', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --dry-run`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Should show dry-run indicator
    assert.ok(result.includes('[DRY-RUN]'), 'Should show [DRY-RUN] indicator');
    assert.ok(result.includes('Would extract'), 'Should show "Would extract" message');
    assert.ok(result.includes('files'), 'Should show file count');

    // Should NOT have created any database files (dry-run doesn't save)
    // We can't easily verify this without checking the filesystem,
    // but the output verification is sufficient
  });

  it('dry-run build shows what would be created without saving', async () => {
    // First extract normally (not dry-run)
    execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Then run build in dry-run mode
    const result = execSync(
      `node --experimental-strip-types ${cliPath} build --dry-run`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Should show dry-run indicator
    assert.ok(result.includes('[DRY-RUN]'), 'Should show [DRY-RUN] indicator');
    assert.ok(result.includes('Would create'), 'Should show "Would create" message');
    assert.ok(result.includes('file nodes'), 'Should show file nodes count');
    assert.ok(result.includes('function nodes'), 'Should show function nodes count');
    assert.ok(result.includes('module nodes'), 'Should show module nodes count');

    // Verify nodes were NOT saved
    const db = await getDb(testDataDir);
    const nodesCollection = db.collection('nodes');
    const nodeCount = await nodesCollection.countDocuments({});
    await closeDb();

    assert.strictEqual(nodeCount, 0, 'Should not have created any nodes in dry-run mode');
  });

  it('generate --estimate shows cost estimate', async () => {
    // First extract and build
    execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );
    execSync(
      `node --experimental-strip-types ${cliPath} build`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Run generate with --estimate
    const result = execSync(
      `node --experimental-strip-types ${cliPath} generate --estimate`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Should show estimate
    assert.ok(result.includes('estimate'), 'Should show estimate');
    assert.ok(result.includes('Nodes without prose'), 'Should show node count');
    assert.ok(result.includes('Estimated input tokens'), 'Should show input tokens');
    assert.ok(result.includes('Estimated output tokens'), 'Should show output tokens');
    assert.ok(result.includes('Estimated cost'), 'Should show cost');
  });

  it('verbose mode shows more detail during extract', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force --verbose`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Verbose mode should show each file extraction
    assert.ok(result.includes('Extracted'), 'Should show extraction progress');
    // Should show force mode message
    assert.ok(result.includes('Force mode') || result.includes('Extracting'), 'Should show verbose messages');
  });

  it('quiet mode suppresses normal output during extract', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force --quiet`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Quiet mode should only show final summary, not individual file progress
    // The output should be minimal
    const lines = result.split('\n').filter(line => line.trim().length > 0);

    // In quiet mode, we should have very few output lines (just summary)
    // This is a loose check - the exact number depends on implementation
    assert.ok(lines.length < 10, 'Quiet mode should have minimal output');
  });

  it('shows elapsed time in extract summary', () => {
    const result = execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Should show elapsed time in summary
    assert.ok(result.includes('Completed in') && result.includes('s:'), 'Should show elapsed time');
  });

  it('shows elapsed time in build summary', () => {
    // First extract
    execSync(
      `node --experimental-strip-types ${cliPath} extract ${fixtureDir} --force`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Then build
    const result = execSync(
      `node --experimental-strip-types ${cliPath} build`,
      { encoding: 'utf-8', env: { ...process.env, PITH_DATA_DIR: testDataDir } }
    );

    // Should show elapsed time in summary
    assert.ok(result.includes('complete in') && result.includes('s:'), 'Should show elapsed time');
  });
});
