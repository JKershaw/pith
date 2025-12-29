import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  buildFileNode,
  storeFileNodes,
  shouldCreateFunctionNode,
  buildFunctionNode,
  storeFunctionNodes,
  shouldCreateModuleNode,
  buildModuleNode,
  storeModuleNodes,
  buildContainsEdges,
  buildImportEdges,
  buildParentEdge,
  calculateFanIn,
  calculateFanOut,
  calculateAge,
  calculateRecency,
  computeMetadata,
  isTestFile,
  buildTestFileEdges,
  buildDependentEdges,
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

describe('shouldCreateModuleNode', () => {
  // Step 2.3.1: Test returns true for dirs with index.ts
  it('returns true for directories with index.ts', () => {
    const files = ['src/auth/index.ts', 'src/auth/login.ts', 'src/auth/logout.ts'];

    const result = shouldCreateModuleNode(files);

    assert.strictEqual(result, true);
  });

  // Step 2.3.2: Test returns true for dirs with 3+ files
  it('returns true for directories with 3 or more files', () => {
    const files = ['src/utils/helper.ts', 'src/utils/format.ts', 'src/utils/validate.ts'];

    const result = shouldCreateModuleNode(files);

    assert.strictEqual(result, true);
  });

  it('returns false for directories with less than 3 files and no index.ts', () => {
    const files = ['src/small/helper.ts', 'src/small/format.ts'];

    const result = shouldCreateModuleNode(files);

    assert.strictEqual(result, false);
  });

  it('returns true even if only one file is index.ts', () => {
    const files = ['src/single/index.ts'];

    const result = shouldCreateModuleNode(files);

    assert.strictEqual(result, true);
  });
});

describe('buildModuleNode', () => {
  // Step 2.3.3: Test returns correct structure
  it('returns correct structure', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts', 'src/auth/login.ts', 'src/auth/logout.ts'];

    const node = buildModuleNode(dirPath, files);

    assert.ok(node);
    assert.strictEqual(typeof node.id, 'string');
    assert.strictEqual(node.type, 'module');
    assert.strictEqual(typeof node.path, 'string');
    assert.strictEqual(typeof node.name, 'string');
    assert.ok(node.metadata);
    assert.ok(Array.isArray(node.edges));
    assert.ok(node.raw);
  });

  it('has correct id (directory path)', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts', 'src/auth/login.ts'];

    const node = buildModuleNode(dirPath, files);

    assert.strictEqual(node.id, 'src/auth');
  });

  it('has correct name (directory basename)', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts'];

    const node = buildModuleNode(dirPath, files);

    assert.strictEqual(node.name, 'auth');
  });

  it('has aggregated metadata from child files', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts', 'src/auth/login.ts', 'src/auth/logout.ts'];

    const node = buildModuleNode(dirPath, files);

    // Basic metadata structure should exist
    assert.strictEqual(typeof node.metadata.lines, 'number');
    assert.strictEqual(typeof node.metadata.commits, 'number');
    assert.ok(node.metadata.lastModified instanceof Date);
    assert.ok(Array.isArray(node.metadata.authors));
  });

  // Step 2.3.4: Test raw.readme
  it('has raw.readme when provided', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts'];
    const readme = '# Authentication Module\n\nThis module handles user authentication.';

    const node = buildModuleNode(dirPath, files, readme);

    assert.ok(node.raw.readme);
    assert.strictEqual(node.raw.readme, readme);
  });

  it('does not have raw.readme when not provided', () => {
    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts'];

    const node = buildModuleNode(dirPath, files);

    assert.strictEqual(node.raw.readme, undefined);
  });
});

describe('storeModuleNodes', () => {
  let testDataDir: string;

  // Step 2.3.5: Test storing module nodes to database
  it('stores module nodes in nodes collection', async () => {
    // Create temp directory for test database
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));

    const dirPath = 'src/auth';
    const files = ['src/auth/index.ts', 'src/auth/login.ts', 'src/auth/logout.ts'];
    const readme = '# Authentication Module';

    const node = buildModuleNode(dirPath, files, readme);

    // Store the node
    const db = await getDb(testDataDir);
    await storeModuleNodes(db, [node]);

    // Verify it was stored
    const collection = db.collection<WikiNode>('nodes');
    const stored = await collection.findOne({ id: 'src/auth' });

    assert.ok(stored);
    assert.strictEqual(stored.id, 'src/auth');
    assert.strictEqual(stored.type, 'module');
    assert.strictEqual(stored.name, 'auth');
    assert.strictEqual(stored.raw.readme, '# Authentication Module');
  });

  after(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });
});

