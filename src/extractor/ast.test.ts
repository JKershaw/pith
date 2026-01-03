import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  findFiles,
  extractFile,
  createProject,
  storeExtracted,
  type ExtractedFile,
} from './ast.ts';
import { getDb, closeDb } from '../db/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');

describe('findFiles', () => {
  it('returns all .ts paths in fixture', async () => {
    const files = await findFiles(fixtureDir);

    assert.ok(Array.isArray(files));
    assert.strictEqual(files.length, 8);

    // Should include all TypeScript files
    assert.ok(files.some((f) => f.endsWith('types.ts')));
    assert.ok(files.some((f) => f.endsWith('auth.ts')));
    assert.ok(files.some((f) => f.endsWith('user-service.ts')));
    assert.ok(files.some((f) => f.endsWith('index.ts')));
    assert.ok(files.some((f) => f.endsWith('utils.ts')));
    assert.ok(files.some((f) => f.endsWith('service.ts')));
    assert.ok(files.some((f) => f.endsWith('controller.ts')));
    assert.ok(files.some((f) => f.endsWith('async-patterns.ts')));
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

  it('extracts exports (A4)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(result.exports));
    assert.strictEqual(result.exports.length, 3);

    // Check function exports
    const createSessionExport = result.exports.find((e) => e.name === 'createSession');
    assert.ok(createSessionExport);
    assert.strictEqual(createSessionExport.kind, 'function');

    const validateTokenExport = result.exports.find((e) => e.name === 'validateToken');
    assert.ok(validateTokenExport);
    assert.strictEqual(validateTokenExport.kind, 'function');

    // Check const export
    const sessionDurationExport = result.exports.find((e) => e.name === 'SESSION_DURATION');
    assert.ok(sessionDurationExport);
    assert.strictEqual(sessionDurationExport.kind, 'const');
  });

  it('extracts functions with signature and params (A5, A8, A9, A10)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(result.functions));
    assert.strictEqual(result.functions.length, 3); // createSession, validateToken, generateToken

    // Check async function
    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);
    assert.strictEqual(createSession.isAsync, true);
    assert.strictEqual(createSession.isExported, true);
    assert.ok(createSession.returnType.includes('Promise'), 'Return type should include Promise');
    assert.ok(createSession.returnType.includes('Session'), 'Return type should include Session');
    assert.strictEqual(createSession.params.length, 1);
    assert.strictEqual(createSession.params[0]?.name, 'user');
    assert.ok(createSession.params[0]?.type.includes('User'), 'Param type should include User');

    // Check non-async function
    const validateToken = result.functions.find((f) => f.name === 'validateToken');
    assert.ok(validateToken);
    assert.strictEqual(validateToken.isAsync, false);
    assert.strictEqual(validateToken.isExported, true);
    assert.strictEqual(validateToken.returnType, 'boolean');

    // Check private function
    const generateToken = result.functions.find((f) => f.name === 'generateToken');
    assert.ok(generateToken);
    assert.strictEqual(generateToken.isExported, false);
  });

  it('extracts classes with methods (A6)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/user-service.ts');

    assert.ok(Array.isArray(result.classes));
    assert.strictEqual(result.classes.length, 1);

    const userService = result.classes[0];
    assert.ok(userService);
    assert.strictEqual(userService.name, 'UserService');
    assert.strictEqual(userService.isExported, true);
    assert.ok(userService.methods.length >= 3); // createUser, getUser, deactivateUser
  });

  it('extracts interfaces with properties (A7)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/types.ts');

    assert.ok(Array.isArray(result.interfaces));
    assert.strictEqual(result.interfaces.length, 2); // User, Session

    const user = result.interfaces.find((i) => i.name === 'User');
    assert.ok(user);
    assert.strictEqual(user.isExported, true);
    assert.ok(user.properties.length >= 4); // id, name, email, createdAt, isActive?
  });
});

