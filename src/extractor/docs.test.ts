import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createProject } from './ast.ts';
import { extractJSDoc, extractInlineComments, extractReadme, extractTodos, extractDeprecations } from './docs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');

describe('extractJSDoc', () => {
  it('extracts JSDoc description from function', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('createSession');

    const jsdoc = extractJSDoc(func);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.description, 'Creates a new session for a user.');
  });

  it('extracts @param tags correctly', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('createSession');

    const jsdoc = extractJSDoc(func);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.params.length, 1);
    assert.strictEqual(jsdoc.params[0]?.name, 'user');
    assert.strictEqual(jsdoc.params[0]?.type, 'User');
    assert.strictEqual(jsdoc.params[0]?.description, 'The user to create a session for');
  });

  it('extracts @returns tag correctly', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('createSession');

    const jsdoc = extractJSDoc(func);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.returns, 'A promise that resolves to the new session');
  });

  it('extracts @throws tag correctly', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('createSession');

    const jsdoc = extractJSDoc(func);

    assert.ok(jsdoc);
    assert.ok(Array.isArray(jsdoc.throws));
    assert.strictEqual(jsdoc.throws.length, 1);
    assert.strictEqual(jsdoc.throws[0], 'Error if the user is not active');
  });

  it('extracts @deprecated tag from class', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/user-service.ts'));
    const cls = sourceFile.getClassOrThrow('UserService');

    const jsdoc = extractJSDoc(cls);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.description, 'Service for managing users.');
    assert.strictEqual(jsdoc.deprecated, 'Use UserRepository instead');
  });

  it('extracts JSDoc from class methods', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/user-service.ts'));
    const cls = sourceFile.getClassOrThrow('UserService');
    const method = cls.getMethodOrThrow('createUser');

    const jsdoc = extractJSDoc(method);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.description, 'Creates a new user.');
    assert.strictEqual(jsdoc.params.length, 2);
    assert.strictEqual(jsdoc.params[0]?.name, 'name');
    assert.strictEqual(jsdoc.params[0]?.description, "The user's name");
    assert.strictEqual(jsdoc.params[1]?.name, 'email');
    assert.strictEqual(jsdoc.params[1]?.description, "The user's email");
    assert.strictEqual(jsdoc.returns, 'The created user');
  });

  it('handles functions without JSDoc gracefully', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('generateToken');

    const jsdoc = extractJSDoc(func);

    assert.strictEqual(jsdoc, null);
  });

  it('extracts multiple @param tags with different types', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/user-service.ts'));
    const cls = sourceFile.getClassOrThrow('UserService');
    const method = cls.getMethodOrThrow('createUser');

    const jsdoc = extractJSDoc(method);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.params.length, 2);
    assert.strictEqual(jsdoc.params[0]?.type, 'string');
    assert.strictEqual(jsdoc.params[1]?.type, 'string');
  });

  it('handles function with only description', () => {
    const ctx = createProject(fixtureDir);
    const sourceFile = ctx.project.addSourceFileAtPath(join(fixtureDir, 'src/auth.ts'));
    const func = sourceFile.getFunctionOrThrow('validateToken');

    const jsdoc = extractJSDoc(func);

    assert.ok(jsdoc);
    assert.strictEqual(jsdoc.description, 'Validates a session token.');
    assert.strictEqual(jsdoc.params.length, 1);
    assert.strictEqual(jsdoc.returns, 'Whether the token is valid');
    assert.strictEqual(jsdoc.throws, undefined);
  });
});

describe('extractInlineComments', () => {
  it('extracts single-line comments with correct text', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(comments));
    assert.ok(comments.length > 0);

    const todoComment = comments.find((c) => c.text.includes('TODO'));
    assert.ok(todoComment);
    assert.strictEqual(todoComment.text, 'TODO: Implement actual token validation');
  });

  it('returns correct line number for comments', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/auth.ts');

    const todoComment = comments.find((c) => c.text.includes('TODO'));
    assert.ok(todoComment);
    assert.strictEqual(todoComment.line, 27);

    const helperComment = comments.find((c) => c.text.includes('Helper constant'));
    assert.ok(helperComment);
    assert.strictEqual(helperComment.line, 35);
  });

  it('associates comment with function it appears in', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/auth.ts');

    const todoComment = comments.find((c) => c.text.includes('TODO'));
    assert.ok(todoComment);
    assert.strictEqual(todoComment.nearFunction, 'validateToken');
  });

  it('handles comments outside functions', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/auth.ts');

    const helperComment = comments.find((c) => c.text.includes('Helper constant'));
    assert.ok(helperComment);
    assert.strictEqual(helperComment.nearFunction, undefined);
  });

  it('filters out JSDoc comments', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/auth.ts');

    // All comments should be single-line style
    for (const comment of comments) {
      assert.ok(!comment.text.startsWith('*'));
      assert.ok(!comment.text.includes('Creates a new session'));
      assert.ok(!comment.text.includes('@param'));
    }
  });

  it('handles files with no inline comments', () => {
    const ctx = createProject(fixtureDir);
    const comments = extractInlineComments(ctx, 'src/types.ts');

    assert.ok(Array.isArray(comments));
    assert.strictEqual(comments.length, 0);
  });
});

