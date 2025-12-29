import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findFiles, extractFile, createProject } from './ast.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');

describe('findFiles', () => {
  it('returns all .ts paths in fixture', async () => {
    const files = await findFiles(fixtureDir);

    assert.ok(Array.isArray(files));
    assert.strictEqual(files.length, 4);

    // Should include all TypeScript files
    assert.ok(files.some((f) => f.endsWith('types.ts')));
    assert.ok(files.some((f) => f.endsWith('auth.ts')));
    assert.ok(files.some((f) => f.endsWith('user-service.ts')));
    assert.ok(files.some((f) => f.endsWith('index.ts')));
  });

  it('returns relative paths from project root', async () => {
    const files = await findFiles(fixtureDir);

    for (const file of files) {
      assert.ok(file.startsWith('src/'), `Expected relative path starting with src/, got: ${file}`);
      assert.ok(!file.startsWith('/'), `Expected relative path, got absolute: ${file}`);
    }
  });

  it('excludes non-.ts files', async () => {
    const files = await findFiles(fixtureDir);

    for (const file of files) {
      assert.ok(file.endsWith('.ts'), `Expected .ts file, got: ${file}`);
    }
  });
});

describe('extractFile', () => {
  it('returns correct path (A1)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/types.ts');

    assert.strictEqual(result.path, 'src/types.ts');
  });

  it('returns correct line count (A2)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/types.ts');

    // types.ts has 21 lines of content (ts-morph reports last line number)
    assert.ok(result.lines >= 21, `Expected at least 21 lines, got ${result.lines}`);
    assert.ok(result.lines <= 22, `Expected at most 22 lines, got ${result.lines}`);
  });

  it('extracts imports (A3)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(result.imports));
    assert.strictEqual(result.imports.length, 1);

    const imp = result.imports[0];
    assert.ok(imp);
    assert.strictEqual(imp.from, './types.ts');
    assert.deepStrictEqual(imp.names, ['User', 'Session']);
    assert.strictEqual(imp.isTypeOnly, true);
  });
});
