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
  buildNavigatorPrompt,
  parseNavigatorResponse,
  formatOverviewForPrompt,
} from './navigator.ts';
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
