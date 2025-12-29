import { basename } from 'node:path';
import type { MangoDb } from '@jkershaw/mangodb';
import type { ExtractedFile, Import, Export, Function } from '../extractor/ast.ts';
import type { Commit } from '../extractor/git.ts';
import type { JSDoc } from '../extractor/docs.ts';

// Re-export types for testing
export type { Function };

/**
 * Edge between wiki nodes.
 */
export interface Edge {
  type: 'contains' | 'imports' | 'calls' | 'co-changes' | 'parent';
  target: string;
  weight?: number;
}

/**
 * Wiki node representing a file, function, or module.
 */
export interface WikiNode {
  id: string;
  type: 'file' | 'function' | 'module';
  path: string;
  name: string;
  metadata: {
    lines: number;
    commits: number;
    lastModified: Date;
    createdAt?: Date;
    authors: string[];
    // Computed metadata (Phase 2.5)
    fanIn?: number;
    fanOut?: number;
    ageInDays?: number;
    recencyInDays?: number;
  };
  edges: Edge[];
  raw: {
    signature?: string[];
    jsdoc?: Record<string, JSDoc>;
    imports?: Import[];
    exports?: Export[];
    recentCommits?: Commit[];
    readme?: string;
  };
}

/**
 * Build a file node from extracted data.
 * @param extracted - The extracted file data
 * @returns A WikiNode for the file
 */
export function buildFileNode(extracted: ExtractedFile): WikiNode {
  // Step 2.1.2: Generate ID from path
  const id = extracted.path;

  // Step 2.1.3: Extract name (basename)
  const name = basename(extracted.path);

  // Step 2.1.4-2.1.7: Build metadata
  const metadata = {
    lines: extracted.lines,
    commits: extracted.git?.commitCount ?? 0,
    lastModified: extracted.git?.lastModified ?? new Date(),
    createdAt: extracted.git?.createdAt,
    authors: extracted.git?.authors ?? [],
  };

  // Step 2.1.8: Extract function signatures
  const signature = extracted.functions.map((f) => f.signature);

  // Step 2.1.9: Copy JSDoc
  const jsdoc = extracted.docs?.jsdoc;

  // Step 2.1.10: Copy imports
  const imports = extracted.imports;

  // Step 2.1.11: Copy exports
  const exports = extracted.exports;

  // Step 2.1.12: Copy recent commits
  const recentCommits = extracted.git?.recentCommits;

  return {
    id,
    type: 'file',
    path: extracted.path,
    name,
    metadata,
    edges: [], // Will be populated in Phase 2.4
    raw: {
      signature: signature.length > 0 ? signature : undefined,
      jsdoc,
      imports: imports.length > 0 ? imports : undefined,
      exports: exports.length > 0 ? exports : undefined,
      recentCommits,
    },
  };
}

/**
 * Store file nodes in the database.
 * @param db - The MangoDB database instance
 * @param nodes - Array of WikiNodes to store
 */
export async function storeFileNodes(db: MangoDb, nodes: WikiNode[]): Promise<void> {
  const collection = db.collection<WikiNode>('nodes');

  for (const node of nodes) {
    await collection.updateOne({ id: node.id }, { $set: node }, { upsert: true });
  }
}

/**
 * Check if a function node should be created for a function.
 * @param func - The function data
 * @returns True if the function is exported
 */
export function shouldCreateFunctionNode(func: Function): boolean {
  // Step 2.2.1: Create nodes for exported functions only
  return func.isExported;
}

/**
 * Build a function node from extracted data.
 * @param extracted - The extracted file data
 * @param func - The function data
 * @returns A WikiNode for the function
 */
export function buildFunctionNode(extracted: ExtractedFile, func: Function): WikiNode {
  // Step 2.2.3: Generate ID (file:function)
  const id = `${extracted.path}:${func.name}`;

  // Step 2.2.2: Set name to function name
  const name = func.name;

  // Build metadata
  const lines = func.endLine - func.startLine + 1;
  const metadata = {
    lines,
    commits: extracted.git?.commitCount ?? 0,
    lastModified: extracted.git?.lastModified ?? new Date(),
    createdAt: extracted.git?.createdAt,
    authors: extracted.git?.authors ?? [],
  };

  // Step 2.2.4: Copy function signature
  const signature = [func.signature];

  // Step 2.2.5: Copy function's JSDoc if exists
  const jsdoc =
    extracted.docs?.jsdoc && extracted.docs.jsdoc[func.name]
      ? { [func.name]: extracted.docs.jsdoc[func.name] }
      : undefined;

  return {
    id,
    type: 'function',
    path: extracted.path,
    name,
    metadata,
    edges: [], // Will be populated in Phase 2.4
    raw: {
      signature,
      jsdoc,
    },
  };
}

