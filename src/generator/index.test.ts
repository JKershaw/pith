import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import type { ProseData, GeneratorConfig } from './index.ts';
import { buildPrompt, parseLLMResponse, callLLM, generateProse, updateNodeWithProse, isStale, markStaleNodes, generateProseForNode, extractIdentifiers, validateGotcha, validateGotchas } from './index.ts';
import type { WikiNode } from '../builder/index.ts';
import { getDb, closeDb } from '../db/index.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('generator types', () => {
  it('ProseData has required fields', () => {
    const prose: ProseData = {
      summary: 'A test summary',
      purpose: 'Test purpose explaining why this exists.',
      gotchas: ['Watch out for edge case X'],
      generatedAt: new Date(),
    };

    assert.strictEqual(prose.summary, 'A test summary');
    assert.strictEqual(prose.purpose, 'Test purpose explaining why this exists.');
    assert.deepStrictEqual(prose.gotchas, ['Watch out for edge case X']);
    assert.ok(prose.generatedAt instanceof Date);
  });

  it('ProseData supports optional pattern fields', () => {
    const proseWithPatterns: ProseData = {
      summary: 'A test summary',
      purpose: 'Test purpose',
      gotchas: [],
      generatedAt: new Date(),
      quickStart: 'import { foo } from "./module"; foo();',
      patterns: ['Common pattern: use X for Y', 'Avoid Z pattern'],
      similarFiles: ['src/similar1.ts', 'src/similar2.ts'],
    };

    assert.strictEqual(proseWithPatterns.quickStart, 'import { foo } from "./module"; foo();');
    assert.deepStrictEqual(proseWithPatterns.patterns, ['Common pattern: use X for Y', 'Avoid Z pattern']);
    assert.deepStrictEqual(proseWithPatterns.similarFiles, ['src/similar1.ts', 'src/similar2.ts']);
  });

  it('GeneratorConfig has required fields', () => {
    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-api-key',
    };

    assert.strictEqual(config.provider, 'openrouter');
    assert.strictEqual(config.model, 'anthropic/claude-sonnet-4');
    assert.strictEqual(config.apiKey, 'test-api-key');
  });
});

describe('buildPrompt', () => {
  it('creates prompt for file node with all fields', () => {
    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 150,
        commits: 23,
        lastModified: new Date('2024-12-15T10:30:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        authors: ['alice@example.com', 'bob@example.com'],
      },
      edges: [
        { type: 'imports', target: 'src/db/users.ts' },
        { type: 'imports', target: 'src/utils/crypto.ts' },
      ],
      raw: {
        signature: ['login(email: string, password: string): Promise<Session>'],
        jsdoc: {
          login: {
            description: 'Authenticates a user with email and password',
            params: [
              { name: 'email', type: 'string', description: 'User email' },
              { name: 'password', type: 'string', description: 'User password' },
            ],
            returns: 'Promise<Session>',
          },
        },
        imports: [
          { from: './db/users', names: ['findUser'] },
          { from: './utils/crypto', names: ['hashPassword'] },
        ],
        exports: [
          { name: 'login', kind: 'function' },
          { name: 'Session', kind: 'interface' },
        ],
      },
    };

    const prompt = buildPrompt(fileNode);

    // Verify prompt contains key information
    assert.ok(prompt.includes('FILE: src/auth/login.ts'));
    assert.ok(prompt.includes('IMPORTS:'));
    assert.ok(prompt.includes('findUser'));
    assert.ok(prompt.includes('EXPORTS:'));
    assert.ok(prompt.includes('login'));
    assert.ok(prompt.includes('FUNCTIONS:'));
    assert.ok(prompt.includes('login(email: string, password: string): Promise<Session>'));
    assert.ok(prompt.includes('GIT:'));
    assert.ok(prompt.includes('23 commits'));
    assert.ok(prompt.includes('JSDOC:'));
    assert.ok(prompt.includes('Authenticates a user'));
    assert.ok(prompt.includes('"summary"'));  // JSON format instructions
    assert.ok(prompt.includes('"purpose"'));
    assert.ok(prompt.includes('"gotchas"'));
  });

  it('handles file node with minimal data', () => {
    const minimalNode: WikiNode = {
      id: 'src/simple.ts',
      type: 'file',
      path: 'src/simple.ts',
      name: 'simple.ts',
      metadata: {
        lines: 10,
        commits: 1,
        lastModified: new Date('2024-12-01'),
        authors: ['dev@example.com'],
      },
      edges: [],
      raw: {},
    };

    const prompt = buildPrompt(minimalNode);

    assert.ok(prompt.includes('FILE: src/simple.ts'));
    assert.ok(prompt.includes('IMPORTS: (none)') || prompt.includes('IMPORTS:\n'));
    assert.ok(prompt.includes('"summary"'));
  });

  it('file prompt requests patterns and similar files', () => {
    const fileNode: WikiNode = {
      id: 'src/utils.ts',
      type: 'file',
      path: 'src/utils.ts',
      name: 'utils.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['dev@example.com'],
      },
      edges: [],
      raw: {
        signature: ['formatDate(date: Date): string'],
        exports: [{ name: 'formatDate', kind: 'function' }],
      },
    };

    const prompt = buildPrompt(fileNode);

    // Verify prompt asks for patterns and similar files
    assert.ok(prompt.includes('"patterns"'));
    assert.ok(prompt.includes('"similarFiles"'));
  });
});

