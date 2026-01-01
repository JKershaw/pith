import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildKeywordIndex, type KeywordIndex } from './index.ts';
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
});