describe('buildContainsEdges (module → file)', () => {
  // Step 2.4.1: Test contains edge from module to file
  it('creates contains edges for each file in module', () => {
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 0,
        commits: 0,
        lastModified: new Date(),
        authors: [],
      },
      edges: [],
      raw: {},
    };

    const fileNodes: WikiNode[] = [
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: {
          lines: 50,
          commits: 5,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/logout.ts',
        type: 'file',
        path: 'src/auth/logout.ts',
        name: 'logout.ts',
        metadata: {
          lines: 30,
          commits: 3,
          lastModified: new Date(),
          authors: ['bob@example.com'],
        },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildContainsEdges(moduleNode, fileNodes);

    assert.strictEqual(edges.length, 2);
    assert.strictEqual(edges[0].type, 'contains');
    assert.strictEqual(edges[0].target, 'src/auth/login.ts');
    assert.strictEqual(edges[1].type, 'contains');
    assert.strictEqual(edges[1].target, 'src/auth/logout.ts');
  });
});

describe('buildContainsEdges (file → function)', () => {
  // Step 2.4.2: Test contains edge from file to function
  it('creates contains edges for each function in file', () => {
    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {},
    };

    const functionNodes: WikiNode[] = [
      {
        id: 'src/auth/login.ts:authenticate',
        type: 'function',
        path: 'src/auth/login.ts',
        name: 'authenticate',
        metadata: {
          lines: 10,
          commits: 5,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/login.ts:validateCredentials',
        type: 'function',
        path: 'src/auth/login.ts',
        name: 'validateCredentials',
        metadata: {
          lines: 8,
          commits: 5,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildContainsEdges(fileNode, functionNodes);

    assert.strictEqual(edges.length, 2);
    assert.strictEqual(edges[0].type, 'contains');
    assert.strictEqual(edges[0].target, 'src/auth/login.ts:authenticate');
    assert.strictEqual(edges[1].type, 'contains');
    assert.strictEqual(edges[1].target, 'src/auth/login.ts:validateCredentials');
  });
});

describe('buildImportEdges', () => {
  // Step 2.4.3: Test imports edge from file to file
  it('creates import edges for each import', () => {
    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {
        imports: [
          { from: './session', names: ['createSession'], isTypeOnly: false },
          { from: '../utils/hash', names: ['hashPassword'], isTypeOnly: false },
        ],
      },
    };

    const allFilePaths = [
      'src/auth/login.ts',
      'src/auth/session.ts',
      'src/utils/hash.ts',
    ];

    const edges = buildImportEdges(fileNode, allFilePaths);

    assert.strictEqual(edges.length, 2);
    assert.strictEqual(edges[0].type, 'imports');
    assert.strictEqual(edges[0].target, 'src/auth/session.ts');
    assert.strictEqual(edges[1].type, 'imports');
    assert.strictEqual(edges[1].target, 'src/utils/hash.ts');
  });

  it('skips imports that cannot be resolved', () => {
    const fileNode: WikiNode = {
      id: 'src/test.ts',
      type: 'file',
      path: 'src/test.ts',
      name: 'test.ts',
      metadata: {
        lines: 10,
        commits: 1,
        lastModified: new Date(),
        authors: ['test@example.com'],
      },
      edges: [],
      raw: {
        imports: [
          { from: 'node:fs', names: ['readFile'], isTypeOnly: false },
          { from: './local', names: ['helper'], isTypeOnly: false },
        ],
      },
    };

    const allFilePaths = ['src/test.ts', 'src/local.ts'];

    const edges = buildImportEdges(fileNode, allFilePaths);

    // Should only resolve ./local, not node:fs
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].target, 'src/local.ts');
  });
});

describe('buildParentEdge', () => {
  // Step 2.4.4: Test parent edge from file to module
  it('creates parent edge from file to module', () => {
    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {},
    };

    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 0,
        commits: 0,
        lastModified: new Date(),
        authors: [],
      },
      edges: [],
      raw: {},
    };

    const edge = buildParentEdge(fileNode, moduleNode);

    assert.ok(edge);
    assert.strictEqual(edge.type, 'parent');
    assert.strictEqual(edge.target, 'src/auth');
  });
});