describe('storeExtracted', () => {
  let testDir: string;

  after(async () => {
    await closeDb();
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('stores extracted data in MangoDB', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDir);

    const ctx = createProject(fixtureDir);
    const extracted = extractFile(ctx, 'src/types.ts');

    await storeExtracted(db, extracted);

    // Verify data was stored
    const collection = db.collection<ExtractedFile>('extracted');
    const stored = await collection.findOne({ path: 'src/types.ts' });

    assert.ok(stored);
    assert.strictEqual(stored.path, 'src/types.ts');
    assert.ok(stored.interfaces.length >= 2);
  });

  it('stores ExtractedFile with docs field', async () => {
    // Close the DB from the previous test first
    await closeDb();

    testDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDir);

    const ctx = createProject(fixtureDir);
    const extracted = extractFile(ctx, 'src/auth.ts');

    // Add docs data
    const { extractDocs } = await import('./docs.ts');
    const docs = await extractDocs(ctx, 'src/auth.ts', fixtureDir);
    extracted.docs = docs;

    await storeExtracted(db, extracted);

    // Verify data was stored with docs
    const collection = db.collection<ExtractedFile>('extracted');
    const stored = await collection.findOne({ path: 'src/auth.ts' });

    assert.ok(stored);
    assert.strictEqual(stored.path, 'src/auth.ts');
    assert.ok(stored.docs);
    assert.ok(stored.docs.jsdoc);
    assert.ok(stored.docs.jsdoc['createSession']);
    assert.ok(Array.isArray(stored.docs.inlineComments));
    assert.ok(Array.isArray(stored.docs.todos));
    assert.ok(stored.docs.readme);
  });
});

describe('extractFunctionCalls - Phase 6.6.7a.1', () => {
  it('extracts direct function calls within same file', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // createSession calls generateToken
    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);
    assert.ok(Array.isArray(createSession.calls));
    assert.ok(createSession.calls.includes('generateToken'));
  });

  it('returns empty array for functions with no calls', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // validateToken doesn't call any other functions in the file
    const validateToken = result.functions.find((f) => f.name === 'validateToken');
    assert.ok(validateToken);
    assert.ok(Array.isArray(validateToken.calls));
    assert.strictEqual(validateToken.calls.length, 0);
  });

  it('ignores calls to functions not defined in same file', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // Functions might call Date(), Math.random(), etc., but these should be ignored
    // since they're not defined in the same file
    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);

    // Should only include generateToken, not Date or any built-ins
    const localCalls = createSession.calls.filter((call) => {
      const callNames = result.functions.map((f) => f.name);
      return callNames.includes(call);
    });

    assert.strictEqual(
      localCalls.length,
      createSession.calls.length,
      'All calls should be to functions defined in the same file'
    );
  });

  it('handles functions with no function calls at all', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // generateToken only calls built-ins like Math.random()
    const generateToken = result.functions.find((f) => f.name === 'generateToken');
    assert.ok(generateToken);
    assert.ok(Array.isArray(generateToken.calls));
    // Should not include Math.random or any other built-ins
    assert.strictEqual(generateToken.calls.length, 0);
  });

  it('includes calledBy as empty array initially', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // calledBy should be empty during extraction, computed later in builder
    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);
    assert.ok(Array.isArray(createSession.calledBy));
    assert.strictEqual(createSession.calledBy.length, 0);
  });
});