describe('buildPrompt for modules', () => {
  it('creates prompt for module node with child summaries', () => {
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 500,
        commits: 45,
        lastModified: new Date('2024-12-20'),
        authors: ['alice@example.com', 'bob@example.com', 'charlie@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/auth/login.ts' },
        { type: 'contains', target: 'src/auth/logout.ts' },
        { type: 'contains', target: 'src/auth/session.ts' },
      ],
      raw: {
        readme: '# Auth Module\n\nHandles user authentication and session management.',
      },
    };

    const childSummaries = new Map([
      ['src/auth/login.ts', 'Handles user authentication via OAuth providers'],
      ['src/auth/logout.ts', 'Manages session termination and cleanup'],
      ['src/auth/session.ts', 'Session token management and validation'],
    ]);

    const prompt = buildPrompt(moduleNode, childSummaries);

    // Verify prompt contains module info
    assert.ok(prompt.includes('MODULE: src/auth'));
    assert.ok(prompt.includes('FILES:'));
    assert.ok(prompt.includes('login.ts'));
    assert.ok(prompt.includes('Handles user authentication via OAuth'));
    assert.ok(prompt.includes('logout.ts'));
    assert.ok(prompt.includes('session.ts'));
    assert.ok(prompt.includes('README:'));
    assert.ok(prompt.includes('Auth Module'));
    assert.ok(prompt.includes('"summary"'));
    assert.ok(prompt.includes('"purpose"'));
    assert.ok(prompt.includes('"keyFiles"'));
    assert.ok(prompt.includes('"publicApi"'));
  });

  it('handles module node without child summaries', () => {
    const moduleNode: WikiNode = {
      id: 'src/utils',
      type: 'module',
      path: 'src/utils',
      name: 'utils',
      metadata: {
        lines: 200,
        commits: 15,
        lastModified: new Date('2024-11-01'),
        authors: ['dev@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/utils/helpers.ts' },
      ],
      raw: {},
    };

    const prompt = buildPrompt(moduleNode);

    assert.ok(prompt.includes('MODULE: src/utils'));
    assert.ok(prompt.includes('helpers.ts'));
    assert.ok(prompt.includes('(no summary yet)'));
  });

  it('module prompt requests quick start example', () => {
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 300,
        commits: 20,
        lastModified: new Date(),
        authors: ['dev@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/auth/login.ts' },
      ],
      raw: {},
    };

    const prompt = buildPrompt(moduleNode);

    // Verify prompt asks for quick start
    assert.ok(prompt.includes('"quickStart"'));
  });
});