/**
 * Store function nodes in the database.
 * @param db - The MangoDB database instance
 * @param nodes - Array of WikiNodes to store
 */
export async function storeFunctionNodes(db: MangoDb, nodes: WikiNode[]): Promise<void> {
  const collection = db.collection<WikiNode>('nodes');

  for (const node of nodes) {
    await collection.updateOne({ id: node.id }, { $set: node }, { upsert: true });
  }
}

/**
 * Check if a module node should be created for a directory.
 * @param files - Array of file paths in the directory
 * @returns True if directory has index.ts or 3+ files
 */
export function shouldCreateModuleNode(files: string[]): boolean {
  // Step 2.3.1 & 2.3.2: Create module node if directory has index.ts OR 3+ files
  const hasIndexTs = files.some((file) => basename(file) === 'index.ts');
  const hasThreeOrMoreFiles = files.length >= 3;

  return hasIndexTs || hasThreeOrMoreFiles;
}

/**
 * Build a module node from directory information.
 * @param dirPath - The directory path
 * @param files - Array of file paths in the directory
 * @param readme - Optional README content
 * @returns A WikiNode for the module
 */
export function buildModuleNode(dirPath: string, files: string[], readme?: string): WikiNode {
  // Step 2.3.3: Generate ID from directory path
  const id = dirPath;

  // Step 2.3.3: Extract name (directory basename)
  const name = basename(dirPath);

  // Build metadata (aggregated from files, but for now with defaults)
  // In a real implementation, we would aggregate from child file nodes
  const metadata = {
    lines: 0,
    commits: 0,
    lastModified: new Date(),
    authors: [],
  };

  // Step 2.3.4: Copy README if exists
  const raw: WikiNode['raw'] = {};
  if (readme !== undefined) {
    raw.readme = readme;
  }

  return {
    id,
    type: 'module',
    path: dirPath,
    name,
    metadata,
    edges: [], // Will be populated in Phase 2.4
    raw,
  };
}

/**
 * Store module nodes in the database.
 * @param db - The MangoDB database instance
 * @param nodes - Array of WikiNodes to store
 */
export async function storeModuleNodes(db: MangoDb, nodes: WikiNode[]): Promise<void> {
  const collection = db.collection<WikiNode>('nodes');

  for (const node of nodes) {
    await collection.updateOne({ id: node.id }, { $set: node }, { upsert: true });
  }
}

/**
 * Build contains edges from a parent node to child nodes.
 * Supports both module → file and file → function relationships.
 * @param parentNode - The parent node (module or file)
 * @param childNodes - Array of child nodes (files or functions)
 * @returns Array of contains edges
 */
export function buildContainsEdges(parentNode: WikiNode, childNodes: WikiNode[]): Edge[] {
  return childNodes.map((child) => ({
    type: 'contains' as const,
    target: child.id,
  }));
}

/**
 * Build import edges from a file to other files it imports.
 * Resolves relative import paths to absolute file paths.
 * @param fileNode - The file node with imports
 * @param allFilePaths - Array of all file paths in the project
 * @returns Array of import edges
 */
export function buildImportEdges(fileNode: WikiNode, allFilePaths: string[]): Edge[] {
  if (!fileNode.raw.imports) {
    return [];
  }

  const edges: Edge[] = [];
  const fileDir = fileNode.path.substring(0, fileNode.path.lastIndexOf('/'));

  for (const imp of fileNode.raw.imports) {
    // Skip node modules and external packages
    if (!imp.from.startsWith('.')) {
      continue;
    }

    // Resolve relative path to absolute
    const resolvedPath = resolveImportPath(fileDir, imp.from, allFilePaths);
    if (resolvedPath) {
      edges.push({
        type: 'imports',
        target: resolvedPath,
      });
    }
  }

  return edges;
}

