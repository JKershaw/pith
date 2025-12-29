import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createProject } from './ast.ts';
import { extractJSDoc } from './docs.ts';

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