describe('parseLLMResponse', () => {
  it('parses valid file node response', () => {
    const response = JSON.stringify({
      summary: 'Handles user authentication via OAuth',
      purpose: 'Central entry point for all authentication flows. Validates credentials and issues session tokens.',
      gotchas: ['Requires OAUTH_SECRET env var', 'Rate limited to 10 req/min'],
      keyExports: ['login: Main authentication function', 'Session: Session type'],
    });

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Handles user authentication via OAuth');
    assert.strictEqual(prose.purpose, 'Central entry point for all authentication flows. Validates credentials and issues session tokens.');
    assert.deepStrictEqual(prose.gotchas, ['Requires OAUTH_SECRET env var', 'Rate limited to 10 req/min']);
    assert.deepStrictEqual(prose.keyExports, ['login: Main authentication function', 'Session: Session type']);
    assert.ok(prose.generatedAt instanceof Date);
  });

  it('parses valid module node response', () => {
    const response = JSON.stringify({
      summary: 'Authentication and session management module',
      purpose: 'Provides secure user authentication using OAuth2. Manages session lifecycle.',
      keyFiles: ['login.ts: OAuth login flow', 'session.ts: Session management'],
      publicApi: ['login()', 'logout()', 'getSession()'],
    });

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Authentication and session management module');
    assert.deepStrictEqual(prose.keyFiles, ['login.ts: OAuth login flow', 'session.ts: Session management']);
    assert.deepStrictEqual(prose.publicApi, ['login()', 'logout()', 'getSession()']);
    assert.ok(prose.generatedAt instanceof Date);
  });

  it('handles response with markdown code block', () => {
    const response = '```json\n{"summary": "Test summary", "purpose": "Test purpose", "gotchas": []}\n```';

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Test summary');
    assert.strictEqual(prose.purpose, 'Test purpose');
  });

  it('handles response with leading text', () => {
    const response = 'Here is the documentation:\n\n{"summary": "Test summary", "purpose": "Test purpose", "gotchas": []}';

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Test summary');
  });

  it('throws error for invalid JSON', () => {
    assert.throws(
      () => parseLLMResponse('not valid json'),
      /Failed to parse LLM response/
    );
  });

  it('throws error for missing required fields', () => {
    const response = JSON.stringify({ summary: 'Only summary' });

    assert.throws(
      () => parseLLMResponse(response),
      /Missing required field: purpose/
    );
  });

  it('provides default empty gotchas if missing', () => {
    const response = JSON.stringify({
      summary: 'Summary',
      purpose: 'Purpose',
    });

    const prose = parseLLMResponse(response);

    assert.deepStrictEqual(prose.gotchas, []);
  });

  it('parses file response with patterns and similar files', () => {
    const response = JSON.stringify({
      summary: 'Utility functions for date formatting',
      purpose: 'Provides consistent date formatting across the application.',
      gotchas: ['Timezone aware - always uses UTC'],
      keyExports: ['formatDate: Main formatting function'],
      patterns: ['Use formatDate(new Date()) for current time', 'Import as: import { formatDate } from "./utils"'],
      similarFiles: ['src/utils/time.ts', 'src/utils/format.ts'],
    });

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Utility functions for date formatting');
    assert.deepStrictEqual(prose.patterns, ['Use formatDate(new Date()) for current time', 'Import as: import { formatDate } from "./utils"']);
    assert.deepStrictEqual(prose.similarFiles, ['src/utils/time.ts', 'src/utils/format.ts']);
  });

  it('parses module response with quick start', () => {
    const response = JSON.stringify({
      summary: 'Authentication module',
      purpose: 'Provides user authentication and session management.',
      keyFiles: ['login.ts: OAuth flow', 'session.ts: Session handling'],
      publicApi: ['login()', 'logout()'],
      quickStart: 'import { login } from "./auth";\nawait login(email, password);',
    });

    const prose = parseLLMResponse(response);

    assert.strictEqual(prose.summary, 'Authentication module');
    assert.strictEqual(prose.quickStart, 'import { login } from "./auth";\nawait login(email, password);');
  });
});

describe('callLLM', () => {
  it('calls OpenRouter API with correct parameters', async () => {
    const mockResponse = {
      choices: [{
        message: { content: '{"summary": "Test", "purpose": "Test purpose", "gotchas": []}' }
      }]
    };

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => mockResponse,
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-api-key',
      maxTokens: 1024,
      temperature: 0.3,
    };

    const result = await callLLM('Test prompt', config, mockFetch as unknown as typeof fetch);

    assert.strictEqual(result, '{"summary": "Test", "purpose": "Test purpose", "gotchas": []}');

    // Verify fetch was called with correct params
    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers['Authorization'], 'Bearer test-api-key');
    assert.strictEqual(options.headers['Content-Type'], 'application/json');

    const body = JSON.parse(options.body);
    assert.strictEqual(body.model, 'anthropic/claude-sonnet-4');
    assert.strictEqual(body.max_tokens, 1024);
    assert.strictEqual(body.temperature, 0.3);
    assert.strictEqual(body.messages[0].role, 'user');
    assert.strictEqual(body.messages[0].content, 'Test prompt');
  });

  it('uses default maxTokens and temperature', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary": "Test", "purpose": "Purpose", "gotchas": []}' } }]
      }),
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    await callLLM('Test', config, mockFetch as unknown as typeof fetch);

    const body = JSON.parse(mockFetch.mock.calls[0].arguments[1].body);
    assert.strictEqual(body.max_tokens, 1024);  // default
    assert.strictEqual(body.temperature, 0.3);  // default
  });

  it('throws error on API failure', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error',
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    await assert.rejects(
      callLLM('Test', config, mockFetch as unknown as typeof fetch),
      /OpenRouter API error: 500 Internal Server Error/
    );
  });

  it('throws error on rate limit (429)', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limited',
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    await assert.rejects(
      callLLM('Test', config, mockFetch as unknown as typeof fetch),
      /Rate limited/
    );
  });

  it('throws error on empty response', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [] }),
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    await assert.rejects(
      callLLM('Test', config, mockFetch as unknown as typeof fetch),
      /Empty response from OpenRouter/
    );
  });
});

