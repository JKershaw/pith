/**
 * Tests for Navigator module (Phase 7.3.4-7.3.6)
 * Overview-Based Navigation: LLM reasons over project overview to select files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  type NavigationTarget,
  type NavigationResponse,
  type FileTarget,
  type GrepTarget,
  type FunctionTarget,
  type ImportersTarget,
  type ResolvedTarget,
  type GrepResult,
  type ResolvedContext,
  buildNavigatorPrompt,
  parseNavigatorResponse,
  formatOverviewForPrompt,
  resolveFileTarget,
  resolveFunctionTarget,
  resolveImportersTarget,
  executeGrepTarget,
  resolveAllTargets,
  buildNavigatorSynthesisPrompt,
} from './navigator.ts';
import type { WikiNode } from '../builder/index.ts';
import { type ProjectOverview } from './overview.ts';

// Helper to create test overview
function createTestOverview(overrides: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    readme: '# Test Project\nA sample project for testing.',
    fileTree: 'src/\n  index.ts\n  utils.ts',
    modules: [{ path: 'src/', summary: 'Main source code', keyExports: ['main', 'config'] }],
    entryPoints: [{ path: 'src/cli/index.ts', description: 'CLI entry point' }],
    relationships: [{ from: 'src/cli/index.ts', imports: ['extractFile', 'buildNodes'] }],
    ...overrides,
  };
}

describe('NavigationTarget types', () => {
  it('FileTarget has type and path', () => {
    const target: FileTarget = { type: 'file', path: 'src/utils.ts' };
    assert.strictEqual(target.type, 'file');
    assert.strictEqual(target.path, 'src/utils.ts');
  });

  it('GrepTarget has type, pattern, and optional scope', () => {
    const target: GrepTarget = { type: 'grep', pattern: 'TODO', scope: 'src/' };
    assert.strictEqual(target.type, 'grep');
    assert.strictEqual(target.pattern, 'TODO');
    assert.strictEqual(target.scope, 'src/');
  });

  it('FunctionTarget has type, name, and in', () => {
    const target: FunctionTarget = {
      type: 'function',
      name: 'extractFile',
      in: 'src/extractor/ast.ts',
    };
    assert.strictEqual(target.type, 'function');
    assert.strictEqual(target.name, 'extractFile');
    assert.strictEqual(target.in, 'src/extractor/ast.ts');
  });

  it('ImportersTarget has type and of', () => {
    const target: ImportersTarget = { type: 'importers', of: 'WikiNode' };
    assert.strictEqual(target.type, 'importers');
    assert.strictEqual(target.of, 'WikiNode');
  });

  it('NavigationResponse has reasoning and targets', () => {
    const response: NavigationResponse = {
      reasoning: 'Based on the query about retry logic...',
      targets: [
        { type: 'file', path: 'src/generator/index.ts' },
        { type: 'grep', pattern: 'retry|maxRetries' },
      ],
    };
    assert.strictEqual(response.reasoning.includes('retry'), true);
    assert.strictEqual(response.targets.length, 2);
  });
});

describe('formatOverviewForPrompt', () => {
  it('includes README content', () => {
    const overview = createTestOverview({ readme: '# My Project\nDescription here.' });
    const formatted = formatOverviewForPrompt(overview);
    assert.ok(formatted.includes('My Project'));
  });

  it('includes file tree', () => {
    const overview = createTestOverview({ fileTree: 'src/\n  api/\n    index.ts' });
    const formatted = formatOverviewForPrompt(overview);
    assert.ok(formatted.includes('src/'));
    assert.ok(formatted.includes('api/'));
  });

  it('includes module summaries', () => {
    const overview = createTestOverview({
      modules: [
        {
          path: 'src/extractor/',
          summary: 'Extracts facts from TypeScript',
          keyExports: ['extractFile'],
        },
      ],
    });
    const formatted = formatOverviewForPrompt(overview);
    assert.ok(formatted.includes('extractor'));
    assert.ok(formatted.includes('Extracts facts'));
  });

  it('includes entry points', () => {
    const overview = createTestOverview({
      entryPoints: [{ path: 'src/cli/index.ts', description: 'CLI entry' }],
    });
    const formatted = formatOverviewForPrompt(overview);
    assert.ok(formatted.includes('cli/index.ts'));
    assert.ok(formatted.includes('Entry'));
  });

  it('includes relationships', () => {
    const overview = createTestOverview({
      relationships: [{ from: 'src/cli/index.ts', imports: ['extractFile', 'buildNodes'] }],
    });
    const formatted = formatOverviewForPrompt(overview);
    assert.ok(formatted.includes('extractFile'));
    assert.ok(formatted.includes('buildNodes'));
  });
});

describe('buildNavigatorPrompt', () => {
  it('includes the user query', () => {
    const overview = createTestOverview();
    const prompt = buildNavigatorPrompt('What is the retry logic?', overview);
    assert.ok(prompt.includes('What is the retry logic?'));
  });

  it('includes the project overview', () => {
    const overview = createTestOverview({ readme: '# Unique Project Name' });
    const prompt = buildNavigatorPrompt('test query', overview);
    assert.ok(prompt.includes('Unique Project Name'));
  });

  it('specifies output format with target types', () => {
    const overview = createTestOverview();
    const prompt = buildNavigatorPrompt('test', overview);
    // Should mention the target types
    assert.ok(prompt.includes('file'));
    assert.ok(prompt.includes('grep'));
    assert.ok(prompt.includes('function'));
    assert.ok(prompt.includes('importers'));
  });

  it('requests JSON output', () => {
    const overview = createTestOverview();
    const prompt = buildNavigatorPrompt('test', overview);
    assert.ok(prompt.includes('JSON'));
  });
});

describe('parseNavigatorResponse', () => {
  it('parses valid JSON response with file targets', () => {
    const rawResponse = `
    Based on my analysis, here are the relevant files:
    \`\`\`json
    {
      "reasoning": "The user asks about retry logic",
      "targets": [
        { "type": "file", "path": "src/generator/index.ts" }
      ]
    }
    \`\`\`
    `;
    const result = parseNavigatorResponse(rawResponse);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.reasoning, 'The user asks about retry logic');
    assert.strictEqual(result.targets?.length, 1);
    assert.strictEqual((result.targets?.[0] as FileTarget).path, 'src/generator/index.ts');
  });

  it('parses response with multiple target types', () => {
    const rawResponse = `\`\`\`json
    {
      "reasoning": "Need to check patterns and find importers",
      "targets": [
        { "type": "file", "path": "src/config.ts" },
        { "type": "grep", "pattern": "retry.*logic", "scope": "src/generator/" },
        { "type": "function", "name": "callLLM", "in": "src/generator/index.ts" },
        { "type": "importers", "of": "WikiNode" }
      ]
    }
    \`\`\``;
    const result = parseNavigatorResponse(rawResponse);
    assert.strictEqual(result.targets?.length, 4);
    assert.strictEqual(result.targets?.[0].type, 'file');
    assert.strictEqual(result.targets?.[1].type, 'grep');
    assert.strictEqual(result.targets?.[2].type, 'function');
    assert.strictEqual(result.targets?.[3].type, 'importers');
  });

  it('handles JSON without code fence', () => {
    const rawResponse = `{
      "reasoning": "Direct JSON",
      "targets": [{ "type": "file", "path": "src/index.ts" }]
    }`;
    const result = parseNavigatorResponse(rawResponse);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.targets?.length, 1);
  });

  it('returns error for invalid JSON', () => {
    const rawResponse = 'This is not JSON at all';
    const result = parseNavigatorResponse(rawResponse);
    assert.ok(result.error);
    assert.ok(result.error.includes('parse') || result.error.includes('JSON'));
  });

  it('returns error for missing targets', () => {
    const rawResponse = '{ "reasoning": "No targets here" }';
    const result = parseNavigatorResponse(rawResponse);
    assert.ok(result.error);
  });

  it('returns error for invalid target type', () => {
    const rawResponse = `{
      "reasoning": "Invalid target",
      "targets": [{ "type": "unknown", "foo": "bar" }]
    }`;
    const result = parseNavigatorResponse(rawResponse);
    assert.ok(result.error);
  });
});

// Helper to create test WikiNodes
function createTestNode(
  path: string,
  options: {
    type?: 'file' | 'module' | 'function';
    fanIn?: number;
    exports?: string[];
    functions?: Array<{
      name: string;
      signature: string;
      startLine: number;
      endLine: number;
      codeSnippet?: string;
      keyStatements?: Array<{
        category: 'config' | 'url' | 'math' | 'condition' | 'error';
        text: string;
        line: number;
      }>;
    }>;
    summary?: string;
  } = {}
): WikiNode {
  return {
    id: path,
    type: options.type || 'file',
    path,
    name: path.split('/').pop() || path,
    metadata: {
      lines: 100,
      commits: 5,
      lastModified: new Date(),
      authors: ['test'],
      fanIn: options.fanIn ?? 0,
    },
    edges: [],
    raw: {
      exports: (options.exports || []).map((name) => ({ name, kind: 'function' as const })),
      functions: options.functions?.map((f) => ({
        name: f.name,
        signature: f.signature,
        startLine: f.startLine,
        endLine: f.endLine,
        isAsync: false,
        isExported: true,
        isDefaultExport: false,
        codeSnippet: f.codeSnippet || '',
        keyStatements: f.keyStatements || [],
        calls: [],
        calledBy: [],
        crossFileCalls: [],
        crossFileCalledBy: [],
        errorPaths: [],
      })),
    },
    prose: options.summary
      ? {
          summary: options.summary,
          purpose: 'Test purpose',
          gotchas: [],
          generatedAt: new Date(),
        }
      : undefined,
  };
}

describe('resolveFileTarget - Phase 7.3.6.1', () => {
  it('resolves valid file path to node', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/index.ts', { summary: 'Main entry' }),
      createTestNode('src/utils.ts', { summary: 'Utilities' }),
    ];
    const target: FileTarget = { type: 'file', path: 'src/index.ts' };

    const result = resolveFileTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.node?.path, 'src/index.ts');
  });

  it('returns error for non-existent file', () => {
    const nodes: WikiNode[] = [createTestNode('src/index.ts')];
    const target: FileTarget = { type: 'file', path: 'src/missing.ts' };

    const result = resolveFileTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('provides suggestions for similar paths', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/extractor/index.ts'),
      createTestNode('src/generator/index.ts'),
    ];
    const target: FileTarget = { type: 'file', path: 'src/extract/index.ts' };

    const result = resolveFileTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.suggestions);
    assert.ok(result.suggestions.includes('src/extractor/index.ts'));
  });
});

describe('resolveFunctionTarget - Phase 7.3.6.3', () => {
  it('resolves function in file', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'helper', signature: 'function helper(): void', startLine: 10, endLine: 20 },
          {
            name: 'format',
            signature: 'function format(s: string): string',
            startLine: 25,
            endLine: 35,
          },
        ],
      }),
    ];
    const target: FunctionTarget = { type: 'function', name: 'helper', in: 'src/utils.ts' };

    const result = resolveFunctionTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.functionDetails);
    assert.strictEqual(result.functionDetails.name, 'helper');
    assert.strictEqual(result.functionDetails.startLine, 10);
  });

  it('returns error for missing function', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'helper', signature: 'function helper(): void', startLine: 10, endLine: 20 },
        ],
      }),
    ];
    const target: FunctionTarget = { type: 'function', name: 'missing', in: 'src/utils.ts' };

    const result = resolveFunctionTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not found'));
  });

  it('returns error for missing file', () => {
    const nodes: WikiNode[] = [createTestNode('src/other.ts')];
    const target: FunctionTarget = { type: 'function', name: 'helper', in: 'src/utils.ts' };

    const result = resolveFunctionTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not found'));
  });
});

describe('resolveImportersTarget - Phase 7.3.6.4', () => {
  it('finds files that import a symbol using importedBy edges', () => {
    const typeNode = createTestNode('src/types.ts', { exports: ['WikiNode'] });
    typeNode.edges = [
      { type: 'importedBy', target: 'src/builder.ts' },
      { type: 'importedBy', target: 'src/api.ts' },
    ];
    const nodes: WikiNode[] = [
      typeNode,
      createTestNode('src/builder.ts'),
      createTestNode('src/api.ts'),
    ];
    const target: ImportersTarget = { type: 'importers', of: 'WikiNode' };

    const result = resolveImportersTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.importers);
    assert.ok(result.importers.length >= 2);
    assert.ok(result.importers.includes('src/builder.ts'));
    assert.ok(result.importers.includes('src/api.ts'));
  });

  it('returns empty list when symbol not found', () => {
    const nodes: WikiNode[] = [createTestNode('src/utils.ts', { exports: ['helper'] })];
    const target: ImportersTarget = { type: 'importers', of: 'UnknownSymbol' };

    const result = resolveImportersTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.importers, []);
  });

  it('deduplicates importers when same file imports multiple exports', () => {
    // Two files exporting the same symbol, both imported by the same consumer
    const typeNode1 = createTestNode('src/types.ts', { exports: ['Config'] });
    typeNode1.edges = [{ type: 'importedBy', target: 'src/app.ts' }];
    const typeNode2 = createTestNode('src/utils.ts', { exports: ['Config'] });
    typeNode2.edges = [{ type: 'importedBy', target: 'src/app.ts' }];
    const nodes: WikiNode[] = [typeNode1, typeNode2, createTestNode('src/app.ts')];
    const target: ImportersTarget = { type: 'importers', of: 'Config' };

    const result = resolveImportersTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.importers);
    // Should only have src/app.ts once despite appearing in multiple source nodes
    const appCount = result.importers.filter((p) => p === 'src/app.ts').length;
    assert.strictEqual(appCount, 1, 'src/app.ts should appear only once (deduplicated)');
  });
});

describe('executeGrepTarget - Phase 7.3.6.2', () => {
  it('finds matches in function names', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/retry.ts', {
        functions: [
          {
            name: 'retryWithBackoff',
            signature: 'function retryWithBackoff(): void',
            startLine: 10,
            endLine: 20,
          },
          { name: 'helper', signature: 'function helper(): void', startLine: 25, endLine: 35 },
        ],
      }),
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'format', signature: 'function format(): void', startLine: 1, endLine: 10 },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'retry' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.matches);
    assert.ok(result.matches.length >= 1);
    assert.ok(result.matches.some((m) => m.path === 'src/retry.ts'));
  });

  it('finds matches in code snippets', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/api.ts', {
        functions: [
          {
            name: 'callAPI',
            signature: 'function callAPI(): Promise<void>',
            startLine: 1,
            endLine: 20,
            codeSnippet: 'const maxRetries = 3;',
          },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'maxRetries' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.matches);
    assert.ok(result.matches.length >= 1);
    assert.strictEqual(result.matches[0].path, 'src/api.ts');
  });

  it('finds matches in key statements', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/generator.ts', {
        functions: [
          {
            name: 'generate',
            signature: 'function generate(): void',
            startLine: 1,
            endLine: 30,
            keyStatements: [
              { category: 'error', text: 'throw new Error("Rate limit exceeded")', line: 15 },
            ],
          },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'Rate limit' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.matches);
    assert.ok(result.matches.some((m) => m.content?.includes('Rate limit')));
  });

  it('respects scope parameter', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/api/retry.ts', {
        functions: [
          { name: 'retry', signature: 'function retry(): void', startLine: 1, endLine: 10 },
        ],
      }),
      createTestNode('src/utils/retry.ts', {
        functions: [
          { name: 'retry', signature: 'function retry(): void', startLine: 1, endLine: 10 },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'retry', scope: 'src/api/' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.matches);
    // Should only match the src/api/retry.ts file
    assert.ok(result.matches.every((m) => m.path.startsWith('src/api/')));
    assert.ok(result.matches.some((m) => m.path === 'src/api/retry.ts'));
  });

  it('uses regex patterns', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/config.ts', {
        functions: [
          {
            name: 'getAPIKey',
            signature: 'function getAPIKey(): string',
            startLine: 1,
            endLine: 5,
          },
          {
            name: 'getDBUrl',
            signature: 'function getDBUrl(): string',
            startLine: 10,
            endLine: 15,
          },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'get(API|DB)' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.ok(result.matches);
    assert.ok(result.matches.length >= 2);
  });

  it('returns empty matches for no results', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'format', signature: 'function format(): void', startLine: 1, endLine: 10 },
        ],
      }),
    ];
    const target: GrepTarget = { type: 'grep', pattern: 'nonexistent' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.matches, []);
  });

  it('returns error for invalid regex', () => {
    const nodes: WikiNode[] = [createTestNode('src/utils.ts')];
    const target: GrepTarget = { type: 'grep', pattern: '[invalid(' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Invalid regex'));
  });

  it('returns error for empty pattern', () => {
    const nodes: WikiNode[] = [createTestNode('src/utils.ts')];
    const target: GrepTarget = { type: 'grep', pattern: '' };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('returns error for pattern exceeding max length', () => {
    const nodes: WikiNode[] = [createTestNode('src/utils.ts')];
    const longPattern = 'a'.repeat(250);
    const target: GrepTarget = { type: 'grep', pattern: longPattern };

    const result = executeGrepTarget(target, nodes);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('too long'));
  });

  it('returns error for dangerous nested quantifier patterns', () => {
    const nodes: WikiNode[] = [createTestNode('src/utils.ts')];
    const dangerousPatterns = ['a*+', 'b++', 'c**'];

    for (const pattern of dangerousPatterns) {
      const target: GrepTarget = { type: 'grep', pattern };
      const result = executeGrepTarget(target, nodes);

      assert.strictEqual(result.success, false, `Expected failure for pattern: ${pattern}`);
      assert.ok(result.error?.includes('dangerous'), `Expected danger message for: ${pattern}`);
    }
  });
});

describe('resolveAllTargets - Phase 7.3.7.1', () => {
  it('resolves file targets and collects nodes', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/index.ts', { summary: 'Entry point' }),
      createTestNode('src/utils.ts', { summary: 'Utilities' }),
    ];
    const targets: NavigationTarget[] = [
      { type: 'file', path: 'src/index.ts' },
      { type: 'file', path: 'src/utils.ts' },
    ];

    const result = resolveAllTargets(targets, nodes);

    assert.strictEqual(result.nodes.length, 2);
    assert.ok(result.nodes.some((n) => n.path === 'src/index.ts'));
    assert.ok(result.nodes.some((n) => n.path === 'src/utils.ts'));
    assert.deepStrictEqual(result.errors, []);
  });

  it('resolves grep targets and collects matching nodes', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/retry.ts', {
        functions: [
          { name: 'retry', signature: 'function retry(): void', startLine: 1, endLine: 10 },
        ],
      }),
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'format', signature: 'function format(): void', startLine: 1, endLine: 10 },
        ],
      }),
    ];
    const targets: NavigationTarget[] = [{ type: 'grep', pattern: 'retry' }];

    const result = resolveAllTargets(targets, nodes);

    // Should include the node where retry was found
    assert.ok(result.nodes.some((n) => n.path === 'src/retry.ts'));
    assert.ok(result.grepMatches);
    assert.ok(result.grepMatches.length > 0);
  });

  it('resolves function targets and includes function details', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/utils.ts', {
        functions: [
          { name: 'helper', signature: 'function helper(): void', startLine: 10, endLine: 20 },
        ],
      }),
    ];
    const targets: NavigationTarget[] = [{ type: 'function', name: 'helper', in: 'src/utils.ts' }];

    const result = resolveAllTargets(targets, nodes);

    assert.ok(result.functionDetails);
    assert.ok(result.functionDetails.length > 0);
    assert.strictEqual(result.functionDetails[0].name, 'helper');
  });

  it('resolves importers targets and includes nodes that import the symbol', () => {
    const typeNode = createTestNode('src/types.ts', { exports: ['Config'] });
    typeNode.edges = [
      { type: 'importedBy', target: 'src/app.ts' },
      { type: 'importedBy', target: 'src/utils.ts' },
    ];
    const nodes: WikiNode[] = [
      typeNode,
      createTestNode('src/app.ts'),
      createTestNode('src/utils.ts'),
    ];
    const targets: NavigationTarget[] = [{ type: 'importers', of: 'Config' }];

    const result = resolveAllTargets(targets, nodes);

    // Should include the importing nodes
    assert.ok(result.nodes.some((n) => n.path === 'src/app.ts'));
    assert.ok(result.nodes.some((n) => n.path === 'src/utils.ts'));
  });

  it('collects errors for failed resolutions', () => {
    const nodes: WikiNode[] = [createTestNode('src/index.ts')];
    const targets: NavigationTarget[] = [
      { type: 'file', path: 'src/missing.ts' },
      { type: 'file', path: 'src/index.ts' },
    ];

    const result = resolveAllTargets(targets, nodes);

    // Should still include the successful resolution
    assert.ok(result.nodes.some((n) => n.path === 'src/index.ts'));
    // Should have error for the missing file
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e) => e.includes('not found')));
  });

  it('deduplicates nodes from multiple targets', () => {
    const nodes: WikiNode[] = [
      createTestNode('src/retry.ts', {
        functions: [
          { name: 'retry', signature: 'function retry(): void', startLine: 1, endLine: 10 },
        ],
      }),
    ];
    const targets: NavigationTarget[] = [
      { type: 'file', path: 'src/retry.ts' },
      { type: 'grep', pattern: 'retry' },
    ];

    const result = resolveAllTargets(targets, nodes);

    // Should not duplicate the same node
    const retryNodes = result.nodes.filter((n) => n.path === 'src/retry.ts');
    assert.strictEqual(retryNodes.length, 1);
  });
});

describe('buildNavigatorSynthesisPrompt - Phase 7.3.7.2', () => {
  it('includes query in prompt', () => {
    const context: ResolvedContext = {
      nodes: [],
      grepMatches: [],
      functionDetails: [],
      errors: [],
    };
    const prompt = buildNavigatorSynthesisPrompt('How does retry work?', context, 'Test reasoning');

    assert.ok(prompt.includes('How does retry work?'));
  });

  it('includes navigator reasoning', () => {
    const context: ResolvedContext = {
      nodes: [],
      grepMatches: [],
      functionDetails: [],
      errors: [],
    };
    const prompt = buildNavigatorSynthesisPrompt(
      'test',
      context,
      'Selected files based on retry pattern'
    );

    assert.ok(prompt.includes('Selected files based on retry pattern'));
  });

  it('includes file nodes with summaries', () => {
    const node = createTestNode('src/generator.ts', { summary: 'Generates LLM prose' });
    const context: ResolvedContext = {
      nodes: [node],
      grepMatches: [],
      functionDetails: [],
      errors: [],
    };
    const prompt = buildNavigatorSynthesisPrompt('test', context, 'reasoning');

    assert.ok(prompt.includes('src/generator.ts'));
    assert.ok(prompt.includes('Generates LLM prose'));
  });

  it('includes grep matches grouped by file', () => {
    const context: ResolvedContext = {
      nodes: [],
      grepMatches: [
        {
          path: 'src/retry.ts',
          matchType: 'functionName',
          name: 'retry',
          line: 10,
          content: 'retry',
        },
        {
          path: 'src/retry.ts',
          matchType: 'codeSnippet',
          name: 'callLLM',
          line: 50,
          content: 'maxRetries',
        },
      ],
      functionDetails: [],
      errors: [],
    };
    const prompt = buildNavigatorSynthesisPrompt('test', context, 'reasoning');

    assert.ok(prompt.includes('Pattern Matches'));
    assert.ok(prompt.includes('src/retry.ts'));
    assert.ok(prompt.includes('retry'));
    assert.ok(prompt.includes('maxRetries'));
  });

  it('includes resolution errors as warnings', () => {
    const context: ResolvedContext = {
      nodes: [],
      grepMatches: [],
      functionDetails: [],
      errors: ['File not found: src/missing.ts'],
    };
    const prompt = buildNavigatorSynthesisPrompt('test', context, 'reasoning');

    assert.ok(prompt.includes('Warnings'));
    assert.ok(prompt.includes('File not found: src/missing.ts'));
  });

  it('highlights requested functions with star marker', () => {
    const node = createTestNode('src/utils.ts', {
      functions: [
        { name: 'helper', signature: 'function helper(): void', startLine: 10, endLine: 20 },
        { name: 'format', signature: 'function format(): void', startLine: 30, endLine: 40 },
      ],
    });
    const context: ResolvedContext = {
      nodes: [node],
      grepMatches: [],
      functionDetails: [
        {
          path: 'src/utils.ts',
          name: 'helper',
          signature: 'function helper(): void',
          startLine: 10,
          endLine: 20,
        },
      ],
      errors: [],
    };
    const prompt = buildNavigatorSynthesisPrompt('test', context, 'reasoning');

    // helper should be highlighted, format should not
    assert.ok(prompt.includes('helper') && prompt.includes('⭐'));
    // format should not have the star
    const formatLine = prompt
      .split('\n')
      .find((l) => l.includes('format') && l.includes('lines 30-40'));
    assert.ok(formatLine && !formatLine.includes('⭐'));
  });
});
