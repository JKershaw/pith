import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveImportedSymbol,
  followReExportChain,
  buildCrossFileCallGraph,
} from './cross-file-calls.ts';
import type { WikiNode } from './index.ts';
import type { Import } from '../extractor/ast.ts';

describe('resolveImportedSymbol', () => {
  // Step 6.6.7b.1: Test import resolution for named imports
  it('resolves named import to source file', () => {
    const importStmt: Import = {
      from: './utils.ts',
      names: ['formatUserName'],
      isTypeOnly: false,
    };

    const allNodes: WikiNode[] = [
      {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: { lines: 20, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [
            { name: 'formatUserName', kind: 'function', isReExport: false },
            { name: 'validateEmail', kind: 'function', isReExport: false },
          ],
        },
      },
    ];

    const result = resolveImportedSymbol('formatUserName', importStmt, 'src/service.ts', allNodes);

    assert.ok(result);
    assert.strictEqual(result.sourceFile, 'src/utils.ts');
    assert.strictEqual(result.symbolName, 'formatUserName');
  });

  // Step 6.6.7b.1: Test import resolution for default imports
  it('resolves default import to source file', () => {
    const importStmt: Import = {
      from: './UserService.ts',
      names: [],
      defaultName: 'UserService',
      isTypeOnly: false,
    };

    const allNodes: WikiNode[] = [
      {
        id: 'src/UserService.ts',
        type: 'file',
        path: 'src/UserService.ts',
        name: 'UserService.ts',
        metadata: { lines: 50, commits: 10, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'default', kind: 'class', isReExport: false }],
        },
      },
    ];

    const result = resolveImportedSymbol('UserService', importStmt, 'src/service.ts', allNodes);

    assert.ok(result);
    assert.strictEqual(result.sourceFile, 'src/UserService.ts');
    assert.strictEqual(result.symbolName, 'default');
  });

  // Step 6.6.7b.1: Test that type-only imports are skipped
  it('returns null for type-only imports', () => {
    const importStmt: Import = {
      from: './types.ts',
      names: ['User'],
      isTypeOnly: true,
    };

    const allNodes: WikiNode[] = [
      {
        id: 'src/types.ts',
        type: 'file',
        path: 'src/types.ts',
        name: 'types.ts',
        metadata: { lines: 20, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'User', kind: 'interface', isReExport: false }],
        },
      },
    ];

    const result = resolveImportedSymbol('User', importStmt, 'src/service.ts', allNodes);

    assert.strictEqual(result, null);
  });

  // Step 6.6.7b.1: Test that node_modules imports are skipped
  it('returns null for node_modules imports', () => {
    const importStmt: Import = {
      from: 'express',
      names: ['Router'],
      isTypeOnly: false,
    };

    const allNodes: WikiNode[] = [];

    const result = resolveImportedSymbol('Router', importStmt, 'src/service.ts', allNodes);

    assert.strictEqual(result, null);
  });
});

describe('followReExportChain', () => {
  // Step 6.6.7b.2: Test following a single re-export
  it('follows re-export to original source', () => {
    const allNodes: WikiNode[] = [
      // index.ts re-exports from auth.ts
      {
        id: 'src/index.ts',
        type: 'file',
        path: 'src/index.ts',
        name: 'index.ts',
        metadata: { lines: 10, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'createSession', kind: 'function', isReExport: true }],
          imports: [{ from: './auth.ts', names: ['createSession'], isTypeOnly: false }],
        },
      },
      // auth.ts is the original source
      {
        id: 'src/auth.ts',
        type: 'file',
        path: 'src/auth.ts',
        name: 'auth.ts',
        metadata: { lines: 40, commits: 8, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'createSession', kind: 'function', isReExport: false }],
        },
      },
    ];

    const result = followReExportChain('createSession', 'src/index.ts', allNodes);

    assert.ok(result);
    assert.strictEqual(result.sourceFile, 'src/auth.ts');
    assert.strictEqual(result.symbolName, 'createSession');
  });

  // Step 6.6.7b.2: Test following a chain of re-exports
  it('follows chain of re-exports to original source', () => {
    const allNodes: WikiNode[] = [
      // index.ts → barrel.ts → utils.ts
      {
        id: 'src/index.ts',
        type: 'file',
        path: 'src/index.ts',
        name: 'index.ts',
        metadata: { lines: 5, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'helper', kind: 'function', isReExport: true }],
          imports: [{ from: './barrel.ts', names: ['helper'], isTypeOnly: false }],
        },
      },
      {
        id: 'src/barrel.ts',
        type: 'file',
        path: 'src/barrel.ts',
        name: 'barrel.ts',
        metadata: { lines: 5, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'helper', kind: 'function', isReExport: true }],
          imports: [{ from: './utils.ts', names: ['helper'], isTypeOnly: false }],
        },
      },
      {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: { lines: 20, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'helper', kind: 'function', isReExport: false }],
        },
      },
    ];

    const result = followReExportChain('helper', 'src/index.ts', allNodes);

    assert.ok(result);
    assert.strictEqual(result.sourceFile, 'src/utils.ts');
    assert.strictEqual(result.symbolName, 'helper');
  });

  // Step 6.6.7b.2: Test depth limit prevents infinite loops
  it('stops at max depth to prevent infinite loops', () => {
    // Create a circular re-export (pathological case)
    const allNodes: WikiNode[] = [
      {
        id: 'src/a.ts',
        type: 'file',
        path: 'src/a.ts',
        name: 'a.ts',
        metadata: { lines: 5, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'func', kind: 'function', isReExport: true }],
          imports: [{ from: './b.ts', names: ['func'], isTypeOnly: false }],
        },
      },
      {
        id: 'src/b.ts',
        type: 'file',
        path: 'src/b.ts',
        name: 'b.ts',
        metadata: { lines: 5, commits: 1, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'func', kind: 'function', isReExport: true }],
          imports: [{ from: './a.ts', names: ['func'], isTypeOnly: false }],
        },
      },
    ];

    // Should return null when max depth is reached
    const result = followReExportChain('func', 'src/a.ts', allNodes, 5);

    assert.strictEqual(result, null);
  });
});