describe('generateProse', () => {
  it('generates prose for file node', async () => {
    const mockLLMResponse = JSON.stringify({
      summary: 'Handles user authentication',
      purpose: 'Central authentication entry point for OAuth flows.',
      gotchas: ['Requires OAUTH_SECRET env var'],
      keyExports: ['login: Main auth function'],
    });

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockLLMResponse } }]
      }),
    }));

    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 100,
        commits: 10,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {
        signature: ['login(email: string): Promise<void>'],
        exports: [{ name: 'login', kind: 'function' }],
      },
    };

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const prose = await generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch });

    assert.strictEqual(prose.summary, 'Handles user authentication');
    assert.strictEqual(prose.purpose, 'Central authentication entry point for OAuth flows.');
    assert.deepStrictEqual(prose.gotchas, ['Requires OAUTH_SECRET env var']);
    assert.deepStrictEqual(prose.keyExports, ['login: Main auth function']);
    assert.ok(prose.generatedAt instanceof Date);

    // Verify LLM was called
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });

  it('generates prose for module node with child summaries', async () => {
    const mockLLMResponse = JSON.stringify({
      summary: 'Authentication module for OAuth and session management',
      purpose: 'Provides secure authentication using OAuth2.',
      keyFiles: ['login.ts: OAuth login', 'session.ts: Session handling'],
      publicApi: ['login()', 'logout()'],
    });

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockLLMResponse } }]
      }),
    }));

    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 300,
        commits: 25,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/auth/login.ts' },
        { type: 'contains', target: 'src/auth/session.ts' },
      ],
      raw: {},
    };

    const childSummaries = new Map([
      ['src/auth/login.ts', 'Handles OAuth login flow'],
      ['src/auth/session.ts', 'Session management'],
    ]);

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const prose = await generateProse(moduleNode, config, {
      childSummaries,
      fetchFn: mockFetch as unknown as typeof fetch
    });

    assert.strictEqual(prose.summary, 'Authentication module for OAuth and session management');
    assert.deepStrictEqual(prose.keyFiles, ['login.ts: OAuth login', 'session.ts: Session handling']);
  });

  it('propagates LLM errors', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'Internal error',
    }));

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    await assert.rejects(
      generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch }),
      /OpenRouter API error/
    );
  });
});

describe('updateNodeWithProse', () => {
  let testDataDir: string;

  afterEach(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });

  it('stores prose on existing node', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);

    // Insert a node first
    const nodes = db.collection<WikiNode>('nodes');
    const testNode: WikiNode = {
      id: 'src/test.ts',
      type: 'file',
      path: 'src/test.ts',
      name: 'test.ts',
      metadata: { lines: 50, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };
    await nodes.insertOne(testNode);

    // Generate prose data
    const prose: ProseData = {
      summary: 'Test file summary',
      purpose: 'Test purpose explanation.',
      gotchas: ['Gotcha 1'],
      generatedAt: new Date(),
    };

    // Store prose on node
    await updateNodeWithProse(db, 'src/test.ts', prose);

    // Verify node was updated
    const updated = await nodes.findOne({ id: 'src/test.ts' });
    assert.ok(updated);
    assert.strictEqual(updated.prose?.summary, 'Test file summary');
    assert.strictEqual(updated.prose?.purpose, 'Test purpose explanation.');
    assert.deepStrictEqual(updated.prose?.gotchas, ['Gotcha 1']);
  });

  it('handles node not found gracefully', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);

    const prose: ProseData = {
      summary: 'Test',
      purpose: 'Test',
      gotchas: [],
      generatedAt: new Date(),
    };

    // Should not throw, but return false or similar
    const result = await updateNodeWithProse(db, 'nonexistent.ts', prose);
    assert.strictEqual(result, false);
  });

  it('updates prose on module node', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);

    const nodes = db.collection<WikiNode>('nodes');
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: { lines: 200, commits: 20, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };
    await nodes.insertOne(moduleNode);

    const prose: ProseData = {
      summary: 'Auth module',
      purpose: 'Handles authentication.',
      gotchas: [],
      keyFiles: ['login.ts', 'session.ts'],
      publicApi: ['login()', 'logout()'],
      generatedAt: new Date(),
    };

    await updateNodeWithProse(db, 'src/auth', prose);

    const updated = await nodes.findOne({ id: 'src/auth' });
    assert.deepStrictEqual(updated?.prose?.keyFiles, ['login.ts', 'session.ts']);
  });
});

