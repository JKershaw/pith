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
  isEntryPoint,
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
      configFiles: [],
    };

    assert.strictEqual(typeof overview.readme, 'string');
    assert.strictEqual(typeof overview.fileTree, 'string');
    assert.ok(Array.isArray(overview.modules));
    assert.ok(Array.isArray(overview.entryPoints));
    assert.ok(Array.isArray(overview.relationships));
    assert.ok(Array.isArray(overview.configFiles));
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
    assert.deepStrictEqual(overview.configFiles, []);
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

  it('identifies entry points (fanIn=0, no exports) - Phase 7.3.2', () => {
    const nodes: WikiNode[] = [
      // CLI entry point: fanIn=0, no exports
      createFileNode('src/cli/index.ts', {
        fanIn: 0,
        exports: [],
        summary: 'CLI entry point for pith commands',
      }),
      // Regular file with exports and dependents
      createFileNode('src/extractor/ast.ts', {
        fanIn: 5,
        exports: ['extractFile', 'extractGit'],
        summary: 'AST extraction utilities',
      }),
      // Package entry: fanIn=0 but has exports (not an entry point)
      createFileNode('src/index.ts', {
        fanIn: 0,
        exports: ['WikiNode', 'buildNodes'],
        summary: 'Package exports',
      }),
    ];

    const overview = buildProjectOverview(nodes);

    // Should only include CLI as entry point (fanIn=0, no exports)
    assert.strictEqual(overview.entryPoints.length, 1);
    assert.strictEqual(overview.entryPoints[0].path, 'src/cli/index.ts');
    assert.ok(overview.entryPoints[0].description.includes('CLI'));
  });

  it('uses file summary as entry point description', () => {
    const nodes: WikiNode[] = [
      createFileNode('src/main.ts', {
        fanIn: 0,
        exports: [],
        summary: 'Main application entry point',
      }),
    ];

    const overview = buildProjectOverview(nodes);

    assert.strictEqual(overview.entryPoints.length, 1);
    assert.strictEqual(overview.entryPoints[0].description, 'Main application entry point');
  });

  it('generates description from imports when no summary', () => {
    const nodes: WikiNode[] = [
      createFileNode('src/cli/index.ts', {
        fanIn: 0,
        exports: [],
        imports: [
          { from: './extractor', names: ['extractFile'] },
          { from: './builder', names: ['buildNodes'] },
        ],
        // no summary
      }),
    ];

    const overview = buildProjectOverview(nodes);

    assert.strictEqual(overview.entryPoints.length, 1);
    // Should mention what it imports
    assert.ok(
      overview.entryPoints[0].description.includes('extractFile') ||
        overview.entryPoints[0].description.includes('extractor')
    );
  });
});

describe('isEntryPoint', () => {
  it('returns true for file with fanIn=0 and no exports', () => {
    const node = createFileNode('src/cli/index.ts', { fanIn: 0, exports: [] });
    assert.strictEqual(isEntryPoint(node), true);
  });

  it('returns false for file with fanIn > 0', () => {
    const node = createFileNode('src/utils.ts', { fanIn: 3, exports: [] });
    assert.strictEqual(isEntryPoint(node), false);
  });

  it('returns false for file with exports', () => {
    const node = createFileNode('src/index.ts', { fanIn: 0, exports: ['main', 'config'] });
    assert.strictEqual(isEntryPoint(node), false);
  });

  it('returns false for module nodes', () => {
    const node = createModuleNode('src/cli/');
    // Force fanIn to 0 for test
    node.metadata.fanIn = 0;
    assert.strictEqual(isEntryPoint(node), false);
  });

  it('returns true when fanIn is undefined (no dependents)', () => {
    const node = createFileNode('src/main.ts', { exports: [] });
    // fanIn is undefined by default in helper
    node.metadata.fanIn = undefined;
    assert.strictEqual(isEntryPoint(node), true);
  });

  it('allows files with 0-1 exports as potential entry points', () => {
    // Entry points may export a single item (e.g., for testing purposes)
    const node = createFileNode('src/cli/index.ts', { fanIn: 0, exports: ['run'] });
    // Should still be considered entry point with just 1 export
    assert.strictEqual(isEntryPoint(node), true);
  });
});

