/**
 * Project Overview generation for Phase 7.3.
 * Overview-Based Navigation: Generate high-level project overview for LLM navigator.
 *
 * The overview provides the navigator LLM with:
 * - README content (project description)
 * - File tree structure
 * - Module summaries with key exports
 * - Entry points (fanIn=0 files like CLI)
 * - Key relationships (who imports what)
 */

import type { WikiNode } from '../builder/index.ts';

/**
 * High-level project overview for navigator LLM.
 * Contains all context needed to reason about file selection.
 */
export interface ProjectOverview {
  /** Truncated README content from root module */
  readme: string;

  /** Formatted file tree structure */
  fileTree: string;

  /** Module summaries with key exports */
  modules: ModuleInfo[];

  /** Entry points - files with fanIn=0 (like CLI, main) */
  entryPoints: EntryPoint[];

  /** Key import relationships showing who uses what */
  relationships: Relationship[];

  /** Phase 7.7.2.1: Config files in the project (package.json, tsconfig.json, etc.) */
  configFiles: string[];
}

/**
 * Summary of a module for overview purposes.
 */
export interface ModuleInfo {
  /** Module path (e.g., 'src/extractor/') */
  path: string;

  /** One-line summary from prose */
  summary: string;

  /** Key exports from this module */
  keyExports: string[];
}

/**
 * Entry point file (fanIn=0, often no exports).
 * These are orchestrators like CLI, main files.
 */
export interface EntryPoint {
  /** File path */
  path: string;

  /** Description of what this entry point does */
  description: string;
}

/**
 * Import relationship showing what a file imports.
 * Used to make "who uses what" visible to navigator.
 */
export interface Relationship {
  /** Source file path */
  from: string;

  /** List of imported symbols/functions */
  imports: string[];

  /** Number of files that depend on this file (for high-fanIn files) */
  consumerCount?: number;
}

/**
 * Build a high-level project overview from WikiNodes.
 *
 * @param nodes - All WikiNodes in the project
 * @returns ProjectOverview for navigator LLM
 */
export function buildProjectOverview(nodes: WikiNode[]): ProjectOverview {
  if (nodes.length === 0) {
    return {
      readme: '',
      fileTree: '',
      modules: [],
      entryPoints: [],
      relationships: [],
      configFiles: [],
    };
  }

  // Extract README from root or first module with readme
  const readme = extractReadme(nodes);

  // Build file tree from file nodes
  const fileTree = buildFileTree(nodes);

  // Extract module summaries
  const modules = extractModuleSummaries(nodes);

  // 7.3.2 - Entry points (fanIn=0 files that orchestrate)
  const entryPoints = extractEntryPoints(nodes);

  // 7.3.3 - Key relationships (who imports what)
  const relationships = extractRelationships(nodes);

  // 7.7.2.1 - Config files (package.json, tsconfig.json, etc.)
  const configFiles = extractConfigFiles(nodes);

  return {
    readme,
    fileTree,
    modules,
    entryPoints,
    relationships,
    configFiles,
  };
}

/**
 * Extract README content from module nodes.
 * Looks for root module or first module with readme.
 */
function extractReadme(nodes: WikiNode[]): string {
  // Find module nodes with readme
  const modulesWithReadme = nodes.filter(
    (n) => n.type === 'module' && n.raw?.readme && n.raw.readme.trim().length > 0
  );

  if (modulesWithReadme.length === 0) {
    return '';
  }

  // Prefer root/shortest path (likely the main README)
  modulesWithReadme.sort((a, b) => a.path.length - b.path.length);
  const readme = modulesWithReadme[0]!.raw?.readme || '';

  return readme;
}

/**
 * Build a file tree structure from file nodes.
 * Returns a formatted string showing directory hierarchy.
 */
