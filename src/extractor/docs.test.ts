import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createProject } from './ast.ts';
import { extractJSDoc, extractInlineComments } from './docs.ts';

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