/**
 * Resolve a relative import path to an absolute file path.
 * @param fileDir - Directory of the importing file
 * @param importFrom - The import path (e.g., './session', '../utils/hash')
 * @param allFilePaths - Array of all file paths in the project
 * @returns Resolved file path or null if not found
 */
function resolveImportPath(fileDir: string, importFrom: string, allFilePaths: string[]): string | null {
  // Handle relative paths
  let candidatePath: string;

  if (importFrom.startsWith('./')) {
    // Same directory
    candidatePath = `${fileDir}/${importFrom.substring(2)}`;
  } else if (importFrom.startsWith('../')) {
    // Parent directory
    const parts = fileDir.split('/');
    const importParts = importFrom.split('/');

    // Count how many levels up we need to go
    let upLevels = 0;
    for (const part of importParts) {
      if (part === '..') {
        upLevels++;
      } else {
        break;
      }
    }

    // Build the base path
    const baseParts = parts.slice(0, -upLevels);
    const remainingParts = importParts.slice(upLevels);
    candidatePath = [...baseParts, ...remainingParts].join('/');
  } else {
    return null;
  }

  // Try to match against known file paths
  // Try with .ts extension first
  const withTs = `${candidatePath}.ts`;
  if (allFilePaths.includes(withTs)) {
    return withTs;
  }

  // Try exact match
  if (allFilePaths.includes(candidatePath)) {
    return candidatePath;
  }

  // Try as directory with index.ts
  const withIndex = `${candidatePath}/index.ts`;
  if (allFilePaths.includes(withIndex)) {
    return withIndex;
  }

  return null;
}

/**
 * Build a parent edge from a file to its containing module.
 * @param fileNode - The file node
 * @param moduleNode - The parent module node
 * @returns Parent edge
 */
export function buildParentEdge(fileNode: WikiNode, moduleNode: WikiNode): Edge {
  return {
    type: 'parent',
    target: moduleNode.id,
  };
}

/**
 * Calculate fan-in (number of incoming import edges) for a node.
 * Step 2.5.1: Count how many nodes import this one.
 * @param nodeId - The ID of the node to calculate fan-in for
 * @param allNodes - Array of all nodes in the graph
 * @returns The number of nodes that import this node
 */
export function calculateFanIn(nodeId: string, allNodes: WikiNode[]): number {
  let count = 0;
  for (const node of allNodes) {
    for (const edge of node.edges) {
      if (edge.type === 'imports' && edge.target === nodeId) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Calculate fan-out (number of outgoing import edges) for a node.
 * Step 2.5.2: Count how many files this node imports.
 * @param node - The node to calculate fan-out for
 * @returns The number of imports from this node
 */
export function calculateFanOut(node: WikiNode): number {
  return node.edges.filter((edge) => edge.type === 'imports').length;
}

/**
 * Calculate age in days since creation.
 * Step 2.5.3: Calculate days between createdAt and now.
 * @param createdAt - The creation date
 * @param now - The current date (defaults to Date.now())
 * @returns The number of days since creation
 */
export function calculateAge(createdAt: Date, now: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / msPerDay);
}

/**
 * Calculate recency in days since last modification.
 * Step 2.5.4: Calculate days between lastModified and now.
 * @param lastModified - The last modification date
 * @param now - The current date (defaults to Date.now())
 * @returns The number of days since last modification
 */
export function calculateRecency(lastModified: Date, now: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = now.getTime() - lastModified.getTime();
  return Math.floor(diffMs / msPerDay);
}

/**
 * Compute all metadata fields for a collection of nodes.
 * Step 2.5.5: Add computed metadata to all nodes in place.
 * @param nodes - Array of nodes to compute metadata for
 * @param now - The current date (defaults to Date.now())
 */
export function computeMetadata(nodes: WikiNode[], now: Date = new Date()): void {
  // Compute metadata for each node
  for (const node of nodes) {
    // Calculate fan-in (how many nodes import this one)
    node.metadata.fanIn = calculateFanIn(node.id, nodes);

    // Calculate fan-out (how many nodes this one imports)
    node.metadata.fanOut = calculateFanOut(node);

    // Calculate age (days since creation) if createdAt is available
    if (node.metadata.createdAt) {
      node.metadata.ageInDays = calculateAge(node.metadata.createdAt, now);
    }

    // Calculate recency (days since last modification)
    node.metadata.recencyInDays = calculateRecency(node.metadata.lastModified, now);
  }
}
