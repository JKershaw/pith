import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildKeywordIndex, tokenizeQuery, type KeywordIndex } from './index.ts';
import type { WikiNode } from '../builder/index.ts';

describe('buildKeywordIndex', () => {
  it('indexes exports from file nodes', () => {
    const nodes: WikiNode[] = [
      {
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
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byExport.get('login'), ['src/auth.ts']);
    assert.deepStrictEqual(index.byExport.get('logout'), ['src/auth.ts']);
  });

  it('indexes detected patterns', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/api.ts',
        type: 'file',
        path: 'src/api.ts',
        name: 'api.ts',
        metadata: { lines: 200, commits: 10, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          patterns: [
            { name: 'retry', confidence: 'high', evidence: [], location: 'src/api.ts:fetchData' },
            { name: 'cache', confidence: 'medium', evidence: [], location: 'src/api.ts' },
          ],
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byPattern.get('retry'), ['src/api.ts']);
    assert.deepStrictEqual(index.byPattern.get('cache'), ['src/api.ts']);
  });

  it('indexes key statements by extracting keywords', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/config.ts',
        type: 'file',
        path: 'src/config.ts',
        name: 'config.ts',
        metadata: { lines: 50, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          functions: [
            {
              name: 'configure',
              signature: 'function configure(): void',
              startLine: 1,
              endLine: 20,
              isAsync: false,
              isExported: true,
              isDefaultExport: false,
              codeSnippet: '',
              keyStatements: [
                { line: 5, text: 'timeout = 30000', category: 'config' as const },
                { line: 10, text: 'maxRetries = 3', category: 'config' as const },
              ],
              calls: [],
              calledBy: [],
              crossFileCalls: [],
              crossFileCalledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byKeyStatement.get('timeout'), ['src/config.ts']);
    assert.deepStrictEqual(index.byKeyStatement.get('maxretries'), ['src/config.ts']);
  });

  it('indexes error types including HTTP status codes', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/api.ts',
        type: 'file',
        path: 'src/api.ts',
        name: 'api.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          functions: [
            {
              name: 'handleRequest',
              signature: 'function handleRequest(): void',
              startLine: 1,
              endLine: 50,
              isAsync: false,
              isExported: true,
              isDefaultExport: false,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              crossFileCalls: [],
              crossFileCalledBy: [],
              errorPaths: [
                { type: 'throw', line: 10, action: 'throw 404', httpStatus: 404 },
                { type: 'throw', line: 20, action: 'throw 500', httpStatus: 500 },
              ],
            },
          ],
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byErrorType.get('404'), ['src/api.ts']);
    assert.deepStrictEqual(index.byErrorType.get('500'), ['src/api.ts']);
  });

  it('indexes module names', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/auth/',
        type: 'module',
        path: 'src/auth/',
        name: 'auth',
        metadata: { lines: 0, commits: 0, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
      {
        id: 'src/generator/',
        type: 'module',
        path: 'src/generator/',
        name: 'generator',
        metadata: { lines: 0, commits: 0, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byModule.get('auth'), ['src/auth/']);
    assert.deepStrictEqual(index.byModule.get('generator'), ['src/generator/']);
  });

  it('handles multiple files with same export name', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/auth/login.ts',
        type: 'file',
        path: 'src/auth/login.ts',
        name: 'login.ts',
        metadata: { lines: 50, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'validate', kind: 'function' }],
        },
      },
      {
        id: 'src/utils/validate.ts',
        type: 'file',
        path: 'src/utils/validate.ts',
        name: 'validate.ts',
        metadata: { lines: 30, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'validate', kind: 'function' }],
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    const validateFiles = index.byExport.get('validate');
    assert.ok(validateFiles);
    assert.strictEqual(validateFiles.length, 2);
    assert.ok(validateFiles.includes('src/auth/login.ts'));
    assert.ok(validateFiles.includes('src/utils/validate.ts'));
  });

  it('indexes function names as exports', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/api.ts',
        type: 'file',
        path: 'src/api.ts',
        name: 'api.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          functions: [
            {
              name: 'fetchData',
              signature: 'function fetchData(): Promise<void>',
              startLine: 1,
              endLine: 20,
              isAsync: true,
              isExported: true,
              isDefaultExport: false,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              crossFileCalls: [],
              crossFileCalledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.deepStrictEqual(index.byExport.get('fetchdata'), ['src/api.ts']);
  });

  it('returns empty index for empty nodes array', () => {
    const index = buildKeywordIndex([]);

    assert.strictEqual(index.byExport.size, 0);
    assert.strictEqual(index.byPattern.size, 0);
    assert.strictEqual(index.byKeyStatement.size, 0);
    assert.strictEqual(index.byErrorType.size, 0);
    assert.strictEqual(index.byModule.size, 0);
  });

  it('skips function nodes (only indexes file and module nodes)', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/api.ts:fetchData',
        type: 'function',
        path: 'src/api.ts',
        name: 'fetchData',
        metadata: { lines: 20, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
      },
    ];

    const index = buildKeywordIndex(nodes);

    // Should not index function nodes directly
    assert.strictEqual(index.byExport.size, 0);
  });

  // Phase 7.0.2: Summary word indexing
  it('indexes summary words from prose when available', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/generator/index.ts',
        type: 'file',
        path: 'src/generator/index.ts',
        name: 'index.ts',
        metadata: { lines: 500, commits: 20, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
        prose: {
          summary: 'LLM prose generation with retry logic and caching',
          purpose: 'Generates documentation from code',
          gotchas: [],
          generatedAt: new Date(),
          stale: false,
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    // Should index significant words from summary
    assert.deepStrictEqual(index.bySummaryWord.get('llm'), ['src/generator/index.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('prose'), ['src/generator/index.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('generation'), ['src/generator/index.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('retry'), ['src/generator/index.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('caching'), ['src/generator/index.ts']);
  });

  it('filters out common stopwords from summary', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
        prose: {
          summary: 'A utility module that provides helper functions for the application',
          purpose: 'Utilities',
          gotchas: [],
          generatedAt: new Date(),
          stale: false,
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    // Should filter stopwords like "a", "the", "that", "for"
    assert.strictEqual(index.bySummaryWord.get('a'), undefined);
    assert.strictEqual(index.bySummaryWord.get('the'), undefined);
    assert.strictEqual(index.bySummaryWord.get('that'), undefined);
    assert.strictEqual(index.bySummaryWord.get('for'), undefined);

    // Should include meaningful words
    assert.deepStrictEqual(index.bySummaryWord.get('utility'), ['src/utils.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('module'), ['src/utils.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('helper'), ['src/utils.ts']);
    assert.deepStrictEqual(index.bySummaryWord.get('functions'), ['src/utils.ts']);
  });

  it('does not index summary words when prose is missing', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/auth.ts',
        type: 'file',
        path: 'src/auth.ts',
        name: 'auth.ts',
        metadata: { lines: 100, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
        // No prose field
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.strictEqual(index.bySummaryWord.size, 0);
  });

  it('handles empty summary gracefully', () => {
    const nodes: WikiNode[] = [
      {
        id: 'src/empty.ts',
        type: 'file',
        path: 'src/empty.ts',
        name: 'empty.ts',
        metadata: { lines: 10, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {},
        prose: {
          summary: '',
          purpose: '',
          gotchas: [],
          generatedAt: new Date(),
          stale: false,
        },
      },
    ];

    const index = buildKeywordIndex(nodes);

    assert.strictEqual(index.bySummaryWord.size, 0);
  });
});

// Phase 7.0.3: Query tokenizer
describe('tokenizeQuery', () => {
  it('extracts meaningful words from query', () => {
    const tokens = tokenizeQuery('How does retry work?');
    assert.deepStrictEqual(tokens, ['retry', 'work']);
  });

  it('filters out stopwords', () => {
    const tokens = tokenizeQuery('What is the authentication system?');
    assert.deepStrictEqual(tokens, ['authentication', 'system']);
  });

  it('handles camelCase by splitting', () => {
    const tokens = tokenizeQuery('extractFile function');
    assert.ok(tokens.includes('extract'));
    assert.ok(tokens.includes('file'));
    assert.ok(tokens.includes('function'));
  });

  it('returns empty array for empty query', () => {
    const tokens = tokenizeQuery('');
    assert.deepStrictEqual(tokens, []);
  });

  it('returns empty array for query with only stopwords', () => {
    const tokens = tokenizeQuery('the and or for');
    assert.deepStrictEqual(tokens, []);
  });

  it('handles technical terms', () => {
    const tokens = tokenizeQuery('LLM API rate limiting');
    assert.ok(tokens.includes('llm'));
    assert.ok(tokens.includes('api'));
    assert.ok(tokens.includes('rate'));
    assert.ok(tokens.includes('limiting'));
  });

  it('deduplicates tokens', () => {
    const tokens = tokenizeQuery('retry retry retry logic');
    assert.deepStrictEqual(tokens, ['retry', 'logic']);
  });

  it('normalizes to lowercase', () => {
    const tokens = tokenizeQuery('API ENDPOINT');
    assert.deepStrictEqual(tokens, ['api', 'endpoint']);
  });
});
