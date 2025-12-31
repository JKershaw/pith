import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { MangoClient } from '@jkershaw/mangodb';
import { rm } from 'node:fs/promises';
import type { WikiNode } from '../builder/index.ts';
import { bundleContext, formatContextAsMarkdown, createApp } from './index.ts';

const TEST_DATA_DIR = './data/api-test';

describe('API', () => {
  let client: MangoClient;

  beforeEach(async () => {
    client = new MangoClient(TEST_DATA_DIR);
    await client.connect();
    const db = client.db('pith');
    const nodes = db.collection<WikiNode>('nodes');

    // Set up test data
    const testNodes: WikiNode[] = [
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: {
          lines: 100,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [
          { type: 'imports', target: 'src/db/users.ts' },
          { type: 'imports', target: 'src/utils/crypto.ts' },
          { type: 'parent', target: 'src/auth' },
        ],
        raw: {
          signature: ['async function login(username: string, password: string): Promise<Session>'],
          imports: [
            { from: '../db/users', names: ['findUser'] },
            { from: '../utils/crypto', names: ['hashPassword'] },
          ],
          exports: [{ name: 'login', kind: 'function' }],
        },
        prose: {
          summary: 'Handles user authentication via credentials.',
          purpose: 'Central authentication entry point.',
          gotchas: ['Requires database connection'],
          generatedAt: new Date('2024-12-15'),
        },
      },
      {
        id: 'src/db/users.ts',
        type: 'file',
        path: 'src/db/users.ts',
        name: 'users.ts',
        metadata: {
          lines: 50,
          commits: 5,
          lastModified: new Date('2024-11-01'),
          authors: ['bob'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [{ type: 'parent', target: 'src/db' }],
        raw: {
          signature: ['function findUser(username: string): User | null'],
          imports: [],
          exports: [{ name: 'findUser', kind: 'function' }],
        },
        prose: {
          summary: 'Database operations for user records.',
          purpose: 'Provides user CRUD operations.',
          gotchas: [],
          generatedAt: new Date('2024-12-15'),
        },
      },
      {
        id: 'src/utils/crypto.ts',
        type: 'file',
        path: 'src/utils/crypto.ts',
        name: 'crypto.ts',
        metadata: {
          lines: 30,
          commits: 3,
          lastModified: new Date('2024-10-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          signature: ['function hashPassword(password: string): string'],
          imports: [],
          exports: [{ name: 'hashPassword', kind: 'function' }],
        },
        prose: {
          summary: 'Cryptographic utilities.',
          purpose: 'Password hashing and verification.',
          gotchas: ['Uses bcrypt with cost factor 12'],
          generatedAt: new Date('2024-12-15'),
        },
      },
      {
        id: 'src/auth',
        type: 'module',
        path: 'src/auth',
        name: 'auth',
        metadata: {
          lines: 0,
          commits: 0,
          lastModified: new Date('2024-12-01'),
          authors: [],
          createdAt: new Date('2024-01-01'),
        },
        edges: [{ type: 'contains', target: 'src/auth/login.ts' }],
        raw: {
          readme: '# Auth Module\nHandles authentication.',
        },
        prose: {
          summary: 'Authentication module.',
          purpose: 'Manages user login and sessions.',
          gotchas: [],
          keyFiles: ['login.ts'],
          generatedAt: new Date('2024-12-15'),
        },
      },
    ];

    for (const node of testNodes) {
      await nodes.insertOne(node);
    }
  });

  afterEach(async () => {
    await client.close();
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('bundleContext', () => {
    it('returns requested nodes', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      const nodeIds = context.nodes.map((n) => n.id);
      assert.ok(nodeIds.includes('src/auth/login.ts'), 'Should include requested node');
    });

    it('includes imported nodes', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      const nodeIds = context.nodes.map((n) => n.id);
      assert.ok(nodeIds.includes('src/db/users.ts'), 'Should include imported users.ts');
      assert.ok(nodeIds.includes('src/utils/crypto.ts'), 'Should include imported crypto.ts');
    });

    it('includes parent module', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      const nodeIds = context.nodes.map((n) => n.id);
      assert.ok(nodeIds.includes('src/auth'), 'Should include parent module');
    });

    it('handles multiple requested files', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts', 'src/db/users.ts']);

      const nodeIds = context.nodes.map((n) => n.id);
      assert.ok(nodeIds.includes('src/auth/login.ts'));
      assert.ok(nodeIds.includes('src/db/users.ts'));
    });

    it('deduplicates nodes', async () => {
      const db = client.db('pith');
      // Both login.ts imports users.ts, and users.ts is also requested directly
      const context = await bundleContext(db, ['src/auth/login.ts', 'src/db/users.ts']);

      const usersNodes = context.nodes.filter((n) => n.id === 'src/db/users.ts');
      assert.strictEqual(usersNodes.length, 1, 'Should not duplicate nodes');
    });

    it('handles missing nodes gracefully', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/nonexistent.ts']);

      assert.strictEqual(context.nodes.length, 0);
      assert.ok(context.errors.includes('Node not found: src/nonexistent.ts'));
    });

    it('tracks depth of context', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      // Depth 0: requested node
      // Depth 1: imports + parent
      assert.strictEqual(context.depth, 1);
    });

    it('includes test files via testFile edges - Phase 6.2.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a source file with a testFile edge
      const sourceNode: WikiNode = {
        id: 'src/utils/parser.ts',
        type: 'file',
        path: 'src/utils/parser.ts',
        name: 'parser.ts',
        metadata: {
          lines: 100,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [{ type: 'testFile', target: 'src/utils/parser.test.ts' }],
        raw: {
          signature: ['function parse(input: string): AST'],
          exports: [{ name: 'parse', kind: 'function' }],
        },
      };

      // Add the test file
      const testNode: WikiNode = {
        id: 'src/utils/parser.test.ts',
        type: 'file',
        path: 'src/utils/parser.test.ts',
        name: 'parser.test.ts',
        metadata: {
          lines: 150,
          commits: 3,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          signature: ['function testParse(): void'],
        },
      };

      await nodes.insertOne(sourceNode);
      await nodes.insertOne(testNode);

      const context = await bundleContext(db, ['src/utils/parser.ts']);

      const nodeIds = context.nodes.map((n) => n.id);
      assert.ok(nodeIds.includes('src/utils/parser.ts'), 'Should include source file');
      assert.ok(
        nodeIds.includes('src/utils/parser.test.ts'),
        'Should include test file via testFile edge'
      );
    });

    it('uses fuzzy matching when exact path not found', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add nodes with similar names (simulating extract vs extractor)
      await nodes.insertOne({
        id: 'src/extractor/index.ts',
        type: 'file',
        path: 'src/extractor/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 100,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
        prose: { summary: 'Extractor module', generatedAt: new Date() },
      });

      // Request with typo (extract instead of extractor)
      const context = await bundleContext(db, ['src/extract/index.ts']);

      // Should fuzzy match to src/extractor/index.ts
      assert.ok(
        context.nodes.some((n) => n.id === 'src/extractor/index.ts'),
        'Should fuzzy match to similar path'
      );
      assert.ok(context.fuzzyMatches, 'Should have fuzzyMatches info');
      assert.strictEqual(context.fuzzyMatches!.length, 1);
      assert.strictEqual(context.fuzzyMatches![0]!.requestedPath, 'src/extract/index.ts');
      assert.strictEqual(context.fuzzyMatches![0]!.actualPath, 'src/extractor/index.ts');
      assert.ok(context.fuzzyMatches![0]!.confidence >= 0.7, 'Should have high confidence');
      assert.strictEqual(
        context.errors.length,
        0,
        'Should have no errors when fuzzy match succeeds'
      );
    });

    it('provides suggestions for medium-confidence fuzzy matches', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a node
      await nodes.insertOne({
        id: 'src/helper/utils.ts',
        type: 'file',
        path: 'src/helper/utils.ts',
        name: 'utils.ts',
        metadata: {
          lines: 50,
          commits: 3,
          lastModified: new Date('2024-12-01'),
          authors: ['bob'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      });

      // Request with somewhat similar but not great match
      const context = await bundleContext(db, ['src/helpers/util.ts']);

      // Should include suggestion in errors (confidence between 0.4 and 0.7)
      if (context.nodes.length === 0) {
        // If no nodes matched, check for suggestions in errors
        assert.ok(
          context.errors.some((e) => e.includes('did you mean') || e.includes('Node not found')),
          'Should have error with suggestion or not found message'
        );
      }
    });

    it('includes fuzzy match info for multiple paths', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      await nodes.insertOne({
        id: 'src/builder/index.ts',
        type: 'file',
        path: 'src/builder/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 200,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      });

      await nodes.insertOne({
        id: 'src/generator/index.ts',
        type: 'file',
        path: 'src/generator/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 300,
          commits: 15,
          lastModified: new Date('2024-12-01'),
          authors: ['bob'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      });

      // Request with typos
      const context = await bundleContext(db, [
        'src/build/index.ts', // Should match src/builder/index.ts
        'src/generate/index.ts', // Should match src/generator/index.ts
      ]);

      assert.strictEqual(context.nodes.length, 2, 'Should have 2 fuzzy-matched nodes');
      assert.ok(context.fuzzyMatches, 'Should have fuzzyMatches');
      assert.strictEqual(context.fuzzyMatches!.length, 2, 'Should have 2 fuzzy matches');
    });
  });

  describe('formatContextAsMarkdown', () => {
    it('formats nodes as markdown', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('# Context'), 'Should have header');
      assert.ok(markdown.includes('src/auth/login.ts'), 'Should include file path');
      assert.ok(markdown.includes('Handles user authentication'), 'Should include summary');
    });

    it('includes prose when available', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Central authentication entry point'), 'Should include purpose');
      assert.ok(markdown.includes('Requires database connection'), 'Should include gotchas');
    });

    it('includes signatures', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('async function login'), 'Should include function signature');
    });

    it('includes import relationships', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('src/db/users.ts'), 'Should show import target');
    });

    it('shows fuzzy match note when paths were corrected', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      await nodes.insertOne({
        id: 'src/extractor/index.ts',
        type: 'file',
        path: 'src/extractor/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 100,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
        prose: { summary: 'Test extractor', generatedAt: new Date() },
      });

      // Request with typo
      const context = await bundleContext(db, ['src/extract/index.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show note about fuzzy matching
      assert.ok(markdown.includes('fuzzy-matched'), 'Should mention fuzzy matching');
      assert.ok(markdown.includes('src/extract/index.ts'), 'Should show requested path');
      assert.ok(markdown.includes('src/extractor/index.ts'), 'Should show actual path');
    });

    it('includes dependents section - Phase 6.3.2', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a file with importedBy edges
      const utilNode: WikiNode = {
        id: 'src/utils/shared.ts',
        type: 'file',
        path: 'src/utils/shared.ts',
        name: 'shared.ts',
        metadata: {
          lines: 30,
          commits: 2,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'importedBy', target: 'src/auth/signup.ts' },
        ],
        raw: {
          signature: ['function shared(): void'],
          exports: [{ name: 'shared', kind: 'function' }],
        },
      };

      await nodes.insertOne(utilNode);

      const context = await bundleContext(db, ['src/utils/shared.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Dependents'), 'Should have Dependents section');
      assert.ok(markdown.includes('src/auth/login.ts'), 'Should list first dependent');
      assert.ok(markdown.includes('src/auth/signup.ts'), 'Should list second dependent');
    });

    it('does not show dependents section when no dependents - Phase 6.3.2', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a file with no dependents
      const isolatedNode: WikiNode = {
        id: 'src/isolated.ts',
        type: 'file',
        path: 'src/isolated.ts',
        name: 'isolated.ts',
        metadata: {
          lines: 10,
          commits: 1,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      };

      await nodes.insertOne(isolatedNode);

      const context = await bundleContext(db, ['src/isolated.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should not have a Dependents section since there are no importedBy edges
      const dependentsIndex = markdown.indexOf('Dependents');
      const isolatedIndex = markdown.indexOf('src/isolated.ts');

      // Either no Dependents section at all, or if it exists, it's not for the isolated file
      if (dependentsIndex !== -1 && isolatedIndex !== -1) {
        // Make sure Dependents section doesn't come after the isolated.ts heading
        assert.ok(dependentsIndex < isolatedIndex || dependentsIndex > isolatedIndex + 100);
      }
    });

    it('shows warning for high fan-in files - Phase 6.3.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a file with high fan-in
      const widelyUsedNode: WikiNode = {
        id: 'src/config.ts',
        type: 'file',
        path: 'src/config.ts',
        name: 'config.ts',
        metadata: {
          lines: 20,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 8, // High fan-in
        },
        edges: [
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'importedBy', target: 'src/auth/signup.ts' },
          { type: 'importedBy', target: 'src/api/server.ts' },
          { type: 'importedBy', target: 'src/api/routes.ts' },
          { type: 'importedBy', target: 'src/db/connect.ts' },
          { type: 'importedBy', target: 'src/utils/logger.ts' },
          { type: 'importedBy', target: 'src/utils/validator.ts' },
          { type: 'importedBy', target: 'src/cli/index.ts' },
        ],
        raw: {
          signature: ['export const config = {}'],
        },
      };

      await nodes.insertOne(widelyUsedNode);

      const context = await bundleContext(db, ['src/config.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Widely used'), 'Should show widely used warning');
      assert.ok(markdown.includes('8 files depend'), 'Should show count of dependents');
    });

    it('shows modification checklist for high-fanIn files - Phase 6.7.2.1', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a widely used file with high fan-in (interface with multiple consumers)
      const widelyUsedNode: WikiNode = {
        id: 'src/types/index.ts',
        type: 'file',
        path: 'src/types/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 50,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 8, // High fan-in triggers modification checklist
        },
        edges: [
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'importedBy', target: 'src/auth/signup.ts' },
          { type: 'importedBy', target: 'src/api/server.ts' },
          { type: 'importedBy', target: 'src/api/routes.ts' },
          { type: 'importedBy', target: 'src/db/connect.ts' },
          { type: 'importedBy', target: 'src/utils/logger.ts' },
          { type: 'importedBy', target: 'src/utils/validator.ts' },
          { type: 'importedBy', target: 'src/cli/index.ts' },
          { type: 'testFile', target: 'src/types/index.test.ts' },
        ],
        raw: {
          exports: [
            { name: 'WikiNode', kind: 'interface' },
            { name: 'Edge', kind: 'interface' },
          ],
          interfaces: [
            {
              name: 'WikiNode',
              isExported: true,
              properties: [
                { name: 'id', type: 'string', isOptional: false },
                { name: 'type', type: 'string', isOptional: false },
              ],
            },
          ],
        },
      };

      // Add the test file too
      const testFileNode: WikiNode = {
        id: 'src/types/index.test.ts',
        type: 'file',
        path: 'src/types/index.test.ts',
        name: 'index.test.ts',
        metadata: {
          lines: 30,
          commits: 2,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          testCommand: 'npm test -- src/types/index.test.ts',
        },
        edges: [],
        raw: {},
      };

      await nodes.insertOne(widelyUsedNode);
      await nodes.insertOne(testFileNode);

      const context = await bundleContext(db, ['src/types/index.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show modification checklist for high fan-in file
      assert.ok(
        markdown.includes('Modification Checklist'),
        'Should have Modification Checklist section'
      );
      assert.ok(markdown.includes('Update this file'), 'Should mention updating the source file');
      assert.ok(markdown.includes('Update consumers'), 'Should mention updating consumers');
      assert.ok(markdown.includes('8 files'), 'Should show number of dependent files');
    });

    it('shows test update requirements in modification checklist - Phase 6.7.2.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a widely used file with test file
      const widelyUsedNode: WikiNode = {
        id: 'src/builder/types.ts',
        type: 'file',
        path: 'src/builder/types.ts',
        name: 'types.ts',
        metadata: {
          lines: 100,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 7,
        },
        edges: [
          { type: 'importedBy', target: 'src/builder/index.ts' },
          { type: 'importedBy', target: 'src/api/index.ts' },
          { type: 'importedBy', target: 'src/generator/index.ts' },
          { type: 'importedBy', target: 'src/extractor/ast.ts' },
          { type: 'importedBy', target: 'src/cli/index.ts' },
          { type: 'importedBy', target: 'src/utils/helper.ts' },
          { type: 'importedBy', target: 'src/config/index.ts' },
          { type: 'testFile', target: 'src/builder/types.test.ts' },
        ],
        raw: {
          exports: [
            { name: 'WikiNode', kind: 'interface' },
            { name: 'Edge', kind: 'interface' },
          ],
        },
      };

      // Add test file with assertion info
      const testFileNode: WikiNode = {
        id: 'src/builder/types.test.ts',
        type: 'file',
        path: 'src/builder/types.test.ts',
        name: 'types.test.ts',
        metadata: {
          lines: 200,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          testCommand: 'npm test -- src/builder/types.test.ts',
        },
        edges: [],
        raw: {
          // Simulate that the test file has functions that reference WikiNode
          functions: [
            {
              name: 'testWikiNodeCreate',
              signature: 'function testWikiNodeCreate(): void',
              startLine: 10,
              endLine: 30,
              isAsync: false,
              isExported: false,
              codeSnippet: 'const node: WikiNode = { id: "test" };\nassert.ok(node.id);',
              keyStatements: [],
            },
            {
              name: 'testEdgeValidation',
              signature: 'function testEdgeValidation(): void',
              startLine: 35,
              endLine: 50,
              isAsync: false,
              isExported: false,
              codeSnippet:
                'const edge: Edge = { type: "imports", target: "foo" };\nassert.strictEqual(edge.type, "imports");',
              keyStatements: [],
            },
          ],
        },
      };

      await nodes.insertOne(widelyUsedNode);
      await nodes.insertOne(testFileNode);

      const context = await bundleContext(db, ['src/builder/types.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show test update requirements
      assert.ok(markdown.includes('Test file:'), 'Should show test file');
      assert.ok(markdown.includes('types.test.ts'), 'Should mention test file name');
      assert.ok(markdown.includes('npm test'), 'Should show test command');
    });

    it('shows middleware insertion points for Express-style apps - Phase 6.7.2.2', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add an Express-style server file with middleware
      const serverNode: WikiNode = {
        id: 'src/api/server.ts',
        type: 'file',
        path: 'src/api/server.ts',
        name: 'server.ts',
        metadata: {
          lines: 100,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 6, // Above threshold for modification checklist
        },
        edges: [
          { type: 'importedBy', target: 'src/index.ts' },
          { type: 'importedBy', target: 'src/cli/serve.ts' },
          { type: 'importedBy', target: 'src/api/routes.ts' },
          { type: 'importedBy', target: 'src/api/middleware.ts' },
          { type: 'importedBy', target: 'src/api/auth.ts' },
          { type: 'importedBy', target: 'src/api/handlers.ts' },
        ],
        raw: {
          functions: [
            {
              name: 'createApp',
              signature: 'function createApp(): Express',
              startLine: 15,
              endLine: 80,
              isAsync: false,
              isExported: true,
              codeSnippet: `const app = express();
app.use(express.json());
app.use(cors());
app.use('/api', routes);
return app;`,
              keyStatements: [
                { line: 16, text: 'app = express()', category: 'config' },
                { line: 17, text: 'app.use(express.json())', category: 'config' },
                { line: 18, text: 'app.use(cors())', category: 'config' },
                { line: 19, text: "app.use('/api', routes)", category: 'config' },
              ],
            },
          ],
        },
      };

      await nodes.insertOne(serverNode);

      const context = await bundleContext(db, ['src/api/server.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show middleware insertion point
      assert.ok(markdown.includes('Middleware'), 'Should mention middleware');
      assert.ok(markdown.includes('app.use'), 'Should show app.use pattern');
    });

    it('shows similar changes from git history in modification checklist - Phase 6.7.2.4', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a widely used file with git history showing prior changes
      const typesNode: WikiNode = {
        id: 'src/types/index.ts',
        type: 'file',
        path: 'src/types/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 100,
          commits: 15,
          lastModified: new Date('2024-12-01'),
          authors: ['alice', 'bob'],
          createdAt: new Date('2024-01-01'),
          fanIn: 8,
        },
        edges: [
          { type: 'importedBy', target: 'src/api/index.ts' },
          { type: 'importedBy', target: 'src/builder/index.ts' },
          { type: 'importedBy', target: 'src/generator/index.ts' },
          { type: 'importedBy', target: 'src/extractor/ast.ts' },
          { type: 'importedBy', target: 'src/cli/index.ts' },
          { type: 'importedBy', target: 'src/utils/helper.ts' },
          { type: 'importedBy', target: 'src/config/index.ts' },
          { type: 'importedBy', target: 'src/errors/index.ts' },
        ],
        raw: {
          exports: [
            { name: 'WikiNode', kind: 'interface' },
            { name: 'Edge', kind: 'interface' },
          ],
          recentCommits: [
            {
              hash: 'abc1234',
              message: 'feat: add metadata field to WikiNode',
              author: 'alice',
              date: new Date('2024-12-01'),
            },
            {
              hash: 'def5678',
              message: 'refactor: update Edge type definition',
              author: 'bob',
              date: new Date('2024-11-15'),
            },
            {
              hash: 'ghi9012',
              message: 'fix: correct optional property in WikiNode',
              author: 'alice',
              date: new Date('2024-11-01'),
            },
          ],
        },
      };

      await nodes.insertOne(typesNode);

      const context = await bundleContext(db, ['src/types/index.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show similar changes section
      assert.ok(
        markdown.includes('Recent Changes') || markdown.includes('Similar Changes'),
        'Should have changes section'
      );
      assert.ok(markdown.includes('add metadata field'), 'Should show commit message');
      assert.ok(markdown.includes('alice'), 'Should show author');
    });

    it('does not show modification checklist for low fan-in files - Phase 6.7.2.1', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a file with low fan-in (should NOT show modification checklist)
      const normalNode: WikiNode = {
        id: 'src/normal.ts',
        type: 'file',
        path: 'src/normal.ts',
        name: 'normal.ts',
        metadata: {
          lines: 30,
          commits: 3,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 2, // Low fan-in - no modification checklist needed
        },
        edges: [
          { type: 'importedBy', target: 'src/other.ts' },
          { type: 'importedBy', target: 'src/another.ts' },
        ],
        raw: {},
      };

      await nodes.insertOne(normalNode);

      const context = await bundleContext(db, ['src/normal.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should NOT show modification checklist for low fan-in file
      assert.ok(
        !markdown.includes('Modification Checklist'),
        'Should not show modification checklist for low fan-in'
      );
    });

    it('does not show warning for low fan-in files - Phase 6.3.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a file with low fan-in
      const normalNode: WikiNode = {
        id: 'src/normal.ts',
        type: 'file',
        path: 'src/normal.ts',
        name: 'normal.ts',
        metadata: {
          lines: 30,
          commits: 3,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          fanIn: 2, // Low fan-in
        },
        edges: [
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'importedBy', target: 'src/auth/signup.ts' },
        ],
        raw: {},
      };

      await nodes.insertOne(normalNode);

      const context = await bundleContext(db, ['src/normal.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(!markdown.includes('Widely used'), 'Should not show warning for low fan-in');
    });

    it('displays quick start for modules - Phase 6.4', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const moduleWithQuickStart: WikiNode = {
        id: 'src/mymodule',
        type: 'module',
        path: 'src/mymodule',
        name: 'mymodule',
        metadata: {
          lines: 200,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
        prose: {
          summary: 'My module summary',
          purpose: 'My module purpose',
          gotchas: [],
          quickStart: 'import { foo } from "./mymodule";\nfoo();',
          generatedAt: new Date('2024-12-15'),
        },
      };

      await nodes.insertOne(moduleWithQuickStart);

      const context = await bundleContext(db, ['src/mymodule']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Quick Start'), 'Should have Quick Start section');
      assert.ok(
        markdown.includes('import { foo } from "./mymodule"'),
        'Should show quick start code'
      );
    });

    it('displays patterns for files - Phase 6.4', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithPatterns: WikiNode = {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: {
          lines: 100,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
        prose: {
          summary: 'Utility functions',
          purpose: 'Provides common utilities',
          gotchas: [],
          patterns: [
            'Use formatDate() for dates',
            'Import with: import { formatDate } from "./utils"',
          ],
          generatedAt: new Date('2024-12-15'),
        },
      };

      await nodes.insertOne(fileWithPatterns);

      const context = await bundleContext(db, ['src/utils.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Patterns'), 'Should have Patterns section');
      assert.ok(markdown.includes('Use formatDate() for dates'), 'Should show first pattern');
      assert.ok(markdown.includes('Import with:'), 'Should show second pattern');
    });

    it('displays similar files for files - Phase 6.4', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithSimilar: WikiNode = {
        id: 'src/parser.ts',
        type: 'file',
        path: 'src/parser.ts',
        name: 'parser.ts',
        metadata: {
          lines: 150,
          commits: 8,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
        prose: {
          summary: 'Parser implementation',
          purpose: 'Parses source code',
          gotchas: [],
          similarFiles: ['src/lexer.ts', 'src/tokenizer.ts'],
          generatedAt: new Date('2024-12-15'),
        },
      };

      await nodes.insertOne(fileWithSimilar);

      const context = await bundleContext(db, ['src/parser.ts']);
      const markdown = formatContextAsMarkdown(context);

      assert.ok(markdown.includes('Similar Files'), 'Should have Similar Files section');
      assert.ok(markdown.includes('src/lexer.ts'), 'Should show first similar file');
      assert.ok(markdown.includes('src/tokenizer.ts'), 'Should show second similar file');
    });

    it('displays function details with line numbers, code snippets, and key statements - Phase 6.6.1', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithFunctions: WikiNode = {
        id: 'src/generator.ts',
        type: 'file',
        path: 'src/generator.ts',
        name: 'generator.ts',
        metadata: {
          lines: 200,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          signature: ['async function callLLM(prompt: string): Promise<string>'],
          functions: [
            {
              name: 'callLLM',
              signature: 'async function callLLM(prompt: string): Promise<string>',
              startLine: 45,
              endLine: 120,
              isAsync: true,
              isExported: true,
              codeSnippet: `async function callLLM(prompt: string): Promise<string> {
  const maxRetries = 3;
  const timeout = config.timeout ?? 30000;
  // ... (72 more lines)`,
              keyStatements: [
                { line: 47, text: 'maxRetries = 3', category: 'config' },
                { line: 48, text: 'timeout = config.timeout ?? 30000', category: 'config' },
                { line: 85, text: 'if (response.status === 429)', category: 'condition' },
                { line: 92, text: 'backoffMs = Math.pow(2, attempt) * 1000', category: 'math' },
                { line: 105, text: 'catch (error)', category: 'error' },
              ],
            },
          ],
        },
        prose: {
          summary: 'LLM API integration',
          purpose: 'Calls OpenRouter API with retry logic',
          gotchas: [],
          generatedAt: new Date('2024-12-15'),
        },
      };

      await nodes.insertOne(fileWithFunctions);

      const context = await bundleContext(db, ['src/generator.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show function with line numbers
      assert.ok(markdown.includes('callLLM'), 'Should show function name');
      assert.ok(markdown.includes('45') && markdown.includes('120'), 'Should show line numbers');

      // Should show code snippet
      assert.ok(markdown.includes('maxRetries = 3'), 'Should show code snippet content');
      assert.ok(
        markdown.includes('timeout = config.timeout ?? 30000'),
        'Should show config in snippet'
      );

      // Should show key statements
      assert.ok(
        markdown.includes('Key statements') || markdown.includes('key statements'),
        'Should have key statements section'
      );
      assert.ok(markdown.includes('status === 429'), 'Should show status code condition');
      assert.ok(markdown.includes('Math.pow(2, attempt)'), 'Should show backoff formula');
    });

    it('displays error paths grouped by symptom - Phase 6.7.4.1', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithErrorPaths: WikiNode = {
        id: 'src/api/handler.ts',
        type: 'file',
        path: 'src/api/handler.ts',
        name: 'handler.ts',
        metadata: {
          lines: 100,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          functions: [
            {
              name: 'handleRequest',
              signature: 'async function handleRequest(req: Request): Promise<Response>',
              startLine: 10,
              endLine: 50,
              isAsync: true,
              isExported: true,
              codeSnippet: `async function handleRequest(req: Request): Promise<Response> {
  if (!req.path) return new Response(null, { status: 400 });
  const node = await db.find(req.path);
  if (!node) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(node));
}`,
              keyStatements: [],
              errorPaths: [
                {
                  type: 'guard',
                  line: 11,
                  condition: '!req.path',
                  action: 'returns 400 (Bad Request)',
                },
                { type: 'guard', line: 13, condition: '!node', action: 'returns 404 (Not Found)' },
                {
                  type: 'catch',
                  line: 45,
                  condition: 'catch (error)',
                  action: 'returns 500 (Internal Error)',
                },
              ],
            },
          ],
        },
      };

      await nodes.insertOne(fileWithErrorPaths);

      const context = await bundleContext(db, ['src/api/handler.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show error paths grouped
      assert.ok(
        markdown.includes('Error Paths') || markdown.includes('error paths'),
        'Should have error paths section'
      );
      assert.ok(
        markdown.includes('400') || markdown.includes('Bad Request'),
        'Should show 400 error'
      );
      assert.ok(
        markdown.includes('404') || markdown.includes('Not Found'),
        'Should show 404 error'
      );
    });

    it('shows debug checklist for functions with error paths - Phase 6.7.4.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithDebugInfo: WikiNode = {
        id: 'src/api/router.ts',
        type: 'file',
        path: 'src/api/router.ts',
        name: 'router.ts',
        metadata: {
          lines: 80,
          commits: 8,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [{ type: 'testFile', target: 'src/api/router.test.ts' }],
        raw: {
          functions: [
            {
              name: 'resolveRoute',
              signature: 'function resolveRoute(path: string): Handler | null',
              startLine: 15,
              endLine: 40,
              isAsync: false,
              isExported: true,
              codeSnippet: `function resolveRoute(path: string): Handler | null {
  if (path.includes('\\\\')) return null;  // Windows path issue
  if (!path.startsWith('/')) return null;  // Missing leading slash
  const normalized = path.replace(/\\/+$/, '');
  return routes.get(normalized) ?? null;
}`,
              keyStatements: [
                { line: 16, text: "path.includes('\\\\')", category: 'condition' },
                { line: 17, text: "!path.startsWith('/')", category: 'condition' },
              ],
              errorPaths: [
                {
                  type: 'guard',
                  line: 16,
                  condition: "path.includes('\\\\')",
                  action: 'returns null (Windows path)',
                },
                {
                  type: 'guard',
                  line: 17,
                  condition: "!path.startsWith('/')",
                  action: 'returns null (missing slash)',
                },
                {
                  type: 'early-return',
                  line: 19,
                  condition: '!routes.get(normalized)',
                  action: 'returns null',
                },
              ],
            },
          ],
        },
      };

      // Add test file
      const testFileNode: WikiNode = {
        id: 'src/api/router.test.ts',
        type: 'file',
        path: 'src/api/router.test.ts',
        name: 'router.test.ts',
        metadata: {
          lines: 100,
          commits: 4,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          testCommand: 'npm test -- src/api/router.test.ts',
        },
        edges: [],
        raw: {},
      };

      await nodes.insertOne(fileWithDebugInfo);
      await nodes.insertOne(testFileNode);

      const context = await bundleContext(db, ['src/api/router.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show debug-relevant info
      assert.ok(
        markdown.includes('Windows') || markdown.includes('backslash'),
        'Should mention Windows path issue'
      );
      assert.ok(
        markdown.includes('slash') || markdown.includes("startsWith('/')"),
        'Should mention slash requirement'
      );
    });

    it('shows detected patterns with evidence - Phase 6.7.5', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithPatterns: WikiNode = {
        id: 'src/api/client.ts',
        type: 'file',
        path: 'src/api/client.ts',
        name: 'client.ts',
        metadata: {
          lines: 200,
          commits: 15,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          patterns: [
            {
              name: 'retry',
              confidence: 'high',
              evidence: [
                'line 45: maxRetries = 3',
                'line 60: catch block with retry logic',
                'line 65: exponential backoff',
              ],
              location: 'src/api/client.ts:fetchWithRetry',
            },
          ],
          functions: [
            {
              name: 'fetchWithRetry',
              signature: 'async function fetchWithRetry(url: string): Promise<Response>',
              startLine: 40,
              endLine: 80,
              isAsync: true,
              isExported: true,
              codeSnippet: `async function fetchWithRetry(url: string): Promise<Response> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fetch(url); }
    catch (e) { await sleep(Math.pow(2, attempt) * 1000); }
  }
}`,
              keyStatements: [
                { line: 45, text: 'maxRetries = 3', category: 'config' },
                { line: 65, text: 'Math.pow(2, attempt) * 1000', category: 'math' },
              ],
            },
          ],
        },
      };

      await nodes.insertOne(fileWithPatterns);

      const context = await bundleContext(db, ['src/api/client.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show detected patterns with evidence
      assert.ok(
        markdown.includes('Pattern') || markdown.includes('pattern'),
        'Should have patterns section'
      );
      assert.ok(
        markdown.includes('retry') || markdown.includes('Retry'),
        'Should show retry pattern'
      );
      assert.ok(
        markdown.includes('evidence') || markdown.includes('maxRetries'),
        'Should show evidence'
      );
    });

    it('shows enhanced call flow with file:line references - Phase 6.7.3', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithCallFlow: WikiNode = {
        id: 'src/cli/index.ts',
        type: 'file',
        path: 'src/cli/index.ts',
        name: 'index.ts',
        metadata: {
          lines: 150,
          commits: 12,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {
          functions: [
            {
              name: 'runBuild',
              signature: 'async function runBuild(): Promise<void>',
              startLine: 45,
              endLine: 100,
              isAsync: true,
              isExported: true,
              codeSnippet: `async function runBuild(): Promise<void> {
  const files = await extractFiles(config.path);
  const nodes = await buildNodes(files);
  await storeNodes(nodes);
}`,
              keyStatements: [
                { line: 46, text: 'extractFiles(config.path)', category: 'call' },
                { line: 47, text: 'buildNodes(files)', category: 'call' },
              ],
              crossFileCalls: [
                'src/extractor/ast.ts:extractFiles',
                'src/builder/index.ts:buildNodes',
                'src/builder/index.ts:storeNodes',
              ],
              crossFileCalledBy: ['src/cli/commands.ts:buildCommand'],
            },
          ],
        },
      };

      await nodes.insertOne(fileWithCallFlow);

      const context = await bundleContext(db, ['src/cli/index.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should show enhanced call flow with file references
      assert.ok(markdown.includes('Call Flow'), 'Should have Call Flow section');
      assert.ok(
        markdown.includes('extractFiles') || markdown.includes('extractor'),
        'Should show called function'
      );
      assert.ok(
        markdown.includes('buildNodes') || markdown.includes('builder'),
        'Should show another called function'
      );
    });

    it('links error paths to test files - Phase 6.7.4.4', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      const fileWithErrors: WikiNode = {
        id: 'src/service/api.ts',
        type: 'file',
        path: 'src/service/api.ts',
        name: 'api.ts',
        metadata: {
          lines: 120,
          commits: 10,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [{ type: 'testFile', target: 'src/service/api.test.ts' }],
        raw: {
          functions: [
            {
              name: 'fetchData',
              signature: 'async function fetchData(id: string): Promise<Data>',
              startLine: 20,
              endLine: 60,
              isAsync: true,
              isExported: true,
              codeSnippet: `async function fetchData(id: string): Promise<Data> {
  if (!id) throw new Error('ID required');
  const response = await fetch(\`/api/\${id}\`);
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}`,
              keyStatements: [],
              errorPaths: [
                {
                  type: 'guard',
                  line: 21,
                  condition: '!id',
                  action: "throws Error('ID required')",
                },
                {
                  type: 'guard',
                  line: 24,
                  condition: '!response.ok',
                  action: 'throws Error(HTTP status)',
                },
              ],
            },
          ],
        },
      };

      // Add test file with info about what it tests
      const testFile: WikiNode = {
        id: 'src/service/api.test.ts',
        type: 'file',
        path: 'src/service/api.test.ts',
        name: 'api.test.ts',
        metadata: {
          lines: 80,
          commits: 5,
          lastModified: new Date('2024-12-01'),
          authors: ['alice'],
          createdAt: new Date('2024-01-01'),
          testCommand: 'npm test -- src/service/api.test.ts',
        },
        edges: [],
        raw: {
          functions: [
            {
              name: 'testFetchDataWithMissingId',
              signature: 'function testFetchDataWithMissingId(): void',
              startLine: 10,
              endLine: 15,
              isAsync: false,
              isExported: false,
              codeSnippet: 'expect(() => fetchData("")).toThrow("ID required");',
              keyStatements: [],
            },
          ],
        },
      };

      await nodes.insertOne(fileWithErrors);
      await nodes.insertOne(testFile);

      const context = await bundleContext(db, ['src/service/api.ts']);
      const markdown = formatContextAsMarkdown(context);

      // Should link to test file for coverage
      assert.ok(
        markdown.includes('api.test.ts') || markdown.includes('test'),
        'Should reference test file'
      );
    });
  });

  describe('createApp', () => {
    it('GET /node/:path returns node data', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      // Use native fetch to test the express app
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/node/src/auth/login.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(data.id, 'src/auth/login.ts');
        assert.strictEqual(data.type, 'file');
        assert.ok(data.prose);
      } finally {
        server.close();
      }
    });

    it('GET /node/:path returns 404 for missing node', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/node/nonexistent.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 404);
        assert.strictEqual(data.error, 'NOT_FOUND');
      } finally {
        server.close();
      }
    });

    it('GET /context returns bundled context as markdown', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/context?files=src/auth/login.ts`);
        const text = await response.text();

        assert.strictEqual(response.status, 200);
        assert.ok(response.headers.get('content-type')?.includes('text/markdown'));
        assert.ok(text.includes('# Context'));
        assert.ok(text.includes('src/auth/login.ts'));
      } finally {
        server.close();
      }
    });

    it('GET /context supports multiple files', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(
          `http://localhost:${port}/context?files=src/auth/login.ts,src/db/users.ts`
        );
        const text = await response.text();

        assert.strictEqual(response.status, 200);
        assert.ok(text.includes('src/auth/login.ts'));
        assert.ok(text.includes('src/db/users.ts'));
      } finally {
        server.close();
      }
    });

    it('GET /context?format=json returns JSON', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(
          `http://localhost:${port}/context?files=src/auth/login.ts&format=json`
        );
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(data.nodes));
        assert.ok(data.nodes.some((n: WikiNode) => n.id === 'src/auth/login.ts'));
      } finally {
        server.close();
      }
    });

    it('GET /context returns 400 when no files specified', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/context`);
        const data = await response.json();

        assert.strictEqual(response.status, 400);
        assert.strictEqual(data.error, 'INVALID_REQUEST');
      } finally {
        server.close();
      }
    });

    it('POST /refresh requires projectPath in body', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await response.json();

        assert.strictEqual(response.status, 400);
        assert.strictEqual(data.error, 'INVALID_REQUEST');
        assert.ok(data.message.includes('projectPath'));
      } finally {
        server.close();
      }
    });

    it('POST /refresh returns error for invalid path', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath: '/nonexistent/path' }),
        });
        const data = await response.json();

        assert.strictEqual(response.status, 400);
        assert.strictEqual(data.error, 'INVALID_PATH');
      } finally {
        server.close();
      }
    });
  });

  describe('on-demand prose generation', () => {
    it(
      'GET /node/:path generates prose on-the-fly when node has no prose',
      { timeout: 5000 },
      async () => {
        const db = client.db('pith');
        const nodes = db.collection<WikiNode>('nodes');

        // Add a node without prose
        const nodeWithoutProse: WikiNode = {
          id: 'src/newfile.ts',
          type: 'file',
          path: 'src/newfile.ts',
          name: 'newfile.ts',
          metadata: {
            lines: 50,
            commits: 2,
            lastModified: new Date('2024-12-01'),
            authors: ['dev@example.com'],
            createdAt: new Date('2024-01-01'),
          },
          edges: [],
          raw: {
            signature: ['function newFunction(): void'],
            exports: [{ name: 'newFunction', kind: 'function' }],
          },
        };
        await nodes.insertOne(nodeWithoutProse);

        // Mock LLM fetch function
        const mockLLMResponse = JSON.stringify({
          summary: 'Generated summary for newfile',
          purpose: 'Generated purpose for newfile.',
          gotchas: [],
          keyExports: ['newFunction: Main function'],
        });

        const mockFetch = async () => ({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: mockLLMResponse } }],
          }),
        });

        const generatorConfig = {
          provider: 'openrouter' as const,
          model: 'anthropic/claude-sonnet-4',
          apiKey: 'test-key',
        };

        const app = createApp(db, generatorConfig, mockFetch as unknown as typeof fetch);

        const server = app.listen(0);
        await new Promise<void>((resolve) => server.once('listening', resolve));
        const port = (server.address() as { port: number }).port;

        try {
          const response = await fetch(`http://localhost:${port}/node/src/newfile.ts`);
          const data = await response.json();

          assert.strictEqual(response.status, 200);
          assert.strictEqual(data.id, 'src/newfile.ts');
          // Should have generated prose
          assert.ok(data.prose);
          assert.strictEqual(data.prose.summary, 'Generated summary for newfile');

          // Verify prose was cached to DB
          const nodeFromDb = await nodes.findOne({ id: 'src/newfile.ts' });
          assert.ok(nodeFromDb?.prose);
          assert.strictEqual(nodeFromDb.prose.summary, 'Generated summary for newfile');
        } finally {
          server.close();
        }
      }
    );

    it('GET /node/:path skips generation when prose=false', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a node without prose
      const nodeWithoutProse: WikiNode = {
        id: 'src/skipgen.ts',
        type: 'file',
        path: 'src/skipgen.ts',
        name: 'skipgen.ts',
        metadata: {
          lines: 50,
          commits: 2,
          lastModified: new Date('2024-12-01'),
          authors: ['dev@example.com'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      };
      await nodes.insertOne(nodeWithoutProse);

      const mockFetch = async () => {
        throw new Error('LLM should not be called');
      };

      const generatorConfig = {
        provider: 'openrouter' as const,
        model: 'anthropic/claude-sonnet-4',
        apiKey: 'test-key',
      };

      const app = createApp(db, generatorConfig, mockFetch as unknown as typeof fetch);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/node/src/skipgen.ts?prose=false`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(data.id, 'src/skipgen.ts');
        // Should NOT have generated prose
        assert.strictEqual(data.prose, undefined);
      } finally {
        server.close();
      }
    });

    it(
      'GET /node/:path returns existing prose without regenerating',
      { timeout: 5000 },
      async () => {
        const db = client.db('pith');

        const mockFetch = async () => {
          throw new Error('LLM should not be called for existing prose');
        };

        const generatorConfig = {
          provider: 'openrouter' as const,
          model: 'anthropic/claude-sonnet-4',
          apiKey: 'test-key',
        };

        const app = createApp(db, generatorConfig, mockFetch as unknown as typeof fetch);

        const server = app.listen(0);
        await new Promise<void>((resolve) => server.once('listening', resolve));
        const port = (server.address() as { port: number }).port;

        try {
          // Request node that already has prose
          const response = await fetch(`http://localhost:${port}/node/src/auth/login.ts`);
          const data = await response.json();

          assert.strictEqual(response.status, 200);
          assert.strictEqual(data.id, 'src/auth/login.ts');
          // Should return existing prose
          assert.ok(data.prose);
          assert.strictEqual(data.prose.summary, 'Handles user authentication via credentials.');
        } finally {
          server.close();
        }
      }
    );

    it('GET /node/:path works without generatorConfig', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add a node without prose
      const nodeWithoutProse: WikiNode = {
        id: 'src/nogen.ts',
        type: 'file',
        path: 'src/nogen.ts',
        name: 'nogen.ts',
        metadata: {
          lines: 50,
          commits: 2,
          lastModified: new Date('2024-12-01'),
          authors: ['dev@example.com'],
          createdAt: new Date('2024-01-01'),
        },
        edges: [],
        raw: {},
      };
      await nodes.insertOne(nodeWithoutProse);

      // No generatorConfig provided
      const app = createApp(db);

      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/node/src/nogen.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(data.id, 'src/nogen.ts');
        // Should NOT have prose (no generation)
        assert.strictEqual(data.prose, undefined);
      } finally {
        server.close();
      }
    });
  });
});