function buildFileTree(nodes: WikiNode[]): string {
  const fileNodes = nodes.filter((n) => n.type === 'file');

  if (fileNodes.length === 0) {
    return '';
  }

  // Group files by directory
  const tree = new Map<string, string[]>();

  for (const node of fileNodes) {
    const parts = node.path.split('/');
    const filename = parts.pop() || node.path;
    const dir = parts.join('/') || '.';

    if (!tree.has(dir)) {
      tree.set(dir, []);
    }
    tree.get(dir)!.push(filename);
  }

  // Format as tree structure
  const lines: string[] = [];
  const sortedDirs = Array.from(tree.keys()).sort();

  for (const dir of sortedDirs) {
    lines.push(`${dir}/`);
    const files = tree.get(dir)!.sort();
    for (const file of files) {
      lines.push(`  ${file}`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract module summaries from module nodes.
 */
function extractModuleSummaries(nodes: WikiNode[]): ModuleInfo[] {
  const moduleNodes = nodes.filter((n) => n.type === 'module');

  return moduleNodes.map((node) => ({
    path: node.path,
    summary: node.prose?.summary || '',
    keyExports: node.prose?.keyExports || [],
  }));
}

/**
 * Check if a node is an entry point.
 * Entry points are files with fanIn=0 (nothing imports them) and few/no exports.
 * Examples: CLI entry points, main files, script runners.
 *
 * @param node - WikiNode to check
 * @returns true if node is an entry point
 */
export function isEntryPoint(node: WikiNode): boolean {
  // Must be a file node
  if (node.type !== 'file') {
    return false;
  }

  // Must have fanIn=0 or undefined (nothing imports it)
  const fanIn = node.metadata.fanIn;
  if (fanIn !== undefined && fanIn > 0) {
    return false;
  }

  // Must have few exports (0-1) - entry points orchestrate, don't export much
  // Files with 2+ exports are likely library modules, not entry points
  const exports = node.raw?.exports || [];
  if (exports.length > 1) {
    return false;
  }

  return true;
}

/**
 * Extract entry points from file nodes.
 * Entry points are files with fanIn=0 that orchestrate the application.
 */
function extractEntryPoints(nodes: WikiNode[]): EntryPoint[] {
  const entryPointNodes = nodes.filter(isEntryPoint);

  return entryPointNodes.map((node) => ({
    path: node.path,
    description: buildEntryPointDescription(node),
  }));
}

/**
 * Build a description for an entry point.
 * Uses prose summary if available, otherwise describes imports.
 */
function buildEntryPointDescription(node: WikiNode): string {
  // Use prose summary if available
  if (node.prose?.summary) {
    return node.prose.summary;
  }

  // Otherwise, describe what it imports
  const imports = node.raw?.imports || [];
  if (imports.length > 0) {
    const importedNames = imports
      .flatMap((imp) => {
        // Get the imported names or the module name
        if (imp.names && imp.names.length > 0) {
          return imp.names;
        }
        // Extract module name from path
        const moduleName = imp.from.split('/').pop()?.replace(/\.ts$/, '');
        return moduleName ? [moduleName] : [];
      })
      .slice(0, 5); // Limit to 5 names

    if (importedNames.length > 0) {
      return `Entry point that uses: ${importedNames.join(', ')}`;
    }
  }

  // Fallback
  return 'Application entry point';
}

/**
 * Extract key relationships for the overview.
 * Focuses on:
 * 1. What entry points import (for navigation context)
 * 2. High-fanIn files (widely used, important to know about)
 */
function extractRelationships(nodes: WikiNode[]): Relationship[] {
  const relationships: Relationship[] = [];

  // 1. Get imports from entry points (they orchestrate the app)
  const entryPointNodes = nodes.filter(isEntryPoint);
  for (const node of entryPointNodes) {
    const imports = extractImportNames(node);
    if (imports.length > 0) {
      relationships.push({
        from: node.path,
        imports,
      });
    }
  }

  // 2. Add high-fanIn files (widely used, threshold = 5)
  const HIGH_FAN_IN_THRESHOLD = 5;
  const highFanInNodes = nodes.filter(
    (n) => n.type === 'file' && (n.metadata.fanIn ?? 0) >= HIGH_FAN_IN_THRESHOLD
  );

  for (const node of highFanInNodes) {
    // Skip if already added as entry point
    if (relationships.some((r) => r.from === node.path)) {
      continue;
    }

    // For high-fanIn files, show their exports (what they provide)
    const exports = node.raw?.exports?.map((e) => e.name) || [];
    if (exports.length > 0) {
      relationships.push({
        from: node.path,
        imports: exports, // Note: "imports" field used to show what this file provides
        consumerCount: node.metadata.fanIn,
      });
    }
  }

  return relationships;
}

/**
 * Extract all imported symbol names from a node.
 */
function extractImportNames(node: WikiNode): string[] {
  const imports = node.raw?.imports || [];
  const names: string[] = [];

  for (const imp of imports) {
    if (imp.names && imp.names.length > 0) {
      names.push(...imp.names);
    }
  }

  return names;
}

/**
 * Phase 7.7.2.1: Extract config file names from the project.
 * Looks for common config files in module raw data.
 */
function extractConfigFiles(nodes: WikiNode[]): string[] {
  const configFilePatterns = [
    'package.json',
    'tsconfig.json',
    'pith.config.json',
    '.env',
    '.env.example',
    'jest.config.js',
    'jest.config.ts',
    'vitest.config.ts',
    'vitest.config.js',
    'eslint.config.js',
    '.eslintrc.json',
    '.eslintrc.js',
    'prettier.config.js',
    '.prettierrc',
    '.prettierrc.json',
    'tsup.config.ts',
    'tsup.config.js',
    'vite.config.ts',
    'vite.config.js',
    'webpack.config.js',
    'rollup.config.js',
    'babel.config.js',
    '.babelrc',
  ];

  const foundConfigs: string[] = [];

  // Look in module nodes for config files mentioned in raw data
  for (const node of nodes) {
    if (node.type === 'module' && node.raw?.configFiles) {
      // If module has configFiles field, add them
      foundConfigs.push(...(node.raw.configFiles as string[]));
    }
  }

  // Also look at file nodes for config files at root
  for (const node of nodes) {
    if (node.type === 'file') {
      const filename = node.name || node.path.split('/').pop() || '';
      if (configFilePatterns.some((pattern) => filename === pattern)) {
        if (!foundConfigs.includes(filename)) {
          foundConfigs.push(filename);
        }
      }
    }
  }

  return foundConfigs.sort();
}
