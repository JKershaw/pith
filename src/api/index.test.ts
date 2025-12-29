import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { MangoClient } from '@jkershaw/mangodb';
import { rm } from 'node:fs/promises';
import type { WikiNode } from '../builder/index.ts';
import {
  bundleContext,
  formatContextAsMarkdown,
  createApp,
} from './index.ts';

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
        edges: [
          { type: 'parent', target: 'src/db' },
        ],
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
        edges: [
          { type: 'contains', target: 'src/auth/login.ts' },
        ],
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

      const nodeIds = context.nodes.map(n => n.id);
      assert.ok(nodeIds.includes('src/auth/login.ts'), 'Should include requested node');
    });

    it('includes imported nodes', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      const nodeIds = context.nodes.map(n => n.id);
      assert.ok(nodeIds.includes('src/db/users.ts'), 'Should include imported users.ts');
      assert.ok(nodeIds.includes('src/utils/crypto.ts'), 'Should include imported crypto.ts');
    });

    it('includes parent module', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts']);

      const nodeIds = context.nodes.map(n => n.id);
      assert.ok(nodeIds.includes('src/auth'), 'Should include parent module');
    });

    it('handles multiple requested files', async () => {
      const db = client.db('pith');
      const context = await bundleContext(db, ['src/auth/login.ts', 'src/db/users.ts']);

      const nodeIds = context.nodes.map(n => n.id);
      assert.ok(nodeIds.includes('src/auth/login.ts'));
      assert.ok(nodeIds.includes('src/db/users.ts'));
    });

    it('deduplicates nodes', async () => {
      const db = client.db('pith');
      // Both login.ts imports users.ts, and users.ts is also requested directly
      const context = await bundleContext(db, ['src/auth/login.ts', 'src/db/users.ts']);

      const usersNodes = context.nodes.filter(n => n.id === 'src/db/users.ts');
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
        edges: [
          { type: 'testFile', target: 'src/utils/parser.test.ts' },
        ],
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

      const nodeIds = context.nodes.map(n => n.id);
      assert.ok(nodeIds.includes('src/utils/parser.ts'), 'Should include source file');
      assert.ok(nodeIds.includes('src/utils/parser.test.ts'), 'Should include test file via testFile edge');
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
          fanIn: 8,  // High fan-in
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
          fanIn: 2,  // Low fan-in
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
  });

  describe('createApp', () => {
    it('GET /node/:path returns node data', { timeout: 5000 }, async () => {
      const db = client.db('pith');
      const app = createApp(db);

      // Use native fetch to test the express app
      const server = app.listen(0);
      await new Promise<void>(resolve => server.once('listening', resolve));
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
      await new Promise<void>(resolve => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/context?files=src/auth/login.ts,src/db/users.ts`);
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
      await new Promise<void>(resolve => server.once('listening', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const response = await fetch(`http://localhost:${port}/context?files=src/auth/login.ts&format=json`);
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
    it('GET /node/:path generates prose on-the-fly when node has no prose', { timeout: 5000 }, async () => {
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
          choices: [{ message: { content: mockLLMResponse } }]
        }),
      });

      const generatorConfig = {
        provider: 'openrouter' as const,
        model: 'anthropic/claude-sonnet-4',
        apiKey: 'test-key',
      };

      const app = createApp(db, generatorConfig, mockFetch as unknown as typeof fetch);

      const server = app.listen(0);
      await new Promise<void>(resolve => server.once('listening', resolve));
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
    });

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
      await new Promise<void>(resolve => server.once('listening', resolve));
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

    it('GET /node/:path returns existing prose without regenerating', { timeout: 5000 }, async () => {
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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
    });

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
      await new Promise<void>(resolve => server.once('listening', resolve));
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