describe('Edge integration', () => {
  // Step 2.4.5: Test that edges are stored on nodes
  it('edges are added to node.edges array', () => {
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 0,
        commits: 0,
        lastModified: new Date(),
        authors: [],
      },
      edges: [],
      raw: {},
    };

    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {},
    };

    // Add contains edge to module
    const containsEdges = buildContainsEdges(moduleNode, [fileNode]);
    moduleNode.edges.push(...containsEdges);

    // Add parent edge to file
    const parentEdge = buildParentEdge(fileNode, moduleNode);
    fileNode.edges.push(parentEdge);

    assert.strictEqual(moduleNode.edges.length, 1);
    assert.strictEqual(moduleNode.edges[0].type, 'contains');
    assert.strictEqual(moduleNode.edges[0].target, 'src/auth/login.ts');

    assert.strictEqual(fileNode.edges.length, 1);
    assert.strictEqual(fileNode.edges[0].type, 'parent');
    assert.strictEqual(fileNode.edges[0].target, 'src/auth');
  });
});

describe('Test File Detection - Phase 6.2.1', () => {
  it('returns true for .test.ts files', () => {
    assert.strictEqual(isTestFile('src/builder/index.test.ts'), true);
  });

  it('returns true for .spec.ts files', () => {
    assert.strictEqual(isTestFile('src/api/index.spec.ts'), true);
  });

  it('returns true for files in __tests__ directories', () => {
    assert.strictEqual(isTestFile('src/__tests__/helper.ts'), true);
    assert.strictEqual(isTestFile('src/utils/__tests__/parser.ts'), true);
  });

  it('returns false for regular source files', () => {
    assert.strictEqual(isTestFile('src/builder/index.ts'), false);
    assert.strictEqual(isTestFile('src/api/index.ts'), false);
  });

  it('returns false for files with test in name but not extension', () => {
    assert.strictEqual(isTestFile('src/testUtils.ts'), false);
    assert.strictEqual(isTestFile('src/mytest.ts'), false);
  });
});

describe('Test Command - Phase 6.2.4', () => {
  it('adds testCommand to test file metadata', () => {
    const extracted: ExtractedFile = {
      path: 'src/builder/index.test.ts',
      lines: 200,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.ok(node.metadata.testCommand);
    assert.strictEqual(node.metadata.testCommand, 'npm test -- src/builder/index.test.ts');
  });

  it('does not add testCommand to regular source files', () => {
    const extracted: ExtractedFile = {
      path: 'src/builder/index.ts',
      lines: 100,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
    };

    const node = buildFileNode(extracted);

    assert.strictEqual(node.metadata.testCommand, undefined);
  });
});

describe('Test File Mapping - Phase 6.2.2', () => {
  it('creates testFile edges from source to .test.ts files', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/builder/index.ts',
        type: 'file',
        path: 'src/builder/index.ts',
        name: 'index.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/builder/index.test.ts',
        type: 'file',
        path: 'src/builder/index.test.ts',
        name: 'index.test.ts',
        metadata: { lines: 200, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildTestFileEdges(fileNodes);

    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].type, 'testFile');
    assert.strictEqual(edges[0].target, 'src/builder/index.test.ts');
  });

  it('creates testFile edges from source to .spec.ts files', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/api/index.ts',
        type: 'file',
        path: 'src/api/index.ts',
        name: 'index.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/api/index.spec.ts',
        type: 'file',
        path: 'src/api/index.spec.ts',
        name: 'index.spec.ts',
        metadata: { lines: 150, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildTestFileEdges(fileNodes);

    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].type, 'testFile');
    assert.strictEqual(edges[0].target, 'src/api/index.spec.ts');
  });

  it('creates testFile edges to tests in __tests__ directory', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/utils/helper.ts',
        type: 'file',
        path: 'src/utils/helper.ts',
        name: 'helper.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/utils/__tests__/helper.test.ts',
        type: 'file',
        path: 'src/utils/__tests__/helper.test.ts',
        name: 'helper.test.ts',
        metadata: { lines: 80, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildTestFileEdges(fileNodes);

    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].type, 'testFile');
    assert.strictEqual(edges[0].target, 'src/utils/__tests__/helper.test.ts');
  });

  it('returns empty array when no test files exist', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/utils/helper.ts',
        type: 'file',
        path: 'src/utils/helper.ts',
        name: 'helper.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/utils/format.ts',
        type: 'file',
        path: 'src/utils/format.ts',
        name: 'format.ts',
        metadata: { lines: 30, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildTestFileEdges(fileNodes);

    assert.strictEqual(edges.length, 0);
  });

  it('handles multiple source files with tests', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/login.test.ts',
        type: 'file',
        path: 'src/auth/login.test.ts',
        name: 'login.test.ts',
        metadata: { lines: 150, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/logout.ts',
        type: 'file',
        path: 'src/auth/logout.ts',
        name: 'logout.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/logout.spec.ts',
        type: 'file',
        path: 'src/auth/logout.spec.ts',
        name: 'logout.spec.ts',
        metadata: { lines: 80, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildTestFileEdges(fileNodes);

    assert.strictEqual(edges.length, 2);
    assert.ok(edges.some(e => e.target === 'src/auth/login.test.ts'));
    assert.ok(edges.some(e => e.target === 'src/auth/logout.spec.ts'));
  });
});

