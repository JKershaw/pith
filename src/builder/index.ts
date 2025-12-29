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
    authors: string[];
  };
  edges: Edge[];
  raw: {
    signature?: string[];
    jsdoc?: Record<string, JSDoc>;
    imports?: Import[];
    exports?: Export[];
    recentCommits?: Commit[];
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
