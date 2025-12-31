import type { MangoDb } from '@jkershaw/mangodb';
import type { WikiNode } from '../builder/index.ts';
import {
  buildImpactTree,
  findAffectedFunctions,
  getTestFilesForImpact,
  getUsedSymbolsFromFile,
  type ImpactTree,
  type AffectedFunction,
  type TestFileImpact,
} from '../builder/index.ts';
import type { GeneratorConfig } from '../generator/index.ts';
import { generateProseForNode } from '../generator/index.ts';
import type { ErrorPath } from '../extractor/errors.ts';
import express, { type Express, type Request, type Response } from 'express';
import { stat } from 'node:fs/promises';

/**
 * Pattern-specific usage guidance for detected design patterns.
 * Maps pattern name to usage hint string.
 */
const PATTERN_GUIDANCE: Record<string, string> = {
  retry: 'To customize retry behavior, modify maxRetries and backoff formula',
  cache: 'Use get/set/has methods; check cache invalidation logic',
  singleton: "Access via getInstance(); don't instantiate directly",
  builder: 'Chain method calls; call build() at the end',
};

/**
 * Format a cross-file call reference for display.
 * @param reference - The call reference in "file:funcName" format
 * @param arrow - The arrow direction ('→' for calls, '←' for called by)
 * @returns Formatted markdown string
 */
function formatCallReference(reference: string, arrow: string): string {
  const [filePath, funcName] = reference.includes(':') ? reference.split(':') : [reference, ''];
  if (funcName) {
    return `- \`${filePath}\` ${arrow} \`${funcName}()\``;
  }
  return `- \`${reference}\``;
}

/**
 * Format test file links for a node.
 * @param node - The wiki node containing test file edges
 * @param context - The bundled context to look up test file nodes
 * @returns Array of formatted test file link strings
 */
function formatTestFileLinks(node: WikiNode, context: BundledContext): string[] {
  const lines: string[] = [];
  const testFileEdges = node.edges.filter((e) => e.type === 'testFile');

  for (const edge of testFileEdges) {
    const testFileNode = context.nodes.find((n) => n.id === edge.target);
    if (testFileNode?.metadata.testCommand) {
      lines.push(`- Run: \`${testFileNode.metadata.testCommand}\``);
    } else {
      lines.push(`- See: \`${edge.target}\``);
    }
  }

  return lines;
}

/**
 * Bundled context for LLM consumption
 */
export interface BundledContext {
  nodes: WikiNode[]; // All relevant nodes
  errors: string[]; // Any errors during bundling
  depth: number; // Maximum traversal depth used
}

/**
 * Bundle context for a set of requested file paths.
 * Includes requested nodes, their imports, and parent modules.
 *
 * @param db - MangoDB database instance
 * @param paths - File paths to include in context
 * @param maxDepth - Maximum traversal depth (default 1)
 * @returns Bundled context with all relevant nodes
 */