describe('Dependent Edges - Phase 6.3.1', () => {
  it('creates importedBy edges for files that are imported', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/utils/helper.ts',
        type: 'file',
        path: 'src/utils/helper.ts',
        name: 'helper.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [
          { type: 'imports', target: 'src/utils/helper.ts' },
        ],
        raw: {},
      },
      {
        id: 'src/auth/signup.ts',
        type: 'file',
        path: 'src/auth/signup.ts',
        name: 'signup.ts',
        metadata: { lines: 80, commits: 3, lastModified: new Date(), authors: [] },
        edges: [
          { type: 'imports', target: 'src/utils/helper.ts' },
        ],
        raw: {},
      },
    ];

    const edges = buildDependentEdges(fileNodes);

    assert.strictEqual(edges.length, 2);
    assert.ok(edges.some(e => e.sourceId === 'src/utils/helper.ts' && e.target === 'src/auth/login.ts'));
    assert.ok(edges.some(e => e.sourceId === 'src/utils/helper.ts' && e.target === 'src/auth/signup.ts'));
    assert.ok(edges.every(e => e.type === 'importedBy'));
  });

  it('returns empty array when no files are imported', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/isolated.ts',
        type: 'file',
        path: 'src/isolated.ts',
        name: 'isolated.ts',
        metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildDependentEdges(fileNodes);

    assert.strictEqual(edges.length, 0);
  });

  it('handles files with no importers', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/utils/helper.ts',
        type: 'file',
        path: 'src/utils/helper.ts',
        name: 'helper.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const edges = buildDependentEdges(fileNodes);

    assert.strictEqual(edges.length, 0);
  });

  it('creates multiple importedBy edges for widely used files', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/config.ts',
        type: 'file',
        path: 'src/config.ts',
        name: 'config.ts',
        metadata: { lines: 20, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [{ type: 'imports', target: 'src/config.ts' }],
        raw: {},
      },
      {
        id: 'src/auth/signup.ts',
        type: 'file',
        path: 'src/auth/signup.ts',
        name: 'signup.ts',
        metadata: { lines: 80, commits: 3, lastModified: new Date(), authors: [] },
        edges: [{ type: 'imports', target: 'src/config.ts' }],
        raw: {},
      },
      {
        id: 'src/api/server.ts',
        type: 'file',
        path: 'src/api/server.ts',
        name: 'server.ts',
        metadata: { lines: 150, commits: 8, lastModified: new Date(), authors: [] },
        edges: [{ type: 'imports', target: 'src/config.ts' }],
        raw: {},
      },
    ];

    const edges = buildDependentEdges(fileNodes);

    assert.strictEqual(edges.length, 3);
    const configEdges = edges.filter(e => e.sourceId === 'src/config.ts');
    assert.strictEqual(configEdges.length, 3);
  });
});

