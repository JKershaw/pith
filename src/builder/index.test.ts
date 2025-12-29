import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  buildFileNode,
  storeFileNodes,
  shouldCreateFunctionNode,
  buildFunctionNode,
  storeFunctionNodes,
  type WikiNode,
  type Function,
} from './index.ts';
import type { ExtractedFile } from '../extractor/ast.ts';
import { getDb, closeDb } from '../db/index.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('buildFileNode', () => {
  // Step 2.1.1: Test basic structure
  it('returns correct structure', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.ok(node);
    assert.strictEqual(typeof node.id, 'string');
    assert.strictEqual(node.type, 'file');
    assert.strictEqual(typeof node.path, 'string');
    assert.strictEqual(typeof node.name, 'string');
    assert.ok(node.metadata);
    assert.ok(Array.isArray(node.edges));
    assert.ok(node.raw);
  });

  // Step 2.1.2: Test ID generation
  it('has correct id (path-based)', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 50,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.strictEqual(node.id, 'src/auth/login.ts');
  });

  // Step 2.1.3: Test name extraction
  it('has correct name (basename)', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 50,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.strictEqual(node.name, 'login.ts');
  });

  // Step 2.1.4: Test metadata.lines
  it('has metadata.lines from extracted data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 250,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.strictEqual(node.metadata.lines, 250);
  });

  // Step 2.1.5: Test metadata.commits
  it('has metadata.commits from git data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 42,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const node = buildFileNode(extracted);

    assert.strictEqual(node.metadata.commits, 42);
  });

  // Step 2.1.6: Test metadata.lastModified
  it('has metadata.lastModified from git data', () => {
    const testDate = new Date('2024-01-15T10:30:00Z');
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 10,
        lastModified: testDate,
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const node = buildFileNode(extracted);

    assert.deepStrictEqual(node.metadata.lastModified, testDate);
  });

  // Step 2.1.7: Test metadata.authors
  it('has metadata.authors from git data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 10,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com', 'bob@example.com', 'charlie@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const node = buildFileNode(extracted);

    assert.deepStrictEqual(node.metadata.authors, [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com',
    ]);
  });

  // Step 2.1.8: Test raw.signature
  it('has raw.signature with function signatures', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [
        {
          name: 'add',
          signature: 'function add(a: number, b: number): number',
          params: [],
          returnType: 'number',
          isAsync: false,
          isExported: true,
          startLine: 1,
          endLine: 3,
        },
        {
          name: 'subtract',
          signature: 'function subtract(a: number, b: number): number',
          params: [],
          returnType: 'number',
          isAsync: false,
          isExported: false,
          startLine: 5,
          endLine: 7,
        },
      ],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.ok(node.raw.signature);
    assert.strictEqual(node.raw.signature.length, 2);
    assert.strictEqual(node.raw.signature[0], 'function add(a: number, b: number): number');
    assert.strictEqual(node.raw.signature[1], 'function subtract(a: number, b: number): number');
  });

  // Step 2.1.9: Test raw.jsdoc
  it('has raw.jsdoc from docs data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      docs: {
        jsdoc: {
          myFunction: {
            description: 'Does something useful',
            params: [],
          },
        },
        inlineComments: [],
        todos: [],
        deprecations: [],
      },
    };

    const node = buildFileNode(extracted);

    assert.ok(node.raw.jsdoc);
    assert.strictEqual(node.raw.jsdoc.myFunction.description, 'Does something useful');
  });

  // Step 2.1.10: Test raw.imports
  it('has raw.imports from extracted data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [
        {
          from: './utils',
          names: ['helper'],
          isTypeOnly: false,
        },
        {
          from: 'node:fs',
          names: ['readFile'],
          isTypeOnly: false,
        },
      ],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.ok(node.raw.imports);
    assert.strictEqual(node.raw.imports.length, 2);
    assert.strictEqual(node.raw.imports[0].from, './utils');
    assert.strictEqual(node.raw.imports[1].from, 'node:fs');
  });

  // Step 2.1.11: Test raw.exports
  it('has raw.exports from extracted data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [
        { name: 'myFunction', kind: 'function', isReExport: false },
        { name: 'MyClass', kind: 'class', isReExport: false },
      ],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.ok(node.raw.exports);
    assert.strictEqual(node.raw.exports.length, 2);
    assert.strictEqual(node.raw.exports[0].name, 'myFunction');
    assert.strictEqual(node.raw.exports[1].name, 'MyClass');
  });

  // Step 2.1.12: Test raw.recentCommits
  it('has raw.recentCommits from git data', () => {
    const commit1 = {
      hash: 'abc123',
      message: 'Fix bug',
      author: 'alice@example.com',
      date: new Date('2024-01-15'),
    };
    const commit2 = {
      hash: 'def456',
      message: 'Add feature',
      author: 'bob@example.com',
      date: new Date('2024-01-14'),
    };

    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 10,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com', 'bob@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [commit1, commit2],
      },
    };

    const node = buildFileNode(extracted);

    assert.ok(node.raw.recentCommits);
    assert.strictEqual(node.raw.recentCommits.length, 2);
    assert.strictEqual(node.raw.recentCommits[0].hash, 'abc123');
    assert.strictEqual(node.raw.recentCommits[1].hash, 'def456');
  });
});