describe('fractal generation', () => {
  it('module prompt includes child summaries from previously generated prose', () => {
    // This tests that when generating module prose,
    // the child file summaries are included in the prompt

    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 300,
        commits: 25,
        lastModified: new Date(),
        authors: ['dev@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/auth/login.ts' },
        { type: 'contains', target: 'src/auth/session.ts' },
      ],
      raw: {},
    };

    // Simulate child summaries from previously generated file prose
    const childSummaries = new Map([
      ['src/auth/login.ts', 'Handles OAuth authentication flow'],
      ['src/auth/session.ts', 'Manages user sessions and tokens'],
    ]);

    const prompt = buildPrompt(moduleNode, childSummaries);

    // Verify child summaries are included in module prompt
    assert.ok(prompt.includes('login.ts: Handles OAuth authentication flow'));
    assert.ok(prompt.includes('session.ts: Manages user sessions and tokens'));
    assert.ok(prompt.includes('MODULE: src/auth'));
  });

  it('file nodes can be generated independently (no child summaries)', () => {
    const fileNode: WikiNode = {
      id: 'src/utils.ts',
      type: 'file',
      path: 'src/utils.ts',
      name: 'utils.ts',
      metadata: { lines: 50, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        signature: ['formatDate(date: Date): string'],
      },
    };

    // File nodes don't need child summaries
    const prompt = buildPrompt(fileNode);

    assert.ok(prompt.includes('FILE: src/utils.ts'));
    assert.ok(prompt.includes('formatDate'));
    // Should NOT contain module-related fields
    assert.ok(!prompt.includes('keyFiles'));
  });
});

describe('staleness detection', () => {
  it('isStale returns false when prose is newer than lastModified', () => {
    const node: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: {
        lines: 100,
        commits: 5,
        lastModified: new Date('2024-12-01T10:00:00Z'),
        authors: ['dev@example.com'],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Test summary',
        purpose: 'Test purpose',
        gotchas: [],
        generatedAt: new Date('2024-12-15T10:00:00Z'), // After lastModified
      },
    };

    assert.strictEqual(isStale(node), false);
  });

  it('isStale returns true when prose is older than lastModified', () => {
    const node: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: {
        lines: 100,
        commits: 5,
        lastModified: new Date('2024-12-20T10:00:00Z'), // After generatedAt
        authors: ['dev@example.com'],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Test summary',
        purpose: 'Test purpose',
        gotchas: [],
        generatedAt: new Date('2024-12-15T10:00:00Z'),
      },
    };

    assert.strictEqual(isStale(node), true);
  });

  it('isStale returns false when node has no prose', () => {
    const node: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: {
        lines: 100,
        commits: 5,
        lastModified: new Date('2024-12-20T10:00:00Z'),
        authors: [],
      },
      edges: [],
      raw: {},
      // No prose field
    };

    assert.strictEqual(isStale(node), false);
  });

  it('isStale handles same timestamp (not stale)', () => {
    const timestamp = new Date('2024-12-15T10:00:00Z');
    const node: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: {
        lines: 100,
        commits: 5,
        lastModified: timestamp,
        authors: [],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Test',
        purpose: 'Test',
        gotchas: [],
        generatedAt: timestamp,
      },
    };

    assert.strictEqual(isStale(node), false);
  });
});