describe('extractReadme', () => {
  it('returns README content when README.md exists', async () => {
    const content = await extractReadme(fixtureDir);

    assert.ok(content);
    assert.strictEqual(typeof content, 'string');
    assert.ok(content.includes('# Simple Project'));
    assert.ok(content.includes('A test fixture for Pith extraction tests.'));
  });

  it('returns full markdown content including headers and lists', async () => {
    const content = await extractReadme(fixtureDir);

    assert.ok(content);
    assert.ok(content.includes('## Structure'));
    assert.ok(content.includes('- `src/types.ts` - Type definitions'));
    assert.ok(content.includes('- `src/auth.ts` - Authentication utilities'));
    assert.ok(content.includes('- `src/user-service.ts` - User management service'));
    assert.ok(content.includes('- `src/index.ts` - Main exports'));
  });

  it('returns null when no README exists', async () => {
    const nonExistentDir = join(__dirname, '../../test/fixtures/simple-project/src');
    const content = await extractReadme(nonExistentDir);

    assert.strictEqual(content, null);
  });

  it('handles README.MD (case variation)', async () => {
    const tempDir = join(__dirname, '../../test/fixtures/temp-readme-test');
    const { mkdir, writeFile, rm } = await import('node:fs/promises');

    try {
      // Create a temp directory with README.MD (uppercase extension)
      await mkdir(tempDir, { recursive: true });
      await writeFile(join(tempDir, 'README.MD'), '# Uppercase Extension Test\n\nThis is a test.');

      const content = await extractReadme(tempDir);

      assert.ok(content);
      assert.ok(content.includes('# Uppercase Extension Test'));
      assert.ok(content.includes('This is a test.'));
    } finally {
      // Clean up
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('extractTodos', () => {
  it('extracts TODO comment with correct type', () => {
    const ctx = createProject(fixtureDir);
    const todos = extractTodos(ctx, 'src/auth.ts');

    assert.ok(Array.isArray(todos));
    assert.ok(todos.length > 0);

    const todoItem = todos.find((t) => t.type === 'TODO');
    assert.ok(todoItem);
    assert.strictEqual(todoItem.type, 'TODO');
  });

  it('returns correct line number', () => {
    const ctx = createProject(fixtureDir);
    const todos = extractTodos(ctx, 'src/auth.ts');

    const todoItem = todos.find((t) => t.type === 'TODO');
    assert.ok(todoItem);
    assert.strictEqual(todoItem.line, 27);
  });

  it('extracts text after the marker', () => {
    const ctx = createProject(fixtureDir);
    const todos = extractTodos(ctx, 'src/auth.ts');

    const todoItem = todos.find((t) => t.type === 'TODO');
    assert.ok(todoItem);
    assert.strictEqual(todoItem.text, 'Implement actual token validation');
  });

  it('handles FIXME markers', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(tempFile, '// FIXME: Fix this bug\nfunction test() {}\n');
      const todos = extractTodos(ctx, 'src/temp-test.ts');

      const fixmeItem = todos.find((t) => t.type === 'FIXME');
      assert.ok(fixmeItem);
      assert.strictEqual(fixmeItem.type, 'FIXME');
      assert.strictEqual(fixmeItem.text, 'Fix this bug');
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('handles HACK markers', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(tempFile, '// HACK: Temporary workaround\nfunction test() {}\n');
      const todos = extractTodos(ctx, 'src/temp-test.ts');

      const hackItem = todos.find((t) => t.type === 'HACK');
      assert.ok(hackItem);
      assert.strictEqual(hackItem.type, 'HACK');
      assert.strictEqual(hackItem.text, 'Temporary workaround');
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('handles XXX markers', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(tempFile, '// XXX: Review this code\nfunction test() {}\n');
      const todos = extractTodos(ctx, 'src/temp-test.ts');

      const xxxItem = todos.find((t) => t.type === 'XXX');
      assert.ok(xxxItem);
      assert.strictEqual(xxxItem.type, 'XXX');
      assert.strictEqual(xxxItem.text, 'Review this code');
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('handles files with no TODO comments', () => {
    const ctx = createProject(fixtureDir);
    const todos = extractTodos(ctx, 'src/types.ts');

    assert.ok(Array.isArray(todos));
    assert.strictEqual(todos.length, 0);
  });

  it('handles TODO in block comments', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(tempFile, '/* TODO: Block comment task */\nfunction test() {}\n');
      const todos = extractTodos(ctx, 'src/temp-test.ts');

      const todoItem = todos.find((t) => t.type === 'TODO');
      assert.ok(todoItem);
      assert.strictEqual(todoItem.text, 'Block comment task');
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('handles TODO with colon separator', () => {
    const ctx = createProject(fixtureDir);
    const todos = extractTodos(ctx, 'src/auth.ts');

    const todoItem = todos.find((t) => t.type === 'TODO');
    assert.ok(todoItem);
    // The TODO in auth.ts is "TODO: Implement actual token validation"
    assert.strictEqual(todoItem.text, 'Implement actual token validation');
  });

  it('handles TODO without colon separator', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(tempFile, '// TODO Add feature\nfunction test() {}\n');
      const todos = extractTodos(ctx, 'src/temp-test.ts');

      const todoItem = todos.find((t) => t.type === 'TODO');
      assert.ok(todoItem);
      assert.strictEqual(todoItem.text, 'Add feature');
    } finally {
      unlinkSync(tempFile);
    }
  });
});

describe('extractDeprecations', () => {
  it('extracts @deprecated from class with message', () => {
    const ctx = createProject(fixtureDir);
    const deprecations = extractDeprecations(ctx, 'src/user-service.ts');

    assert.ok(Array.isArray(deprecations));
    assert.ok(deprecations.length > 0);

    const classDeprecation = deprecations.find((d) => d.entityName === 'UserService');
    assert.ok(classDeprecation);
    assert.strictEqual(classDeprecation.message, 'Use UserRepository instead');
  });

  it('returns correct entity name (class name)', () => {
    const ctx = createProject(fixtureDir);
    const deprecations = extractDeprecations(ctx, 'src/user-service.ts');

    const classDeprecation = deprecations.find((d) => d.entityName === 'UserService');
    assert.ok(classDeprecation);
    assert.strictEqual(classDeprecation.entityName, 'UserService');
  });

  it('returns correct line number for class', () => {
    const ctx = createProject(fixtureDir);
    const deprecations = extractDeprecations(ctx, 'src/user-service.ts');

    const classDeprecation = deprecations.find((d) => d.entityName === 'UserService');
    assert.ok(classDeprecation);
    assert.strictEqual(classDeprecation.line, 7);
  });

  it('extracts @deprecated from function', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-deprecation-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(
        tempFile,
        `/**
 * Old function
 * @deprecated Use newFunction instead
 */
export function oldFunction() {
  return 'old';
}
`,
      );
      const deprecations = extractDeprecations(ctx, 'src/temp-deprecation-test.ts');

      const funcDeprecation = deprecations.find((d) => d.entityName === 'oldFunction');
      assert.ok(funcDeprecation);
      assert.strictEqual(funcDeprecation.message, 'Use newFunction instead');
      assert.strictEqual(funcDeprecation.line, 5);
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('extracts @deprecated from method', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-deprecation-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(
        tempFile,
        `export class TestClass {
  /**
   * Old method
   * @deprecated Use newMethod instead
   */
  oldMethod() {
    return 'old';
  }
}
`,
      );
      const deprecations = extractDeprecations(ctx, 'src/temp-deprecation-test.ts');

      const methodDeprecation = deprecations.find((d) => d.entityName === 'oldMethod');
      assert.ok(methodDeprecation);
      assert.strictEqual(methodDeprecation.message, 'Use newMethod instead');
      assert.strictEqual(methodDeprecation.line, 6);
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('handles files with no deprecations (returns empty array)', () => {
    const ctx = createProject(fixtureDir);
    const deprecations = extractDeprecations(ctx, 'src/types.ts');

    assert.ok(Array.isArray(deprecations));
    assert.strictEqual(deprecations.length, 0);
  });

  it('handles @deprecated without message', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-deprecation-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(
        tempFile,
        `/**
 * Old function
 * @deprecated
 */
export function deprecatedFunction() {
  return 'old';
}
`,
      );
      const deprecations = extractDeprecations(ctx, 'src/temp-deprecation-test.ts');

      const funcDeprecation = deprecations.find((d) => d.entityName === 'deprecatedFunction');
      assert.ok(funcDeprecation);
      assert.strictEqual(funcDeprecation.message, '');
      assert.strictEqual(funcDeprecation.line, 5);
    } finally {
      unlinkSync(tempFile);
    }
  });

  it('extracts multiple deprecations from same file', async () => {
    const ctx = createProject(fixtureDir);
    const tempFile = join(fixtureDir, 'src/temp-deprecation-test.ts');
    const { writeFileSync, unlinkSync } = await import('node:fs');

    try {
      writeFileSync(
        tempFile,
        `/**
 * @deprecated Use newFunction instead
 */
export function oldFunction() {}

/**
 * @deprecated Use NewClass instead
 */
export class OldClass {}
`,
      );
      const deprecations = extractDeprecations(ctx, 'src/temp-deprecation-test.ts');

      assert.strictEqual(deprecations.length, 2);

      const funcDeprecation = deprecations.find((d) => d.entityName === 'oldFunction');
      assert.ok(funcDeprecation);
      assert.strictEqual(funcDeprecation.message, 'Use newFunction instead');

      const classDeprecation = deprecations.find((d) => d.entityName === 'OldClass');
      assert.ok(classDeprecation);
      assert.strictEqual(classDeprecation.message, 'Use NewClass instead');
    } finally {
      unlinkSync(tempFile);
    }
  });
});

describe('extractDocs', () => {
  it('returns complete DocsInfo structure', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', fixtureDir);

    assert.ok(docsInfo);
    assert.ok(typeof docsInfo === 'object');
    assert.ok('jsdoc' in docsInfo);
    assert.ok('inlineComments' in docsInfo);
    assert.ok('readme' in docsInfo);
    assert.ok('todos' in docsInfo);
    assert.ok('deprecations' in docsInfo);
  });

  it('includes JSDoc for all functions', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', fixtureDir);

    assert.ok(docsInfo.jsdoc);
    assert.ok(docsInfo.jsdoc['createSession']);
    assert.strictEqual(docsInfo.jsdoc['createSession']?.description, 'Creates a new session for a user.');

    assert.ok(docsInfo.jsdoc['validateToken']);
    assert.strictEqual(docsInfo.jsdoc['validateToken']?.description, 'Validates a session token.');
  });

  it('includes inline comments', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', fixtureDir);

    assert.ok(Array.isArray(docsInfo.inlineComments));
    assert.ok(docsInfo.inlineComments.length > 0);

    const todoComment = docsInfo.inlineComments.find((c) => c.text.includes('TODO'));
    assert.ok(todoComment);
  });

  it('includes README content', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', fixtureDir);

    assert.ok(docsInfo.readme);
    assert.ok(docsInfo.readme.includes('# Simple Project'));
  });

  it('includes TODOs', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', fixtureDir);

    assert.ok(Array.isArray(docsInfo.todos));
    assert.ok(docsInfo.todos.length > 0);

    const todoItem = docsInfo.todos.find((t) => t.type === 'TODO');
    assert.ok(todoItem);
  });

  it('includes deprecations', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/user-service.ts', fixtureDir);

    assert.ok(Array.isArray(docsInfo.deprecations));
    assert.ok(docsInfo.deprecations.length > 0);

    const classDeprecation = docsInfo.deprecations.find((d) => d.entityName === 'UserService');
    assert.ok(classDeprecation);
  });

  it('includes JSDoc for classes and methods', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const docsInfo = await extractDocs(ctx, 'src/user-service.ts', fixtureDir);

    assert.ok(docsInfo.jsdoc);
    assert.ok(docsInfo.jsdoc['UserService']);
    assert.strictEqual(docsInfo.jsdoc['UserService']?.description, 'Service for managing users.');

    assert.ok(docsInfo.jsdoc['createUser']);
    assert.strictEqual(docsInfo.jsdoc['createUser']?.description, 'Creates a new user.');
  });

  it('handles files with no README gracefully', async () => {
    const ctx = createProject(fixtureDir);
    const { extractDocs } = await import('./docs.ts');
    const srcDir = join(fixtureDir, 'src');
    const docsInfo = await extractDocs(ctx, 'src/auth.ts', srcDir);

    // src directory has no README
    assert.strictEqual(docsInfo.readme, undefined);
  });
});