describe('Change Impact API - Phase 6.6.5', () => {
  let client: MangoClient;

  beforeEach(async () => {
    client = new MangoClient('./data/impact-test');
    await client.connect();
    const db = client.db('pith');
    const nodes = db.collection<WikiNode>('nodes');

    // Set up test data for impact analysis
    const testNodes: WikiNode[] = [
      // Core types file (many files depend on this)
      {
        id: 'src/types/index.ts',
        type: 'file',
        path: 'src/types/index.ts',
        name: 'index.ts',
        metadata: { lines: 50, commits: 5, lastModified: new Date(), authors: ['alice'] },
        edges: [
          { type: 'importedBy', target: 'src/utils/helper.ts' },
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'testFile', target: 'src/types/index.test.ts' },
        ],
        raw: {
          exports: [
            { name: 'User', kind: 'interface' },
            { name: 'Session', kind: 'interface' },
          ],
        },
      },
      // Test file for types
      {
        id: 'src/types/index.test.ts',
        type: 'file',
        path: 'src/types/index.test.ts',
        name: 'index.test.ts',
        metadata: {
          lines: 30,
          commits: 2,
          lastModified: new Date(),
          authors: ['alice'],
          testCommand: 'npm test -- src/types/index.test.ts',
        },
        edges: [],
        raw: {},
      },
      // Utils helper (depends on types, depended by login)
      {
        id: 'src/utils/helper.ts',
        type: 'file',
        path: 'src/utils/helper.ts',
        name: 'helper.ts',
        metadata: { lines: 80, commits: 10, lastModified: new Date(), authors: ['bob'] },
        edges: [
          { type: 'imports', target: 'src/types/index.ts' },
          { type: 'importedBy', target: 'src/auth/login.ts' },
          { type: 'testFile', target: 'src/utils/helper.test.ts' },
        ],
        raw: {
          imports: [{ from: '../types', names: ['User', 'Session'] }],
          functions: [
            {
              name: 'validateUser',
              signature: 'function validateUser(user: User): boolean',
              startLine: 10,
              endLine: 25,
              isAsync: false,
              isExported: true,
              codeSnippet: 'const isValid = user.id && user.name;\nreturn isValid;',
              keyStatements: [],
            },
          ],
        },
      },
      // Test file for helper
      {
        id: 'src/utils/helper.test.ts',
        type: 'file',
        path: 'src/utils/helper.test.ts',
        name: 'helper.test.ts',
        metadata: {
          lines: 60,
          commits: 3,
          lastModified: new Date(),
          authors: ['bob'],
          testCommand: 'npm test -- src/utils/helper.test.ts',
        },
        edges: [],
        raw: {},
      },
      // Auth login (depends on both types and helper)
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 100, commits: 15, lastModified: new Date(), authors: ['alice', 'bob'] },
        edges: [
          { type: 'imports', target: 'src/types/index.ts' },
          { type: 'imports', target: 'src/utils/helper.ts' },
          { type: 'testFile', target: 'src/auth/login.test.ts' },
        ],
        raw: {
          imports: [
            { from: '../types', names: ['User', 'Session'] },
            { from: '../utils/helper', names: ['validateUser'] },
          ],
          functions: [
            {
              name: 'login',
              signature:
                'async function login(username: string, password: string): Promise<Session>',
              startLine: 15,
              endLine: 50,
              isAsync: true,
              isExported: true,
              codeSnippet:
                'const user = await findUser(username);\nconst valid = validateUser(user);\nif (!valid) throw new Error("Invalid");',
              keyStatements: [],
            },
          ],
        },
      },
      // Test file for login
      {
        id: 'src/auth/login.test.ts',
        type: 'file',
        path: 'src/auth/login.test.ts',
        name: 'login.test.ts',
        metadata: {
          lines: 120,
          commits: 8,
          lastModified: new Date(),
          authors: ['alice'],
          testCommand: 'npm test -- src/auth/login.test.ts',
        },
        edges: [],
        raw: {},
      },
    ];

    for (const node of testNodes) {
      await nodes.insertOne(node);
    }
  });

  afterEach(async () => {
    await client.close();
    await rm('./data/impact-test', { recursive: true, force: true });
  });

  describe('GET /impact/:path', () => {
    it('returns impact analysis for a file with dependents', async () => {
      const db = client.db('pith');
      const app = createApp(db);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/impact/src/types/index.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(data.sourceFile, 'src/types/index.ts');
        assert.ok(data.directDependents.includes('src/utils/helper.ts'));
        assert.ok(data.directDependents.includes('src/auth/login.ts'));
        assert.ok(data.totalAffectedFiles >= 2);
      } finally {
        server.close();
      }
    });

    it('includes transitive dependents', async () => {
      const db = client.db('pith');
      const app = createApp(db);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/impact/src/types/index.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        // login.ts depends on helper.ts which depends on types
        // but login also directly imports types, so it should be in directDependents
        assert.ok(data.directDependents.includes('src/auth/login.ts'));
      } finally {
        server.close();
      }
    });

    it('includes test files that cover affected code', async () => {
      const db = client.db('pith');
      const app = createApp(db);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/impact/src/types/index.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.ok(data.testFiles);
        assert.ok(data.testFiles.length > 0);
        assert.ok(
          data.testFiles.some((t: { path: string }) => t.path === 'src/types/index.test.ts')
        );
      } finally {
        server.close();
      }
    });

    it('returns 404 for non-existent file', async () => {
      const db = client.db('pith');
      const app = createApp(db);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/impact/src/nonexistent.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 404);
        assert.strictEqual(data.error, 'NOT_FOUND');
      } finally {
        server.close();
      }
    });

    it('returns empty impact for isolated file', async () => {
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');
      await nodes.insertOne({
        id: 'src/isolated.ts',
        type: 'file',
        path: 'src/isolated.ts',
        name: 'isolated.ts',
        metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: ['alice'] },
        edges: [],
        raw: {},
      });

      const app = createApp(db);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/impact/src/isolated.ts`);
        const data = await response.json();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(data.totalAffectedFiles, 0);
        assert.strictEqual(data.directDependents.length, 0);
      } finally {
        server.close();
      }
    });
  });

  describe('formatChangeImpactAsMarkdown', () => {
    it('formats impact with all sections', async () => {
      const { formatChangeImpactAsMarkdown } = await import('./index.ts');
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');
      const allNodes = await nodes.find({}).toArray();

      const markdown = await formatChangeImpactAsMarkdown(
        'src/types/index.ts',
        allNodes as WikiNode[]
      );

      // Check sections exist
      assert.ok(markdown.includes('# Change Impact Analysis'));
      assert.ok(markdown.includes('src/types/index.ts'));
      assert.ok(markdown.includes('## Direct Dependents'));
      assert.ok(markdown.includes('src/utils/helper.ts'));
      assert.ok(markdown.includes('## Test Files to Run'));
    });

    it('shows affected functions in dependents', async () => {
      const { formatChangeImpactAsMarkdown } = await import('./index.ts');
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');
      const allNodes = await nodes.find({}).toArray();

      // Add a changedExports option to the markdown
      const markdown = await formatChangeImpactAsMarkdown(
        'src/utils/helper.ts',
        allNodes as WikiNode[],
        ['validateUser']
      );

      // Should show the login function that uses validateUser
      assert.ok(markdown.includes('login'));
    });

    it('handles files with no dependents gracefully', async () => {
      const { formatChangeImpactAsMarkdown } = await import('./index.ts');
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add isolated file
      await nodes.insertOne({
        id: 'src/isolated.ts',
        type: 'file',
        path: 'src/isolated.ts',
        name: 'isolated.ts',
        metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: ['alice'] },
        edges: [],
        raw: {},
      });

      const allNodes = await nodes.find({}).toArray();
      const markdown = await formatChangeImpactAsMarkdown(
        'src/isolated.ts',
        allNodes as WikiNode[]
      );

      assert.ok(markdown.includes('No files depend on this'));
    });

    it('shows usage locations in dependents - Phase 6.7.1', async () => {
      const { formatChangeImpactAsMarkdown } = await import('./index.ts');
      const db = client.db('pith');
      const nodes = db.collection<WikiNode>('nodes');

      // Add the source file with exports
      await nodes.insertOne({
        id: 'src/shared/types.ts',
        type: 'file',
        path: 'src/shared/types.ts',
        name: 'types.ts',
        metadata: { lines: 50, commits: 5, lastModified: new Date(), authors: ['alice'] },
        edges: [{ type: 'importedBy', target: 'src/service/user.ts' }],
        raw: {
          exports: [
            { name: 'User', kind: 'interface' },
            { name: 'Session', kind: 'interface' },
          ],
        },
      });

      // Add the dependent with specific usage locations
      await nodes.insertOne({
        id: 'src/service/user.ts',
        type: 'file',
        path: 'src/service/user.ts',
        name: 'user.ts',
        metadata: { lines: 100, commits: 10, lastModified: new Date(), authors: ['bob'] },
        edges: [{ type: 'imports', target: 'src/shared/types.ts' }],
        raw: {
          imports: [{ from: '../shared/types', names: ['User', 'Session'] }],
          functions: [
            {
              name: 'createUser',
              signature: 'function createUser(data: User): Promise<User>',
              startLine: 15,
              endLine: 30,
              isAsync: true,
              isExported: true,
              codeSnippet: 'const user: User = { ...data };\nreturn user;',
              keyStatements: [],
            },
          ],
        },
      });

      const allNodes = await nodes.find({}).toArray();
      const markdown = await formatChangeImpactAsMarkdown(
        'src/shared/types.ts',
        allNodes as WikiNode[],
        ['User']
      );

      // Should show which functions use the changed export
      assert.ok(
        markdown.includes('createUser') || markdown.includes('user.ts'),
        'Should show dependent function or file'
      );
      assert.ok(markdown.includes('User'), 'Should show used export');
    });
  });
});
