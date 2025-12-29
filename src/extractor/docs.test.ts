import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createProject } from './ast.ts';
import { extractJSDoc, extractInlineComments, extractReadme, extractTodos } from './docs.ts';

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
