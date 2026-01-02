/**
 * Tests for Project Overview generation (Phase 7.3.1)
 * Overview-Based Navigation: Generate high-level project overview for LLM navigator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { WikiNode } from '../builder/index.ts';
import {
  type ProjectOverview,
  type ModuleInfo,
  type EntryPoint,
  type Relationship,
  buildProjectOverview,
} from './overview.ts';

// Helper to create minimal WikiNode for testing
function createFileNode(
  path: string,
  options: {
    fanIn?: number;
    fanOut?: number;
    exports?: string[];
    imports?: Array<{ from: string; names: string[] }>;
    summary?: string;
  } = {}
): WikiNode {
  return {
    id: path,
    type: 'file',
    path,
    name: path.split('/').pop() || path,
    metadata: {
      lines: 100,
      commits: 5,
      lastModified: new Date(),
      authors: ['test'],
      fanIn: options.fanIn ?? 0,
      fanOut: options.fanOut ?? 0,
    },
    edges: (options.imports || []).map((imp) => ({
      type: 'imports' as const,
      target: imp.from,
    })),
    raw: {
      exports: (options.exports || []).map((name) => ({ name, kind: 'function' as const })),
      imports: options.imports,
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

function createModuleNode(
  path: string,
  options: {
    readme?: string;
    summary?: string;
    keyExports?: string[];
  } = {}
): WikiNode {
  return {
    id: path,
    type: 'module',
    path,
    name: path.split('/').pop() || path,
    metadata: {
      lines: 0,
      commits: 0,
      lastModified: new Date(),
      authors: [],
    },
    edges: [],
    raw: {
      readme: options.readme,
    },
    prose: options.summary
      ? {
          summary: options.summary,
          purpose: 'Module purpose',
          gotchas: [],
          keyExports: options.keyExports,
          generatedAt: new Date(),
        }
      : undefined,
  };
}

describe('ProjectOverview types', () => {
  it('ProjectOverview has required fields', () => {
    const overview: ProjectOverview = {
      readme: 'Test project',
      fileTree: 'src/\n  index.ts',
      modules: [],
      entryPoints: [],
      relationships: [],
    };

    assert.strictEqual(typeof overview.readme, 'string');
    assert.strictEqual(typeof overview.fileTree, 'string');
    assert.ok(Array.isArray(overview.modules));
    assert.ok(Array.isArray(overview.entryPoints));
    assert.ok(Array.isArray(overview.relationships));
  });

  it('ModuleInfo has path, summary, and keyExports', () => {
    const module: ModuleInfo = {
      path: 'src/extractor/',
      summary: 'Extracts facts from TypeScript',
      keyExports: ['extractFile', 'extractGit'],
    };

    assert.strictEqual(module.path, 'src/extractor/');
    assert.strictEqual(module.summary, 'Extracts facts from TypeScript');
    assert.deepStrictEqual(module.keyExports, ['extractFile', 'extractGit']);
  });

  it('EntryPoint has path and description', () => {
    const entry: EntryPoint = {
      path: 'src/cli/index.ts',
      description: 'CLI entry point, orchestrates extract→build→generate→serve',
    };

    assert.strictEqual(entry.path, 'src/cli/index.ts');
    assert.ok(entry.description.includes('CLI'));
  });

  it('Relationship shows what a file imports', () => {
    const rel: Relationship = {
      from: 'src/cli/index.ts',
      imports: ['extractFile', 'buildNodes', 'generateProse'],
    };

    assert.strictEqual(rel.from, 'src/cli/index.ts');
    assert.ok(rel.imports.includes('extractFile'));
  });
});

describe('buildProjectOverview', () => {
  it('returns empty overview for empty node list', () => {
    const overview = buildProjectOverview([]);

    assert.strictEqual(overview.readme, '');
    assert.strictEqual(overview.fileTree, '');
    assert.deepStrictEqual(overview.modules, []);
    assert.deepStrictEqual(overview.entryPoints, []);
    assert.deepStrictEqual(overview.relationships, []);
  });

  it('extracts README from root module node', () => {
    const nodes: WikiNode[] = [
      createModuleNode('src/', { readme: '# My Project\n\nThis is a test project.' }),
      createFileNode('src/index.ts'),
    ];

    const overview = buildProjectOverview(nodes);

    assert.ok(overview.readme.includes('My Project'));
  });

  it('builds file tree from file nodes', () => {
    const nodes: WikiNode[] = [
      createModuleNode('src/'),
      createFileNode('src/index.ts'),
      createFileNode('src/extractor/ast.ts'),
      createFileNode('src/extractor/git.ts'),
    ];

    const overview = buildProjectOverview(nodes);

    assert.ok(overview.fileTree.includes('src/'));
    assert.ok(overview.fileTree.includes('index.ts'));
    assert.ok(overview.fileTree.includes('extractor/'));
    assert.ok(overview.fileTree.includes('ast.ts'));
  });

  it('includes module summaries with key exports', () => {
    const nodes: WikiNode[] = [
      createModuleNode('src/extractor/', {
        summary: 'Extracts facts from TypeScript files',
        keyExports: ['extractFile', 'extractGit'],
      }),
    ];

    const overview = buildProjectOverview(nodes);

    assert.strictEqual(overview.modules.length, 1);
    assert.strictEqual(overview.modules[0].path, 'src/extractor/');
    assert.ok(overview.modules[0].summary.includes('Extracts'));
    assert.deepStrictEqual(overview.modules[0].keyExports, ['extractFile', 'extractGit']);
  });

  it('prefers shortest path README when multiple modules have READMEs', () => {
    const nodes: WikiNode[] = [
      createModuleNode('src/deeply/nested/module/', { readme: '# Nested README' }),
      createModuleNode('src/', { readme: '# Root README' }),
      createModuleNode('src/another/', { readme: '# Another README' }),
    ];

    const overview = buildProjectOverview(nodes);

    // Should select 'src/' (shortest path) README
    assert.ok(overview.readme.includes('Root README'));
    assert.ok(!overview.readme.includes('Nested'));
  });

  it('handles modules with prose but no keyExports', () => {
    const nodes: WikiNode[] = [
      createModuleNode('src/utils/', {
        summary: 'Utility functions',
        // keyExports is undefined
      }),
    ];

    const overview = buildProjectOverview(nodes);

    assert.strictEqual(overview.modules.length, 1);
    assert.strictEqual(overview.modules[0].summary, 'Utility functions');
    assert.deepStrictEqual(overview.modules[0].keyExports, []);
  });
});