describe('markStaleNodes', () => {
  let testDataDir: string;

  afterEach(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });

  it('marks nodes with stale prose', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);
    const nodes = db.collection<WikiNode>('nodes');

    // Insert a node with stale prose (lastModified > generatedAt)
    await nodes.insertOne({
      id: 'stale.ts',
      type: 'file',
      path: 'stale.ts',
      name: 'stale.ts',
      metadata: {
        lines: 50,
        commits: 10,
        lastModified: new Date('2024-12-20T10:00:00Z'),
        authors: [],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Old summary',
        purpose: 'Old purpose',
        gotchas: [],
        generatedAt: new Date('2024-12-15T10:00:00Z'), // Before lastModified
      },
    });

    const count = await markStaleNodes(db);

    assert.strictEqual(count, 1);

    // Verify node was marked stale
    const updated = await nodes.findOne({ id: 'stale.ts' });
    assert.strictEqual(updated?.prose?.stale, true);
  });

  it('does not mark fresh nodes as stale', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);
    const nodes = db.collection<WikiNode>('nodes');

    // Insert a node with fresh prose
    await nodes.insertOne({
      id: 'fresh.ts',
      type: 'file',
      path: 'fresh.ts',
      name: 'fresh.ts',
      metadata: {
        lines: 50,
        commits: 10,
        lastModified: new Date('2024-12-10T10:00:00Z'),
        authors: [],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Fresh summary',
        purpose: 'Fresh purpose',
        gotchas: [],
        generatedAt: new Date('2024-12-15T10:00:00Z'), // After lastModified
      },
    });

    const count = await markStaleNodes(db);

    assert.strictEqual(count, 0);

    // Verify node was NOT marked stale
    const node = await nodes.findOne({ id: 'fresh.ts' });
    assert.strictEqual(node?.prose?.stale, undefined);
  });
});

describe('generateProseForNode', () => {
  let testDataDir: string;

  afterEach(async () => {
    await closeDb();
    if (testDataDir) {
      await rm(testDataDir, { recursive: true, force: true });
    }
  });

  it('fetches node, generates prose, and caches to DB', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);
    const nodes = db.collection<WikiNode>('nodes');

    // Insert test node without prose
    const testNode: WikiNode = {
      id: 'src/test.ts',
      type: 'file',
      path: 'src/test.ts',
      name: 'test.ts',
      metadata: {
        lines: 50,
        commits: 5,
        lastModified: new Date(),
        authors: ['dev@example.com'],
      },
      edges: [],
      raw: {
        signature: ['function test(): void'],
        exports: [{ name: 'test', kind: 'function' }],
      },
    };
    await nodes.insertOne(testNode);

    // Mock LLM response
    const mockLLMResponse = JSON.stringify({
      summary: 'Test file summary',
      purpose: 'Test purpose for the file.',
      gotchas: ['Watch out for edge cases'],
      keyExports: ['test: Main test function'],
    });

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockLLMResponse } }]
      }),
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    // Call generateProseForNode
    const updatedNode = await generateProseForNode('src/test.ts', db, config, mockFetch as unknown as typeof fetch);

    // Verify the returned node has prose
    assert.ok(updatedNode);
    assert.strictEqual(updatedNode.id, 'src/test.ts');
    assert.ok(updatedNode.prose);
    assert.strictEqual(updatedNode.prose.summary, 'Test file summary');
    assert.strictEqual(updatedNode.prose.purpose, 'Test purpose for the file.');

    // Verify prose was cached to DB
    const nodeFromDb = await nodes.findOne({ id: 'src/test.ts' });
    assert.ok(nodeFromDb?.prose);
    assert.strictEqual(nodeFromDb.prose.summary, 'Test file summary');
  });

  it('returns null when node not found', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const mockFetch = mock.fn();

    const result = await generateProseForNode('nonexistent.ts', db, config, mockFetch as unknown as typeof fetch);

    assert.strictEqual(result, null);
    // LLM should not be called
    assert.strictEqual(mockFetch.mock.calls.length, 0);
  });

  it('handles module nodes with child summaries', async () => {
    testDataDir = await mkdtemp(join(tmpdir(), 'pith-test-'));
    const db = await getDb(testDataDir);
    const nodes = db.collection<WikiNode>('nodes');

    // Insert a module node
    const moduleNode: WikiNode = {
      id: 'src/auth',
      type: 'module',
      path: 'src/auth',
      name: 'auth',
      metadata: {
        lines: 200,
        commits: 20,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [
        { type: 'contains', target: 'src/auth/login.ts' },
      ],
      raw: {},
    };

    // Insert child node with prose
    const childNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 100,
        commits: 10,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {},
      prose: {
        summary: 'Handles user authentication',
        purpose: 'OAuth login flow',
        gotchas: [],
        generatedAt: new Date(),
      },
    };

    await nodes.insertOne(moduleNode);
    await nodes.insertOne(childNode);

    // Mock LLM response
    const mockLLMResponse = JSON.stringify({
      summary: 'Authentication module',
      purpose: 'Manages user login and sessions.',
      keyFiles: ['login.ts: Handles OAuth'],
      publicApi: ['login()', 'logout()'],
    });

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockLLMResponse } }]
      }),
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const updatedNode = await generateProseForNode('src/auth', db, config, mockFetch as unknown as typeof fetch);

    // Verify module prose was generated
    assert.ok(updatedNode?.prose);
    assert.strictEqual(updatedNode.prose.summary, 'Authentication module');
    assert.deepStrictEqual(updatedNode.prose.keyFiles, ['login.ts: Handles OAuth']);
  });
});