describe('buildCrossFileCallGraph', () => {
  // Step 6.6.7b.3: Test building cross-file call graph
  it('builds cross-file call graph from function calls and imports', () => {
    const fileNodes: WikiNode[] = [
      // service.ts imports and calls functions from utils.ts
      {
        id: 'src/service.ts',
        type: 'file',
        path: 'src/service.ts',
        name: 'service.ts',
        metadata: { lines: 50, commits: 5, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          imports: [
            { from: './utils.ts', names: ['formatUserName', 'validateEmail'], isTypeOnly: false },
          ],
          functions: [
            {
              name: 'registerUser',
              signature: 'function registerUser(...): User',
              startLine: 10,
              endLine: 25,
              isAsync: false,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: ['formatUserName', 'validateEmail'], // Calls to imported functions
              calledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
      // utils.ts exports the called functions
      {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: { lines: 30, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [
            { name: 'formatUserName', kind: 'function', isReExport: false },
            { name: 'validateEmail', kind: 'function', isReExport: false },
          ],
          functions: [
            {
              name: 'formatUserName',
              signature: 'function formatUserName(...): string',
              startLine: 5,
              endLine: 7,
              isAsync: false,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              errorPaths: [],
            },
            {
              name: 'validateEmail',
              signature: 'function validateEmail(...): boolean',
              startLine: 9,
              endLine: 11,
              isAsync: false,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
    ];

    const result = buildCrossFileCallGraph(fileNodes);

    // Should have cross-file calls from service.registerUser
    assert.ok(result['src/service.ts:registerUser']);
    const calls = result['src/service.ts:registerUser'];
    assert.strictEqual(calls.length, 2);

    // Check that it found both cross-file calls
    const callTargets = calls.map(c => c.callee).sort();
    assert.deepStrictEqual(callTargets, [
      'src/utils.ts:formatUserName',
      'src/utils.ts:validateEmail',
    ]);
  });

  // Step 6.6.7b.3: Test that intra-file calls are excluded
  it('excludes intra-file calls from cross-file graph', () => {
    const fileNodes: WikiNode[] = [
      {
        id: 'src/utils.ts',
        type: 'file',
        path: 'src/utils.ts',
        name: 'utils.ts',
        metadata: { lines: 30, commits: 3, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          functions: [
            {
              name: 'publicFunc',
              signature: 'function publicFunc(): void',
              startLine: 5,
              endLine: 10,
              isAsync: false,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: ['helperFunc'], // Intra-file call
              calledBy: [],
              errorPaths: [],
            },
            {
              name: 'helperFunc',
              signature: 'function helperFunc(): void',
              startLine: 12,
              endLine: 14,
              isAsync: false,
              isExported: false,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
    ];

    const result = buildCrossFileCallGraph(fileNodes);

    // publicFunc should have no cross-file calls (helperFunc is in same file)
    const calls = result['src/utils.ts:publicFunc'] || [];
    assert.strictEqual(calls.length, 0);
  });

  // Step 6.6.7b.3: Test handling re-exports
  it('resolves calls through re-export chains', () => {
    const fileNodes: WikiNode[] = [
      // controller.ts imports from index.ts (which re-exports from auth.ts)
      {
        id: 'src/controller.ts',
        type: 'file',
        path: 'src/controller.ts',
        name: 'controller.ts',
        metadata: { lines: 40, commits: 4, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          imports: [{ from: './index.ts', names: ['createSession'], isTypeOnly: false }],
          functions: [
            {
              name: 'handleLogin',
              signature: 'function handleLogin(): Promise<Session>',
              startLine: 10,
              endLine: 20,
              isAsync: true,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: ['createSession'],
              calledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
      // index.ts re-exports from auth.ts
      {
        id: 'src/index.ts',
        type: 'file',
        path: 'src/index.ts',
        name: 'index.ts',
        metadata: { lines: 10, commits: 2, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'createSession', kind: 'function', isReExport: true }],
          imports: [{ from: './auth.ts', names: ['createSession'], isTypeOnly: false }],
        },
      },
      // auth.ts is the original source
      {
        id: 'src/auth.ts',
        type: 'file',
        path: 'src/auth.ts',
        name: 'auth.ts',
        metadata: { lines: 40, commits: 8, lastModified: new Date(), authors: [] },
        edges: [],
        raw: {
          exports: [{ name: 'createSession', kind: 'function', isReExport: false }],
          functions: [
            {
              name: 'createSession',
              signature: 'async function createSession(...): Promise<Session>',
              startLine: 9,
              endLine: 19,
              isAsync: true,
              isExported: true,
              codeSnippet: '',
              keyStatements: [],
              calls: [],
              calledBy: [],
              errorPaths: [],
            },
          ],
        },
      },
    ];

    const result = buildCrossFileCallGraph(fileNodes);

    // Should resolve through index.ts to auth.ts
    const calls = result['src/controller.ts:handleLogin'];
    assert.ok(calls);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].callee, 'src/auth.ts:createSession');
  });
});