describe('storeFileNodes', () => {
  let testDataDir: string;

  // Step 2.1.13: Test storing nodes to database
  it('stores file nodes in nodes collection', async () => {
    // Create temp directory for test database
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));

    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 5,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const node = buildFileNode(extracted);

    // Store the node
    const db = await getDb(testDataDir);
    await storeFileNodes(db, [node]);

    // Verify it was stored
    const collection = db.collection<WikiNode>('nodes');
    const stored = await collection.findOne({ id: 'src/test.ts' });

    assert.ok(stored);
    assert.strictEqual(stored.id, 'src/test.ts');
    assert.strictEqual(stored.type, 'file');
    assert.strictEqual(stored.name, 'test.ts');
    assert.strictEqual(stored.metadata.lines, 100);
    assert.strictEqual(stored.metadata.commits, 5);
  });

  after(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });
});

describe('shouldCreateFunctionNode', () => {
  // Step 2.2.1: Test returns true for exported functions
  it('returns true for exported functions', () => {
    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const result = shouldCreateFunctionNode(func);

    assert.strictEqual(result, true);
  });

  it('returns false for non-exported functions', () => {
    const func: Function = {
      name: 'helper',
      signature: 'function helper(): void',
      params: [],
      returnType: 'void',
      isAsync: false,
      isExported: false,
      startLine: 20,
      endLine: 22,
    };

    const result = shouldCreateFunctionNode(func);

    assert.strictEqual(result, false);
  });
});

describe('buildFunctionNode', () => {
  // Step 2.2.2: Test basic structure
  it('returns correct structure', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 10,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [{ name: 'user', type: 'string', isOptional: false }],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    assert.ok(node);
    assert.strictEqual(typeof node.id, 'string');
    assert.strictEqual(node.type, 'function');
    assert.strictEqual(typeof node.path, 'string');
    assert.strictEqual(typeof node.name, 'string');
    assert.ok(node.metadata);
    assert.ok(Array.isArray(node.edges));
    assert.ok(node.raw);
  });

  // Step 2.2.3: Test ID generation (file:function)
  it('has correct id (file:function)', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    assert.strictEqual(node.id, 'src/auth/login.ts:authenticate');
  });

  // Step 2.2.4: Test raw.signature
  it('has raw.signature', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 50,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const func: Function = {
      name: 'add',
      signature: 'export function add(a: number, b: number): number',
      params: [
        { name: 'a', type: 'number', isOptional: false },
        { name: 'b', type: 'number', isOptional: false },
      ],
      returnType: 'number',
      isAsync: false,
      isExported: true,
      startLine: 5,
      endLine: 7,
    };

    const node = buildFunctionNode(extracted, func);

    assert.ok(node.raw.signature);
    assert.strictEqual(node.raw.signature.length, 1);
    assert.strictEqual(node.raw.signature[0], 'export function add(a: number, b: number): number');
  });

  // Step 2.2.5: Test raw.jsdoc
  it('has raw.jsdoc from docs data', () => {
    const extracted: ExtractedFile = {
      path: 'src/test.ts',
      lines: 50,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      docs: {
        jsdoc: {
          myFunction: {
            description: 'Performs authentication',
            params: [{ name: 'user', description: 'The user to authenticate', type: 'string' }],
            returns: { description: 'True if authenticated', type: 'boolean' },
          },
        },
        inlineComments: [],
        todos: [],
        deprecations: [],
      },
    };

    const func: Function = {
      name: 'myFunction',
      signature: 'export function myFunction(user: string): boolean',
      params: [{ name: 'user', type: 'string', isOptional: false }],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    assert.ok(node.raw.jsdoc);
    assert.ok(node.raw.jsdoc.myFunction);
    assert.strictEqual(node.raw.jsdoc.myFunction.description, 'Performs authentication');
  });

  it('has function name as node name', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    assert.strictEqual(node.name, 'authenticate');
  });

  it('has correct metadata from git data', () => {
    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 42,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com', 'bob@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    // Function nodes have lines based on function range, not whole file
    assert.strictEqual(node.metadata.lines, 6); // endLine - startLine + 1
    assert.strictEqual(node.metadata.commits, 42);
    assert.deepStrictEqual(node.metadata.lastModified, new Date('2024-01-15'));
    assert.deepStrictEqual(node.metadata.authors, ['alice@example.com', 'bob@example.com']);
  });
});

describe('storeFunctionNodes', () => {
  let testDataDir: string;

  // Step 2.2.6: Test storing function nodes to database
  it('stores function nodes in nodes collection', async () => {
    // Create temp directory for test database
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));

    const extracted: ExtractedFile = {
      path: 'src/auth/login.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      git: {
        commitCount: 10,
        lastModified: new Date('2024-01-15'),
        createdAt: new Date('2023-01-01'),
        authors: ['alice@example.com'],
        primaryAuthor: 'alice@example.com',
        recentCommits: [],
      },
    };

    const func: Function = {
      name: 'authenticate',
      signature: 'export function authenticate(user: string): boolean',
      params: [{ name: 'user', type: 'string', isOptional: false }],
      returnType: 'boolean',
      isAsync: false,
      isExported: true,
      startLine: 10,
      endLine: 15,
    };

    const node = buildFunctionNode(extracted, func);

    // Store the node
    const db = await getDb(testDataDir);
    await storeFunctionNodes(db, [node]);

    // Verify it was stored
    const collection = db.collection<WikiNode>('nodes');
    const stored = await collection.findOne({ id: 'src/auth/login.ts:authenticate' });

    assert.ok(stored);
    assert.strictEqual(stored.id, 'src/auth/login.ts:authenticate');
    assert.strictEqual(stored.type, 'function');
    assert.strictEqual(stored.name, 'authenticate');
    assert.strictEqual(stored.metadata.lines, 6);
    assert.strictEqual(stored.metadata.commits, 10);
  });

  after(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });
});