describe('LLM retry logic', () => {
  it('retries on 429 rate limit error', async () => {
    let attemptCount = 0;
    const mockFetch = mock.fn(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limited',
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary": "Test", "purpose": "Test purpose", "gotchas": []}' } }]
        }),
      };
    });

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const prose = await generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch });

    // Should succeed after retries
    assert.strictEqual(prose.summary, 'Test');
    assert.strictEqual(attemptCount, 3);
  });

  it('retries on 500 server error', async () => {
    let attemptCount = 0;
    const mockFetch = mock.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error',
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary": "Test", "purpose": "Test purpose", "gotchas": []}' } }]
        }),
      };
    });

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const prose = await generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch });

    assert.strictEqual(prose.summary, 'Test');
    assert.strictEqual(attemptCount, 2);
  });

  it('fails after max retry attempts', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limited',
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    await assert.rejects(
      generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch }),
      /Rate limited/
    );

    // Should have tried 3 times (1 initial + 2 retries)
    assert.strictEqual(mockFetch.mock.calls.length, 3);
  });

  it('does not retry on 400 client error', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Invalid request',
    }));

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    await assert.rejects(
      generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch }),
      /OpenRouter API error/
    );

    // Should only try once (no retries for 4xx errors except 429)
    assert.strictEqual(mockFetch.mock.calls.length, 1);
  });

  it('handles timeout errors with retry', async () => {
    let attemptCount = 0;
    const mockFetch = mock.fn(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('Request timeout');
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary": "Test", "purpose": "Test purpose", "gotchas": []}' } }]
        }),
      };
    });

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const fileNode: WikiNode = {
      id: 'test.ts',
      type: 'file',
      path: 'test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const prose = await generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch });

    assert.strictEqual(prose.summary, 'Test');
    assert.strictEqual(attemptCount, 2);
  });
});

describe('extractIdentifiers', () => {
  it('extracts camelCase identifiers', () => {
    const text = 'The loginUser function requires validation';
    const identifiers = extractIdentifiers(text);

    assert.ok(identifiers.includes('loginUser'));
  });

  it('extracts PascalCase identifiers', () => {
    const text = 'Watch out for SessionManager conflicts';
    const identifiers = extractIdentifiers(text);

    assert.ok(identifiers.includes('SessionManager'));
  });

  it('extracts snake_case identifiers', () => {
    const text = 'The hash_password function is deprecated';
    const identifiers = extractIdentifiers(text);

    assert.ok(identifiers.includes('hash_password'));
  });

  it('extracts multiple identifiers from same text', () => {
    const text = 'loginUser calls hashPassword and SessionManager';
    const identifiers = extractIdentifiers(text);

    assert.ok(identifiers.includes('loginUser'));
    assert.ok(identifiers.includes('hashPassword'));
    assert.ok(identifiers.includes('SessionManager'));
  });

  it('does not extract common words', () => {
    const text = 'This function requires the user to login';
    const identifiers = extractIdentifiers(text);

    // Should not extract simple words like 'function', 'user', 'login'
    assert.ok(!identifiers.includes('function'));
    assert.ok(!identifiers.includes('requires'));
  });

  it('handles empty text', () => {
    const identifiers = extractIdentifiers('');

    assert.deepStrictEqual(identifiers, []);
  });
});