describe('Computed Metadata - Phase 2.5', () => {
  describe('calculateFanIn', () => {
    // Step 2.5.1: Test fan-in calculation
    it('counts incoming import edges correctly', () => {
      const nodeId = 'src/utils/helper.ts';
      const allNodes: WikiNode[] = [
        {
          id: 'src/auth/login.ts',
          type: 'file',
          path: 'src/auth/login.ts',
          name: 'login.ts',
          metadata: {
            lines: 50,
            commits: 5,
            lastModified: new Date(),
            authors: ['alice@example.com'],
          },
          edges: [{ type: 'imports', target: nodeId }],
          raw: {},
        },
        {
          id: 'src/auth/signup.ts',
          type: 'file',
          path: 'src/auth/signup.ts',
          name: 'signup.ts',
          metadata: {
            lines: 40,
            commits: 3,
            lastModified: new Date(),
            authors: ['bob@example.com'],
          },
          edges: [{ type: 'imports', target: nodeId }],
          raw: {},
        },
        {
          id: nodeId,
          type: 'file',
          path: nodeId,
          name: 'helper.ts',
          metadata: {
            lines: 30,
            commits: 2,
            lastModified: new Date(),
            authors: ['alice@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      const fanIn = calculateFanIn(nodeId, allNodes);

      assert.strictEqual(fanIn, 2);
    });

    it('returns 0 when no nodes import the target', () => {
      const nodeId = 'src/isolated.ts';
      const allNodes: WikiNode[] = [
        {
          id: nodeId,
          type: 'file',
          path: nodeId,
          name: 'isolated.ts',
          metadata: {
            lines: 10,
            commits: 1,
            lastModified: new Date(),
            authors: ['alice@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      const fanIn = calculateFanIn(nodeId, allNodes);

      assert.strictEqual(fanIn, 0);
    });

    it('ignores non-import edge types', () => {
      const nodeId = 'src/utils/helper.ts';
      const allNodes: WikiNode[] = [
        {
          id: 'src/auth',
          type: 'module',
          path: 'src/auth',
          name: 'auth',
          metadata: {
            lines: 0,
            commits: 0,
            lastModified: new Date(),
            authors: [],
          },
          edges: [
            { type: 'contains', target: nodeId }, // Should be ignored
          ],
          raw: {},
        },
        {
          id: 'src/login.ts',
          type: 'file',
          path: 'src/login.ts',
          name: 'login.ts',
          metadata: {
            lines: 50,
            commits: 5,
            lastModified: new Date(),
            authors: ['alice@example.com'],
          },
          edges: [{ type: 'imports', target: nodeId }],
          raw: {},
        },
        {
          id: nodeId,
          type: 'file',
          path: nodeId,
          name: 'helper.ts',
          metadata: {
            lines: 30,
            commits: 2,
            lastModified: new Date(),
            authors: ['alice@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      const fanIn = calculateFanIn(nodeId, allNodes);

      assert.strictEqual(fanIn, 1); // Only the import edge
    });
  });

  describe('calculateFanOut', () => {
    // Step 2.5.2: Test fan-out calculation
    it('counts outgoing import edges correctly', () => {
      const node: WikiNode = {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: {
          lines: 50,
          commits: 5,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [
          { type: 'imports', target: 'src/utils/helper.ts' },
          { type: 'imports', target: 'src/utils/validator.ts' },
          { type: 'imports', target: 'src/config.ts' },
        ],
        raw: {},
      };

      const fanOut = calculateFanOut(node);

      assert.strictEqual(fanOut, 3);
    });

    it('returns 0 when node has no imports', () => {
      const node: WikiNode = {
        id: 'src/isolated.ts',
        type: 'file',
        path: 'src/isolated.ts',
        name: 'isolated.ts',
        metadata: {
          lines: 10,
          commits: 1,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [],
        raw: {},
      };

      const fanOut = calculateFanOut(node);

      assert.strictEqual(fanOut, 0);
    });

    it('ignores non-import edge types', () => {
      const node: WikiNode = {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: {
          lines: 50,
          commits: 5,
          lastModified: new Date(),
          authors: ['alice@example.com'],
        },
        edges: [
          { type: 'imports', target: 'src/utils/helper.ts' },
          { type: 'parent', target: 'src/auth' }, // Should be ignored
          { type: 'contains', target: 'src/auth/login.ts:authenticate' }, // Should be ignored
        ],
        raw: {},
      };

      const fanOut = calculateFanOut(node);

      assert.strictEqual(fanOut, 1); // Only the import edge
    });
  });

  describe('calculateAge', () => {
    // Step 2.5.3: Test age calculation
    it('calculates correct days since creation', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const createdAt = new Date('2024-01-01T00:00:00Z');

      const ageInDays = calculateAge(createdAt, now);

      assert.strictEqual(ageInDays, 14);
    });

    it('returns 0 for same-day creation', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const createdAt = new Date('2024-01-15T08:00:00Z');

      const ageInDays = calculateAge(createdAt, now);

      assert.strictEqual(ageInDays, 0);
    });

    it('handles year boundaries', () => {
      const now = new Date('2024-01-05T00:00:00Z');
      const createdAt = new Date('2023-12-25T00:00:00Z');

      const ageInDays = calculateAge(createdAt, now);

      assert.strictEqual(ageInDays, 11);
    });
  });

  describe('calculateRecency', () => {
    // Step 2.5.4: Test recency calculation
    it('calculates correct days since last change', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const lastModified = new Date('2024-01-10T00:00:00Z');

      const recencyInDays = calculateRecency(lastModified, now);

      assert.strictEqual(recencyInDays, 5);
    });

    it('returns 0 for same-day modification', () => {
      const now = new Date('2024-01-15T18:00:00Z');
      const lastModified = new Date('2024-01-15T09:00:00Z');

      const recencyInDays = calculateRecency(lastModified, now);

      assert.strictEqual(recencyInDays, 0);
    });

    it('handles recent modifications', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const lastModified = new Date('2024-01-14T23:59:59Z');

      const recencyInDays = calculateRecency(lastModified, now);

      // Should be 0 or 1 depending on how we floor the calculation
      assert.ok(recencyInDays >= 0 && recencyInDays <= 1);
    });
  });

  describe('computeMetadata', () => {
    // Step 2.5.5: Test complete metadata computation
    it('adds all computed metadata to nodes', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const nodes: WikiNode[] = [
        {
          id: 'src/auth/login.ts',
          type: 'file',
          path: 'src/auth/login.ts',
          name: 'login.ts',
          metadata: {
            lines: 50,
            commits: 5,
            lastModified: new Date('2024-01-10T00:00:00Z'),
            createdAt: new Date('2023-12-01T00:00:00Z'),
            authors: ['alice@example.com'],
          },
          edges: [{ type: 'imports', target: 'src/utils/helper.ts' }],
          raw: {},
        },
        {
          id: 'src/utils/helper.ts',
          type: 'file',
          path: 'src/utils/helper.ts',
          name: 'helper.ts',
          metadata: {
            lines: 30,
            commits: 2,
            lastModified: new Date('2024-01-12T00:00:00Z'),
            createdAt: new Date('2023-11-15T00:00:00Z'),
            authors: ['bob@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      computeMetadata(nodes, now);

      // Check first node
      assert.strictEqual(nodes[0].metadata.fanIn, 0); // No imports to login.ts
      assert.strictEqual(nodes[0].metadata.fanOut, 1); // Imports helper.ts
      assert.strictEqual(nodes[0].metadata.ageInDays, 45); // Dec 1 to Jan 15 = 45 days
      assert.strictEqual(nodes[0].metadata.recencyInDays, 5); // Jan 10 to Jan 15 = 5 days

      // Check second node
      assert.strictEqual(nodes[1].metadata.fanIn, 1); // login.ts imports it
      assert.strictEqual(nodes[1].metadata.fanOut, 0); // No imports
      assert.strictEqual(nodes[1].metadata.ageInDays, 61); // Nov 15 to Jan 15 = 61 days
      assert.strictEqual(nodes[1].metadata.recencyInDays, 3); // Jan 12 to Jan 15 = 3 days
    });

    it('handles nodes without createdAt', () => {
      const now = new Date('2024-01-15T00:00:00Z');
      const nodes: WikiNode[] = [
        {
          id: 'src/test.ts',
          type: 'file',
          path: 'src/test.ts',
          name: 'test.ts',
          metadata: {
            lines: 10,
            commits: 1,
            lastModified: new Date('2024-01-14T00:00:00Z'),
            // No createdAt
            authors: ['alice@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      computeMetadata(nodes, now);

      assert.strictEqual(nodes[0].metadata.fanIn, 0);
      assert.strictEqual(nodes[0].metadata.fanOut, 0);
      assert.strictEqual(nodes[0].metadata.ageInDays, undefined); // Can't calculate without createdAt
      assert.strictEqual(nodes[0].metadata.recencyInDays, 1);
    });

    it('updates nodes in place', () => {
      const nodes: WikiNode[] = [
        {
          id: 'src/test.ts',
          type: 'file',
          path: 'src/test.ts',
          name: 'test.ts',
          metadata: {
            lines: 10,
            commits: 1,
            lastModified: new Date('2024-01-14T00:00:00Z'),
            authors: ['alice@example.com'],
          },
          edges: [],
          raw: {},
        },
      ];

      const originalNode = nodes[0];

      computeMetadata(nodes);

      // Should modify the same object
      assert.strictEqual(nodes[0], originalNode);
      assert.ok(typeof nodes[0].metadata.fanIn === 'number');
    });
  });
});