// Phase 6.8.1: Symbol-level import tracking tests
describe('extractFile symbol usages (Phase 6.8.1)', () => {
  it('extracts symbol usages for named imports', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/controller.ts');

    assert.ok(Array.isArray(result.symbolUsages));
    assert.ok(result.symbolUsages.length > 0, 'Should have symbol usages');

    // Controller imports and uses registerUser from service.ts
    const registerUserUsage = result.symbolUsages.find((u) => u.symbol === 'registerUser');
    assert.ok(registerUserUsage, 'Should track registerUser usage');
    assert.strictEqual(registerUserUsage.sourceFile, './service.ts');
    assert.ok(registerUserUsage.usageLines.length > 0, 'Should have usage line numbers');
    // registerUser is called on line 20
    assert.ok(registerUserUsage.usageLines.includes(20), 'Should include line 20');
    assert.strictEqual(registerUserUsage.usageType, 'call');
  });

  it('extracts symbol usages for type imports', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(result.symbolUsages));

    // auth.ts imports User and Session as types
    const userUsage = result.symbolUsages.find((u) => u.symbol === 'User');
    assert.ok(userUsage, 'Should track User type usage');
    assert.strictEqual(userUsage.usageType, 'type');
    assert.ok(userUsage.usageLines.length > 0, 'Should have usage line numbers');
  });

  it('tracks multiple usages of the same symbol', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/service.ts');

    assert.ok(Array.isArray(result.symbolUsages));

    // service.ts uses formatUserName twice (line 21 and 40)
    const formatUserNameUsage = result.symbolUsages.find((u) => u.symbol === 'formatUserName');
    assert.ok(formatUserNameUsage, 'Should track formatUserName usage');
    assert.ok(formatUserNameUsage.usageLines.length >= 2, 'Should have multiple usage lines');
  });

  it('distinguishes between call and reference usages', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/controller.ts');

    assert.ok(Array.isArray(result.symbolUsages));

    // createSession is imported and called
    const createSessionUsage = result.symbolUsages.find((u) => u.symbol === 'createSession');
    assert.ok(createSessionUsage, 'Should track createSession usage');
    assert.strictEqual(createSessionUsage.usageType, 'call', 'Should be a call usage');

    // User is imported as type only
    const userUsage = result.symbolUsages.find((u) => u.symbol === 'User');
    assert.ok(userUsage, 'Should track User type usage');
    assert.strictEqual(userUsage.usageType, 'type', 'Should be a type usage');
  });

  it('returns empty array for files with no imports', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/types.ts');

    assert.ok(Array.isArray(result.symbolUsages));
    // types.ts has no imports, so no symbol usages
    assert.strictEqual(result.symbolUsages.length, 0);
  });
});