describe('validateGotcha', () => {
  it('returns high confidence when all identifiers exist in exports', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        exports: [
          { name: 'login', kind: 'function' },
          { name: 'logout', kind: 'function' },
        ],
      },
    };

    const gotcha = 'The login function requires OAUTH_SECRET env var';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'high');
    assert.ok(result.verifiedNames.includes('login'));
  });

  it('returns high confidence when identifiers exist in signature', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        signature: ['hashPassword(password: string): string'],
      },
    };

    const gotcha = 'hashPassword is CPU intensive';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'high');
    assert.ok(result.verifiedNames.includes('hashPassword'));
  });

  it('returns medium confidence when some identifiers exist', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        exports: [{ name: 'login', kind: 'function' }],
      },
    };

    const gotcha = 'login calls nonexistentFunction for validation';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'medium');
    assert.ok(result.verifiedNames.includes('login'));
    assert.ok(!result.verifiedNames.includes('nonexistentFunction'));
  });

  it('returns low confidence when no identifiers can be verified', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        exports: [{ name: 'login', kind: 'function' }],
      },
    };

    const gotcha = 'The fakeFunction calls anotherFake which is problematic';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'low');
    assert.strictEqual(result.verifiedNames.length, 0);
  });

  it('returns low confidence when no identifiers found in text', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const gotcha = 'This file requires environment variables';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'low');
    assert.strictEqual(result.verifiedNames.length, 0);
  });

  it('checks against import names', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        imports: [
          { from: './db', names: ['findUser', 'createUser'] },
        ],
      },
    };

    const gotcha = 'findUser may return null';
    const result = validateGotcha(gotcha, node);

    assert.strictEqual(result.confidence, 'high');
    assert.ok(result.verifiedNames.includes('findUser'));
  });
});

describe('validateGotchas', () => {
  it('validates multiple gotchas', () => {
    const node: WikiNode = {
      id: 'src/auth.ts',
      type: 'file',
      path: 'src/auth.ts',
      name: 'auth.ts',
      metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {
        exports: [
          { name: 'login', kind: 'function' },
          { name: 'logout', kind: 'function' },
        ],
        signature: ['hashPassword(password: string): string'],
      },
    };

    const gotchas = [
      'login requires OAUTH_SECRET env var',
      'hashPassword is CPU intensive',
      'fakeFunction does not exist',
    ];

    const results = validateGotchas(gotchas, node);

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].text, 'login requires OAUTH_SECRET env var');
    assert.strictEqual(results[0].confidence, 'high');
    assert.strictEqual(results[1].text, 'hashPassword is CPU intensive');
    assert.strictEqual(results[1].confidence, 'high');
    assert.strictEqual(results[2].text, 'fakeFunction does not exist');
    assert.strictEqual(results[2].confidence, 'low');
  });

  it('handles empty gotchas array', () => {
    const node: WikiNode = {
      id: 'src/test.ts',
      type: 'file',
      path: 'src/test.ts',
      name: 'test.ts',
      metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
      edges: [],
      raw: {},
    };

    const results = validateGotchas([], node);

    assert.deepStrictEqual(results, []);
  });
});

describe('ProseData with validated gotchas', () => {
  it('ProseData supports gotchaConfidence field', () => {
    const prose: ProseData = {
      summary: 'Test summary',
      purpose: 'Test purpose',
      gotchas: ['login requires env var', 'fakeFunc is problematic'],
      gotchaConfidence: ['high', 'low'],
      generatedAt: new Date(),
    };

    assert.deepStrictEqual(prose.gotchaConfidence, ['high', 'low']);
  });
});

describe('generateProse with gotcha validation', () => {
  it('validates gotchas and adds confidence to ProseData', async () => {
    const mockLLMResponse = JSON.stringify({
      summary: 'Handles user authentication',
      purpose: 'Central authentication entry point.',
      gotchas: [
        'login requires OAUTH_SECRET env var',
        'fakeFunction does not exist'
      ],
      keyExports: ['login: Main auth function'],
    });

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockLLMResponse } }]
      }),
    }));

    const fileNode: WikiNode = {
      id: 'src/auth/login.ts',
      type: 'file',
      path: 'src/auth/login.ts',
      name: 'login.ts',
      metadata: {
        lines: 100,
        commits: 10,
        lastModified: new Date(),
        authors: ['alice@example.com'],
      },
      edges: [],
      raw: {
        signature: ['login(email: string): Promise<void>'],
        exports: [{ name: 'login', kind: 'function' }],
      },
    };

    const config: GeneratorConfig = {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      apiKey: 'test-key',
    };

    const prose = await generateProse(fileNode, config, { fetchFn: mockFetch as unknown as typeof fetch });

    assert.strictEqual(prose.summary, 'Handles user authentication');
    assert.deepStrictEqual(prose.gotchas, [
      'login requires OAUTH_SECRET env var',
      'fakeFunction does not exist'
    ]);

    // Verify confidence was added
    assert.ok(prose.gotchaConfidence);
    assert.strictEqual(prose.gotchaConfidence.length, 2);
    assert.strictEqual(prose.gotchaConfidence[0], 'high'); // login exists
    assert.strictEqual(prose.gotchaConfidence[1], 'low');  // fakeFunction doesn't exist
  });
});