describe('relationships in buildProjectOverview - Phase 7.3.3', () => {
  it('extracts import relationships from entry points', () => {
    const nodes: WikiNode[] = [
      // CLI entry point with imports
      createFileNode('src/cli/index.ts', {
        fanIn: 0,
        exports: [],
        imports: [
          { from: './extractor', names: ['extractFile'] },
          { from: './builder', names: ['buildNodes', 'WikiNode'] },
          { from: './generator', names: ['generateProse'] },
        ],
      }),
      // Regular files
      createFileNode('src/extractor/index.ts', { fanIn: 3, exports: ['extractFile'] }),
      createFileNode('src/builder/index.ts', { fanIn: 5, exports: ['buildNodes', 'WikiNode'] }),
    ];

    const overview = buildProjectOverview(nodes);

    // Should have relationship from CLI
    assert.ok(overview.relationships.length >= 1);
    const cliRel = overview.relationships.find((r) => r.from === 'src/cli/index.ts');
    assert.ok(cliRel);
    assert.ok(cliRel.imports.includes('extractFile'));
    assert.ok(cliRel.imports.includes('buildNodes'));
  });

  it('includes high-fanIn files with their exports and consumer count in relationships', () => {
    const nodes: WikiNode[] = [
      // High fanIn file - widely used (fanIn >= 5 threshold)
      createFileNode('src/types/index.ts', {
        fanIn: 12,
        exports: ['WikiNode', 'Edge', 'ProseData'],
        summary: 'Core type definitions',
      }),
      // Normal file below threshold
      createFileNode('src/utils.ts', { fanIn: 2, exports: ['helper'] }),
    ];

    const overview = buildProjectOverview(nodes);

    // High fanIn files should appear in relationships section with their exports
    const highFanInRel = overview.relationships.find((r) => r.from === 'src/types/index.ts');
    assert.ok(highFanInRel, 'High-fanIn file should be in relationships');

    // Verify consumer count is tracked
    assert.strictEqual(highFanInRel.consumerCount, 12, 'Should track consumer count (fanIn)');

    // The imports field contains what this file provides (exports) for high-fanIn files
    assert.ok(highFanInRel.imports.includes('WikiNode'), 'Should list WikiNode export');
    assert.ok(highFanInRel.imports.includes('Edge'), 'Should list Edge export');
    assert.ok(highFanInRel.imports.includes('ProseData'), 'Should list ProseData export');
  });

  it('shows what entry points import for navigation context', () => {
    const nodes: WikiNode[] = [
      createFileNode('src/main.ts', {
        fanIn: 0,
        exports: [],
        imports: [
          { from: './app', names: ['createApp'] },
          { from: './config', names: ['loadConfig'] },
        ],
      }),
    ];

    const overview = buildProjectOverview(nodes);

    // Entry point's imports should be in relationships
    assert.ok(overview.relationships.length >= 1);
    const mainRel = overview.relationships[0];
    assert.strictEqual(mainRel.from, 'src/main.ts');
    assert.ok(mainRel.imports.includes('createApp'));
    assert.ok(mainRel.imports.includes('loadConfig'));
  });
});

// Phase 7.7.2.1: Config files in project overview
describe('configFiles in buildProjectOverview - Phase 7.7.2.1', () => {
  it('returns empty array when no config file nodes exist', () => {
    const nodes: WikiNode[] = [createFileNode('src/index.ts'), createFileNode('src/utils.ts')];

    const overview = buildProjectOverview(nodes);

    // Should return empty array when no config files detected
    assert.deepStrictEqual(overview.configFiles, []);
  });

  it('detects package.json as config file', () => {
    const packageJsonNode = createFileNode('package.json');
    const nodes: WikiNode[] = [packageJsonNode, createFileNode('src/index.ts')];

    const overview = buildProjectOverview(nodes);

    assert.ok(overview.configFiles.includes('package.json'));
  });

  it('detects tsconfig.json as config file', () => {
    const tsconfigNode = createFileNode('tsconfig.json');
    const nodes: WikiNode[] = [tsconfigNode, createFileNode('src/index.ts')];

    const overview = buildProjectOverview(nodes);

    assert.ok(overview.configFiles.includes('tsconfig.json'));
  });

  it('detects multiple config files', () => {
    const nodes: WikiNode[] = [
      createFileNode('package.json'),
      createFileNode('tsconfig.json'),
      createFileNode('jest.config.js'),
      createFileNode('src/index.ts'),
    ];

    const overview = buildProjectOverview(nodes);

    assert.ok(overview.configFiles.includes('package.json'));
    assert.ok(overview.configFiles.includes('tsconfig.json'));
    assert.ok(overview.configFiles.includes('jest.config.js'));
  });

  it('sorts config files alphabetically', () => {
    const nodes: WikiNode[] = [
      createFileNode('tsconfig.json'),
      createFileNode('package.json'),
      createFileNode('jest.config.js'),
    ];

    const overview = buildProjectOverview(nodes);

    // Should be sorted alphabetically
    const sorted = [...overview.configFiles].sort();
    assert.deepStrictEqual(overview.configFiles, sorted);
  });
});