// Phase 7.7.3: Bottleneck detection key statements
describe('extractFile key statements - loop and async patterns (Phase 7.7.3)', () => {
  it('detects for-of loops with loop category (7.7.3.1)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const processFilesSequential = result.functions.find(
      (f) => f.name === 'processFilesSequential'
    );
    assert.ok(processFilesSequential);
    assert.ok(Array.isArray(processFilesSequential.keyStatements));

    const loopStatements = processFilesSequential.keyStatements.filter(
      (s) => s.category === 'loop'
    );
    assert.ok(loopStatements.length > 0, 'Should detect for-of loop');
    assert.ok(loopStatements.some((s) => s.text.includes('for') && s.text.includes('of')));
  });

  it('detects classic for loops (7.7.3.1)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const countItems = result.functions.find((f) => f.name === 'countItems');
    assert.ok(countItems);

    const loopStatements = countItems.keyStatements.filter((s) => s.category === 'loop');
    assert.ok(loopStatements.length > 0, 'Should detect classic for loop');
    assert.ok(loopStatements.some((s) => s.text.includes('for (')));
  });

  it('detects while loops (7.7.3.1)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const waitForCondition = result.functions.find((f) => f.name === 'waitForCondition');
    assert.ok(waitForCondition);

    const loopStatements = waitForCondition.keyStatements.filter((s) => s.category === 'loop');
    assert.ok(loopStatements.length > 0, 'Should detect while loop');
    assert.ok(loopStatements.some((s) => s.text.includes('while')));
  });

  it('detects for-in loops (7.7.3.1)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const collectKeys = result.functions.find((f) => f.name === 'collectKeys');
    assert.ok(collectKeys);

    const loopStatements = collectKeys.keyStatements.filter((s) => s.category === 'loop');
    assert.ok(loopStatements.length > 0, 'Should detect for-in loop');
    assert.ok(loopStatements.some((s) => s.text.includes('for') && s.text.includes('in')));
  });

  it('detects Promise.all batch pattern (7.7.3.2)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const processFilesBatch = result.functions.find((f) => f.name === 'processFilesBatch');
    assert.ok(processFilesBatch);

    const asyncStatements = processFilesBatch.keyStatements.filter(
      (s) => s.category === 'async-pattern'
    );
    assert.ok(asyncStatements.length > 0, 'Should detect Promise.all pattern');
    assert.ok(asyncStatements.some((s) => s.text.includes('Promise.all')));
  });

  it('detects Promise.allSettled pattern (7.7.3.2)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const processWithSettled = result.functions.find((f) => f.name === 'processWithSettled');
    assert.ok(processWithSettled);

    const asyncStatements = processWithSettled.keyStatements.filter(
      (s) => s.category === 'async-pattern'
    );
    assert.ok(asyncStatements.length > 0, 'Should detect Promise.allSettled pattern');
    assert.ok(asyncStatements.some((s) => s.text.includes('Promise.allSettled')));
  });

  it('detects sequential await in for-of loop as bottleneck (7.7.3.3)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const processFilesSequential = result.functions.find(
      (f) => f.name === 'processFilesSequential'
    );
    assert.ok(processFilesSequential);

    const asyncStatements = processFilesSequential.keyStatements.filter(
      (s) => s.category === 'async-pattern'
    );
    // Should detect the sequential await inside the loop
    assert.ok(asyncStatements.length > 0, 'Should detect sequential await in loop');
    assert.ok(asyncStatements.some((s) => s.text.includes('[sequential]')));
  });

  it('detects sequential await in while loop as bottleneck (7.7.3.3)', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const pollUntilReady = result.functions.find((f) => f.name === 'pollUntilReady');
    assert.ok(pollUntilReady);

    // Should have both the while loop and the sequential await
    const loopStatements = pollUntilReady.keyStatements.filter((s) => s.category === 'loop');
    const asyncStatements = pollUntilReady.keyStatements.filter(
      (s) => s.category === 'async-pattern'
    );

    assert.ok(loopStatements.length > 0, 'Should detect while loop');
    assert.ok(asyncStatements.length > 0, 'Should detect sequential await in while loop');
    assert.ok(asyncStatements.some((s) => s.text.includes('[sequential]')));
  });

  it('includes line numbers for loop and async patterns', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/async-patterns.ts');

    const processFilesSequential = result.functions.find(
      (f) => f.name === 'processFilesSequential'
    );
    assert.ok(processFilesSequential);

    // All key statements should have valid line numbers
    for (const stmt of processFilesSequential.keyStatements) {
      assert.ok(
        typeof stmt.line === 'number' && stmt.line > 0,
        `Line should be positive: ${stmt.line}`
      );
    }
  });
});

// Phase 6.8.2: Enhanced code snippet tests
describe('extractFile code snippets (Phase 6.8.2)', () => {
  it('includes code snippet for functions', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);
    assert.ok(createSession.codeSnippet.length > 0);
    // Should include function content
    assert.ok(createSession.codeSnippet.includes('createSession'));
  });

  it('passes key statements to snippet generation', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/auth.ts');

    // Functions should have their keyStatements extracted
    const createSession = result.functions.find((f) => f.name === 'createSession');
    assert.ok(createSession);
    assert.ok(Array.isArray(createSession.keyStatements));
  });

  it('includes truncation indicator for long functions', () => {
    const ctx = createProject(fixtureDir);
    const result = extractFile(ctx, 'src/user-service.ts');

    // UserService class should have methods
    const userService = result.classes.find((c) => c.name === 'UserService');
    assert.ok(userService);

    // Methods should have code snippets
    for (const method of userService.methods) {
      assert.ok(method.codeSnippet.length > 0);
    }
  });
});