export async function bundleContext(
  db: MangoDb,
  paths: string[],
  maxDepth: number = 1
): Promise<BundledContext> {
  const nodesCollection = db.collection<WikiNode>('nodes');
  const nodeMap = new Map<string, WikiNode>();
  const errors: string[] = [];

  // Fetch requested nodes in parallel
  const requestedNodes = await Promise.all(
    paths.map((path) => nodesCollection.findOne({ id: path }))
  );

  for (let i = 0; i < paths.length; i++) {
    const node = requestedNodes[i];
    if (node) {
      nodeMap.set(node.id, node);
    } else {
      errors.push(`Node not found: ${paths[i]}`);
    }
  }

  // Traverse to find related nodes (depth 1 = immediate imports + parent + test files)
  if (maxDepth >= 1) {
    const initialNodes = [...nodeMap.values()];

    // Collect all targets to fetch (imports + parents + test files)
    const targetsToFetch = new Set<string>();

    for (const node of initialNodes) {
      // Collect import targets
      const importEdges = node.edges.filter((e) => e.type === 'imports');
      for (const edge of importEdges) {
        if (!nodeMap.has(edge.target)) {
          targetsToFetch.add(edge.target);
        }
      }

      // Collect parent target
      const parentEdge = node.edges.find((e) => e.type === 'parent');
      if (parentEdge && !nodeMap.has(parentEdge.target)) {
        targetsToFetch.add(parentEdge.target);
      }

      // Collect test file targets (Phase 6.2.3)
      const testFileEdges = node.edges.filter((e) => e.type === 'testFile');
      for (const edge of testFileEdges) {
        if (!nodeMap.has(edge.target)) {
          targetsToFetch.add(edge.target);
        }
      }
    }

    // Fetch all related nodes in parallel
    const relatedNodes = await Promise.all(
      [...targetsToFetch].map((target) => nodesCollection.findOne({ id: target }))
    );

    for (const node of relatedNodes) {
      if (node) {
        nodeMap.set(node.id, node);
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    errors,
    depth: maxDepth,
  };
}

/**
 * Format bundled context as markdown for LLM consumption.
 *
 * @param context - Bundled context to format
 * @returns Markdown string
 */
export function formatContextAsMarkdown(context: BundledContext): string {
  const lines: string[] = [];

  lines.push('# Context');
  lines.push('');
  lines.push(`*${context.nodes.length} nodes included (depth ${context.depth})*`);
  lines.push('');

  // Sort nodes: modules first, then files by path
  const sortedNodes = [...context.nodes].sort((a, b) => {
    if (a.type === 'module' && b.type !== 'module') return -1;
    if (a.type !== 'module' && b.type === 'module') return 1;
    return a.path.localeCompare(b.path);
  });

  for (const node of sortedNodes) {
    lines.push(`## ${node.path}`);
    lines.push('');
    lines.push(`**Type:** ${node.type}`);

    // Phase 6.3.3: Warning for high fan-in files
    if (node.metadata.fanIn !== undefined && node.metadata.fanIn > 5) {
      lines.push('');
      lines.push(`> **Warning:** Widely used (${node.metadata.fanIn} files depend on this)`);
    }

    // Phase 6.7.2.1: Modification Checklist for high-fanIn files
    if (node.type === 'file' && node.metadata.fanIn !== undefined && node.metadata.fanIn > 5) {
      const dependentEdges = node.edges.filter((e) => e.type === 'importedBy');
      const testFileEdges = node.edges.filter((e) => e.type === 'testFile');

      lines.push('');
      lines.push('**Modification Checklist:**');
      lines.push('');
      lines.push(`1. **Update this file** - Make changes to \`${node.path}\``);

      // List exported types/interfaces if available
      if (node.raw.exports && node.raw.exports.length > 0) {
        const types = node.raw.exports.filter((e) => e.kind === 'interface' || e.kind === 'type');
        if (types.length > 0) {
          lines.push(`   - Exported types: ${types.map((t) => t.name).join(', ')}`);
        }
      }

      lines.push(`2. **Update consumers** - ${node.metadata.fanIn} files depend on this:`);
      for (const edge of dependentEdges.slice(0, 10)) {
        lines.push(`   - \`${edge.target}\``);
      }
      if (dependentEdges.length > 10) {
        lines.push(`   - ... and ${dependentEdges.length - 10} more files`);
      }

      lines.push(`3. **Run tests** - Verify changes don't break consumers`);
      const firstTestEdge = testFileEdges[0];
      if (firstTestEdge) {
        lines.push(`   - Test file: \`${firstTestEdge.target}\``);
        // Look for the test file node in context to get the test command
        const testFileNode = context.nodes.find((n) => n.id === firstTestEdge.target);
        if (testFileNode?.metadata.testCommand) {
          lines.push(`   - Run: \`${testFileNode.metadata.testCommand}\``);
        } else {
          // Fallback to a default npm test command
          lines.push(`   - Run: \`npm test -- ${firstTestEdge.target}\``);
        }
      }
      lines.push('');

      // Phase 6.7.2.2: Detect middleware patterns for Express-style apps
      const middlewarePatterns: Array<{ line: number; text: string }> = [];
      if (node.raw.functions) {
        for (const func of node.raw.functions) {
          // Check key statements for app.use or router.use patterns
          if (func.keyStatements) {
            for (const stmt of func.keyStatements) {
              if (
                stmt.text.includes('.use(') ||
                stmt.text.includes('app.use') ||
                stmt.text.includes('router.use')
              ) {
                middlewarePatterns.push({ line: stmt.line, text: stmt.text });
              }
            }
          }
          // Also check code snippet for middleware patterns
          if (
            func.codeSnippet &&
            (func.codeSnippet.includes('.use(') || func.codeSnippet.includes('app.use'))
          ) {
            // Extract app.use lines from code snippet
            const snippetLines = func.codeSnippet.split('\n');
            for (let i = 0; i < snippetLines.length; i++) {
              const snippetLine = snippetLines[i];
              if (snippetLine === undefined) continue;
              if (
                snippetLine.includes('.use(') ||
                snippetLine.includes('app.use') ||
                snippetLine.includes('router.use')
              ) {
                // Check if we already captured this from key statements
                const alreadyFound = middlewarePatterns.some((p) => p.text === snippetLine.trim());
                if (!alreadyFound) {
                  middlewarePatterns.push({ line: func.startLine + i, text: snippetLine.trim() });
                }
              }
            }
          }
        }
      }

      if (middlewarePatterns.length > 0) {
        lines.push('**Middleware Insertion Points:**');
        lines.push('');
        lines.push('Add new middleware after existing `.use()` calls:');
        for (const pattern of middlewarePatterns.slice(0, 5)) {
          lines.push(`- Line ${pattern.line}: \`${pattern.text}\``);
        }
        if (middlewarePatterns.length > 5) {
          lines.push(`- ... and ${middlewarePatterns.length - 5} more middleware calls`);
        }
        lines.push('');
      }

      // Phase 6.7.2.4: Show recent changes from git history
      if (node.raw.recentCommits && node.raw.recentCommits.length > 0) {
        lines.push('**Recent Changes:**');
        lines.push('');
        lines.push('Prior changes to this file (for reference):');
        for (const commit of node.raw.recentCommits.slice(0, 5)) {
          const hash = commit.hash?.substring(0, 7) ?? 'unknown';
          const message = commit.message ?? 'No message';
          const author = commit.author ?? 'Unknown author';
          const dateStr =
            commit.date instanceof Date
              ? commit.date.toISOString().split('T')[0]
              : String(commit.date ?? 'unknown date').split('T')[0];
          lines.push(`- \`${hash}\` ${message} (${author}, ${dateStr})`);
        }
        if (node.raw.recentCommits.length > 5) {
          lines.push(`- ... and ${node.raw.recentCommits.length - 5} more commits`);
        }
        lines.push('');
      }
    }

    // Prose summary and purpose
    if (node.prose) {
      lines.push('');
      lines.push(`**Summary:** ${node.prose.summary}`);
      if (node.prose.purpose) {
        lines.push('');
        lines.push(`**Purpose:** ${node.prose.purpose}`);
      }
      if (node.prose.gotchas && node.prose.gotchas.length > 0) {
        lines.push('');
        lines.push('**Gotchas:**');
        for (const gotcha of node.prose.gotchas) {
          lines.push(`- ${gotcha}`);
        }
      }

      // Detailed gotchas with locations (Phase 6.7)
      if (node.prose.gotchasDetailed && node.prose.gotchasDetailed.length > 0) {
        lines.push('');
        lines.push('**Gotchas (detailed):**');
        for (const gotcha of node.prose.gotchasDetailed) {
          let line = `- ${gotcha.warning}`;
          if (gotcha.location) {
            line += ` (${gotcha.location})`;
          }
          if (gotcha.evidence) {
            line += ` - Evidence: \`${gotcha.evidence}\``;
          }
          lines.push(line);
        }
      }

      // Debugging hints (Phase 6.7)
      if (node.prose.debugging) {
        lines.push('');
        lines.push('**Debugging:**');
        if (node.prose.debugging.errorPatterns && node.prose.debugging.errorPatterns.length > 0) {
          lines.push('*Error patterns:*');
          for (const pattern of node.prose.debugging.errorPatterns) {
            lines.push(`- ${pattern}`);
          }
        }
        if (node.prose.debugging.keyLocations && node.prose.debugging.keyLocations.length > 0) {
          lines.push('*Key locations:*');
          for (const location of node.prose.debugging.keyLocations) {
            lines.push(`- ${location}`);
          }
        }
      }

      // Data flow for modules (Phase 6.7)
      if (node.type === 'module' && node.prose.dataFlow) {
        lines.push('');
        lines.push(`**Data Flow:** ${node.prose.dataFlow}`);
      }

      // Quick Start for modules (Phase 6.4)
      if (node.type === 'module' && node.prose.quickStart) {
        lines.push('');
        lines.push('**Quick Start:**');
        lines.push('```typescript');
        lines.push(node.prose.quickStart);
        lines.push('```');
      }

      // Patterns for files (Phase 6.4)
      if (node.type === 'file' && node.prose.patterns && node.prose.patterns.length > 0) {
        lines.push('');
        lines.push('**Patterns:**');
        for (const pattern of node.prose.patterns) {
          lines.push(`- ${pattern}`);
        }
      }

      // Similar Files for files (Phase 6.4)
      if (node.type === 'file' && node.prose.similarFiles && node.prose.similarFiles.length > 0) {
        lines.push('');
        lines.push('**Similar Files:**');
        for (const file of node.prose.similarFiles) {
          lines.push(`- ${file}`);
        }
      }
    }

    // Phase 6.7.5: Detected Patterns with evidence
    if (node.type === 'file' && node.raw.patterns && node.raw.patterns.length > 0) {
      lines.push('');
      lines.push('**Detected Patterns:**');
      for (const pattern of node.raw.patterns) {
        const patternName = pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1);
        lines.push('');
        lines.push(`*${patternName} Pattern* (${pattern.confidence} confidence)`);
        lines.push(`- Location: \`${pattern.location}\``);

        if (pattern.evidence && pattern.evidence.length > 0) {
          lines.push('- Evidence:');
          for (const ev of pattern.evidence) {
            lines.push(`  - ${ev}`);
          }
        }

        // Phase 6.7.5.3: Pattern-specific usage guidance
        const guidance = PATTERN_GUIDANCE[pattern.name];
        if (guidance) {
          lines.push(`- Usage: ${guidance}`);
        }
      }
    }

    // Functions with details (Phase 6.6.1) - preferred over signatures when available
    if (node.type === 'file' && node.raw.functions && node.raw.functions.length > 0) {
      lines.push('');
      lines.push('**Functions:**');
      for (const func of node.raw.functions) {
        lines.push('');
        lines.push(`### ${func.name} (lines ${func.startLine}-${func.endLine})`);
        lines.push('```typescript');
        lines.push(func.codeSnippet);
        lines.push('```');

        // Key statements (Phase 6.6.1.3)
        if (func.keyStatements && func.keyStatements.length > 0) {
          lines.push('');
          lines.push('**Key statements:**');
          for (const stmt of func.keyStatements) {
            lines.push(`- [${stmt.category}] line ${stmt.line}: \`${stmt.text}\``);
          }
        }

        // Phase 6.7.4.1: Error Paths grouped by symptom
        if (func.errorPaths && func.errorPaths.length > 0) {
          lines.push('');
          lines.push('**Error Paths:**');

          // Group by type for better organization
          const errorPaths = func.errorPaths as ErrorPath[];
          const guards = errorPaths.filter((e) => e.type === 'guard');
          const earlyReturns = errorPaths.filter((e) => e.type === 'early-return');
          const throws = errorPaths.filter((e) => e.type === 'throw');
          const catches = errorPaths.filter((e) => e.type === 'catch');

          // Show validation guards first (most important for debugging)
          if (guards.length > 0) {
            lines.push('');
            lines.push('*Validation guards:*');
            for (const g of guards) {
              lines.push(`- Line ${g.line}: \`${g.condition}\` → ${g.action}`);
            }
          }

          // Show early returns
          if (earlyReturns.length > 0) {
            lines.push('');
            lines.push('*Early returns:*');
            for (const r of earlyReturns) {
              lines.push(`- Line ${r.line}: \`${r.condition}\` → ${r.action}`);
            }
          }

          // Show throws
          if (throws.length > 0) {
            lines.push('');
            lines.push('*Throws:*');
            for (const t of throws) {
              const condText = t.condition ? `\`${t.condition}\` → ` : '';
              lines.push(`- Line ${t.line}: ${condText}${t.action}`);
            }
          }

          // Show catch handlers
          if (catches.length > 0) {
            lines.push('');
            lines.push('*Error handlers:*');
            for (const c of catches) {
              lines.push(`- Line ${c.line}: \`${c.condition}\` → ${c.action}`);
            }
          }

          // Phase 6.7.4.4: Link to test files that cover error paths
          const testLinks = formatTestFileLinks(node, context);
          if (testLinks.length > 0) {
            lines.push('');
            lines.push('*Test coverage:*');
            lines.push(...testLinks);
          }
        }

        // Phase 6.7.3: Enhanced Call Flow - show for functions with cross-file calls
        const hasCrossCalls = (func.crossFileCalls?.length || 0) > 0;
        const hasCallers = (func.crossFileCalledBy?.length || 0) > 0;
        if (hasCrossCalls || hasCallers) {
          lines.push('');
          lines.push('**Call Flow:**');

          // Show what this function calls
          if (func.crossFileCalls && func.crossFileCalls.length > 0) {
            lines.push('');
            lines.push('*Calls:*');
            for (const callee of func.crossFileCalls) {
              lines.push(formatCallReference(callee, '→'));
            }
          }

          // Show what calls this function
          if (func.crossFileCalledBy && func.crossFileCalledBy.length > 0) {
            lines.push('');
            lines.push('*Called by:*');
            for (const caller of func.crossFileCalledBy) {
              lines.push(formatCallReference(caller, '←'));
            }
          }
        }
      }
    } else if (node.type === 'file' && node.raw.signature && node.raw.signature.length > 0) {
      // Fallback to simple signatures if no function details
      lines.push('');
      lines.push('**Functions:**');
      lines.push('```typescript');
      for (const sig of node.raw.signature) {
        lines.push(sig);
      }
      lines.push('```');
    }

    // Imports
    if (node.type === 'file' && node.raw.imports && node.raw.imports.length > 0) {
      lines.push('');
      lines.push('**Imports:**');
      for (const imp of node.raw.imports) {
        const names = imp.names?.join(', ') || 'default';
        lines.push(`- \`${names}\` from \`${imp.from}\``);
      }
    }

    // Edges (imports)
    const importEdges = node.edges.filter((e) => e.type === 'imports');
    if (importEdges.length > 0) {
      lines.push('');
      lines.push('**Imports (resolved):**');
      for (const edge of importEdges) {
        lines.push(`- ${edge.target}`);
      }
    }

    // Phase 6.3.2: Dependents (importedBy edges)
    const dependentEdges = node.edges.filter((e) => e.type === 'importedBy');
    if (dependentEdges.length > 0) {
      lines.push('');
      lines.push('**Dependents:**');
      for (const edge of dependentEdges) {
        lines.push(`- ${edge.target}`);
      }
    }

    // README for modules
    if (node.type === 'module' && node.raw.readme) {
      lines.push('');
      lines.push('**README:**');
      lines.push('');
      lines.push(node.raw.readme);
    }

    // Key files for modules
    if (node.type === 'module' && node.prose?.keyFiles) {
      lines.push('');
      lines.push('**Key Files:**');
      for (const file of node.prose.keyFiles) {
        lines.push(`- ${file}`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Errors section
  if (context.errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of context.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Change impact analysis result.
 * Phase 6.6.5: Exposes impact tree with affected functions and test files.
 */
export interface ChangeImpactResult extends ImpactTree {
  affectedFunctions: Record<string, AffectedFunction[]>;
  testFiles: TestFileImpact[];
}

/**
 * Format change impact analysis as markdown.
 * Phase 6.6.5.3: Add "Change Impact" section to output.
 *
 * @param sourceFileId - The file being changed
 * @param allNodes - All file nodes in the project
 * @param changedExports - Optional list of export names that changed
 * @returns Markdown string with impact analysis
 */
export function formatChangeImpactAsMarkdown(
  sourceFileId: string,
  allNodes: WikiNode[],
  changedExports?: string[]
): string {
  const lines: string[] = [];
  const nodeMap = new Map<string, WikiNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  // Build the impact tree
  const impact = buildImpactTree(sourceFileId, allNodes);

  lines.push('# Change Impact Analysis');
  lines.push('');
  lines.push(`**Source file:** \`${sourceFileId}\``);
  lines.push('');

  // Summary
  if (impact.totalAffectedFiles === 0) {
    lines.push('> No files depend on this file. Changes are isolated.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`**Total affected files:** ${impact.totalAffectedFiles}`);
  lines.push('');

  // Direct dependents
  if (impact.directDependents.length > 0) {
    lines.push('## Direct Dependents');
    lines.push('');
    lines.push('Files that directly import this file:');
    lines.push('');

    for (const depId of impact.directDependents) {
      const depNode = nodeMap.get(depId);
      lines.push(`### ${depId}`);

      // Phase 6.8.1.3: Show symbol-level usage with line numbers
      if (depNode) {
        const symbolUsages = getUsedSymbolsFromFile(depNode, sourceFileId, changedExports);
        if (symbolUsages.length > 0) {
          lines.push('');
          lines.push('**Symbols used from this file:**');
          for (const usage of symbolUsages) {
            const lineRefs = usage.usageLines.map((l) => `L${l}`).join(', ');
            lines.push(`- \`${usage.symbol}\` at ${lineRefs}`);
          }
        }
      }

      // Show affected functions if changedExports provided
      if (changedExports && changedExports.length > 0 && depNode) {
        const affected = findAffectedFunctions(depNode, changedExports);
        if (affected.length > 0) {
          lines.push('');
          lines.push('**Affected functions:**');
          for (const func of affected) {
            lines.push(`- \`${func.name}\` (lines ${func.startLine}-${func.endLine})`);
            lines.push(`  - Uses: ${func.usedSymbols.join(', ')}`);
          }
        }
      }
      lines.push('');
    }
  }

  // Transitive dependents
  if (impact.transitiveDependents.length > 0) {
    lines.push('## Transitive Dependents');
    lines.push('');
    lines.push('Files that indirectly depend on this file:');
    lines.push('');

    // Group by depth
    for (const [depth, deps] of Object.entries(impact.dependentsByDepth)) {
      if (parseInt(depth) > 1) {
        lines.push(`**Depth ${depth}:**`);
        for (const depId of deps) {
          lines.push(`- ${depId}`);
        }
        lines.push('');
      }
    }
  }

  // Test files to run
  const allAffectedFiles = [
    sourceFileId,
    ...impact.directDependents,
    ...impact.transitiveDependents,
  ];
  const testFiles = getTestFilesForImpact(allAffectedFiles, allNodes);

  if (testFiles.length > 0) {
    lines.push('## Test Files to Run');
    lines.push('');
    lines.push('Run these tests to verify changes:');
    lines.push('');
    lines.push('```bash');
    for (const test of testFiles) {
      if (test.testCommand) {
        lines.push(test.testCommand);
      } else {
        lines.push(`npm test -- ${test.path}`);
      }
    }
    lines.push('```');
    lines.push('');

    // Also list the test files
    lines.push('**Test files:**');
    for (const test of testFiles) {
      lines.push(`- ${test.path}`);
    }
    lines.push('');
  } else {
    lines.push('## Test Files to Run');
    lines.push('');
    lines.push('> No test files found for affected code.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create Express application with API routes.
 *
 * @param db - MangoDB database instance
 * @param generatorConfig - Optional LLM generator configuration for on-demand prose generation
 * @param fetchFn - Optional fetch function for testing
 * @returns Express application
 */
export function createApp(
  db: MangoDb,
  generatorConfig?: GeneratorConfig,
  fetchFn?: typeof fetch
): Express {
  const app = express();

  app.use(express.json());

  // GET /node/:path - Fetch a single node by path
  // Uses wildcard (*path) to capture paths with slashes like src/auth/login.ts
  // Express 5 returns wildcards as arrays, so we join them back into a path string
  app.get('/node/*path', async (req: Request, res: Response) => {
    try {
      const pathParts = req.params.path as unknown as string[];
      const nodePath = pathParts.join('/'); // Join array back into path string
      const proseParam = req.query.prose as string | undefined;

      const nodes = db.collection<WikiNode>('nodes');
      let node = await nodes.findOne({ id: nodePath });

      if (!node) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Node not found: ${nodePath}`,
        });
        return;
      }

      // On-demand prose generation
      // Generate prose if: node has no prose AND prose param is not 'false' AND generatorConfig is provided
      if (!node.prose && proseParam !== 'false' && generatorConfig) {
        try {
          const updatedNode = await generateProseForNode(nodePath, db, generatorConfig, fetchFn);
          if (updatedNode) {
            node = updatedNode;
          }
        } catch (error) {
          // Log error but return node without prose rather than failing the request
          console.error(`Failed to generate prose for ${nodePath}:`, (error as Error).message);
        }
      }

      res.json(node);
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  // GET /context?files=a,b,c - Get bundled context for multiple files
  app.get('/context', async (req: Request, res: Response) => {
    try {
      const files = req.query.files as string | undefined;
      const format = req.query.format as string | undefined;

      if (!files) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing required query parameter: files',
        });
        return;
      }

      const filePaths = files
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      if (filePaths.length === 0) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'No valid file paths provided',
        });
        return;
      }

      const context = await bundleContext(db, filePaths);

      if (format === 'json') {
        res.json(context);
      } else {
        // Default to markdown
        const markdown = formatContextAsMarkdown(context);
        res.type('text/markdown').send(markdown);
      }
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  // GET /impact/:path - Get change impact analysis for a file
  // Phase 6.6.5: Shows what files are affected by changes to this file
  app.get('/impact/*path', async (req: Request, res: Response) => {
    try {
      const pathParts = req.params.path as unknown as string[];
      const nodePath = pathParts.join('/');
      const format = req.query.format as string | undefined;
      const exportsParam = req.query.exports as string | undefined;

      const nodesCollection = db.collection<WikiNode>('nodes');

      // Check if the source file exists
      const sourceNode = await nodesCollection.findOne({ id: nodePath });
      if (!sourceNode) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Node not found: ${nodePath}`,
        });
        return;
      }

      // Get all file nodes for impact analysis
      const allNodes = await nodesCollection.find({ type: 'file' }).toArray();

      // Build impact tree
      const impact = buildImpactTree(nodePath, allNodes);

      // Get changed exports if provided
      const changedExports = exportsParam
        ? exportsParam.split(',').map((e) => e.trim())
        : undefined;

      // Find affected functions for each dependent
      const affectedFunctions: Record<string, AffectedFunction[]> = {};
      if (changedExports && changedExports.length > 0) {
        for (const depId of [...impact.directDependents, ...impact.transitiveDependents]) {
          const depNode = allNodes.find((n) => n.id === depId);
          if (depNode) {
            const affected = findAffectedFunctions(depNode, changedExports);
            if (affected.length > 0) {
              affectedFunctions[depId] = affected;
            }
          }
        }
      }

      // Get test files
      const allAffectedFiles = [
        nodePath,
        ...impact.directDependents,
        ...impact.transitiveDependents,
      ];
      const testFiles = getTestFilesForImpact(allAffectedFiles, allNodes);

      // Build result
      const result: ChangeImpactResult = {
        ...impact,
        affectedFunctions,
        testFiles,
      };

      if (format === 'markdown') {
        const markdown = formatChangeImpactAsMarkdown(nodePath, allNodes, changedExports);
        res.type('text/markdown').send(markdown);
      } else {
        res.json(result);
      }
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  // POST /refresh - Re-run extract + build for a project
  app.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Missing required field: projectPath',
        });
        return;
      }

      // Validate the path exists and is a directory (using async stat)
      let stats;
      try {
        stats = await stat(projectPath);
      } catch {
        res.status(400).json({
          error: 'INVALID_PATH',
          message: `Path does not exist: ${projectPath}`,
        });
        return;
      }

      if (!stats.isDirectory()) {
        res.status(400).json({
          error: 'INVALID_PATH',
          message: `Path is not a directory: ${projectPath}`,
        });
        return;
      }

      // TODO: Implement actual refresh logic by calling extract + build
      // For now, return success with placeholder message
      res.json({
        status: 'success',
        message: `Refresh triggered for ${projectPath}`,
        projectPath,
      });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: (error as Error).message,
      });
    }
  });

  return app;
}
