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
    };
  }

  // Extract README from root or first module with readme
  const readme = extractReadme(nodes);

  // Build file tree from file nodes
  const fileTree = buildFileTree(nodes);

  // Extract module summaries
  const modules = extractModuleSummaries(nodes);

  // TODO: 7.3.2 - Entry points
  const entryPoints: EntryPoint[] = [];

  // TODO: 7.3.3 - Relationships
  const relationships: Relationship[] = [];

  return {
    readme,
    fileTree,
    modules,
    entryPoints,
    relationships,
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
  const readme = modulesWithReadme[0].raw?.readme || '';

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
