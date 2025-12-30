import { basename } from 'node:path';
import type { MangoDb } from '@jkershaw/mangodb';
import type { ExtractedFile, Import, Export, FunctionData, KeyStatement } from '../extractor/ast.js';
import type { Commit } from '../extractor/git.js';
import type { JSDoc } from '../extractor/docs.js';
import type { ProseData } from '../generator/index.js';
import type { ErrorPath } from '../extractor/errors.js';

// Re-export types for testing
export type { FunctionData };

/**
 * Edge between wiki nodes.
 */
export interface Edge {
  type: 'contains' | 'imports' | 'calls' | 'co-changes' | 'parent' | 'testFile' | 'importedBy';
  target: string;
  weight?: number;
}

/**
 * Impact tree showing what files are affected by changes to a source file.
 * Phase 6.6.5: Change Impact Analysis
 */
export interface ImpactTree {
  sourceFile: string;
  directDependents: string[];
  transitiveDependents: string[];
  totalAffectedFiles: number;
  dependentsByDepth: Record<number, string[]>;
}

/**
 * Information about an affected function.
 * Phase 6.6.5.2: Function-level impact
 */
export interface AffectedFunction {
  name: string;
  startLine: number;
  endLine: number;
  usedSymbols: string[];
}

/**
 * Test file information for impact analysis.
 * Phase 6.6.5.4: Test file impact
 */
export interface TestFileImpact {
  path: string;
  testCommand?: string;
}

/**
 * Function details with line numbers for wiki output.
 */
export interface FunctionDetails {
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
  isAsync: boolean;
  isExported: boolean;
  codeSnippet: string;  // First N lines of function source (Phase 6.6.1.2)
  keyStatements: KeyStatement[];  // Important statements extracted via AST (Phase 6.6.1.3)
  calls: string[];  // Names of functions called within this function (Phase 6.6.7a.3)
  calledBy: string[];  // Names of functions that call this function (Phase 6.6.7a.4)
  errorPaths: ErrorPath[];  // Error handling paths (Phase 6.6.8)
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
    // Test command (Phase 6.2.4)
    testCommand?: string;
    // Line location (Phase 6.6.1 - for function nodes)
    startLine?: number;
    endLine?: number;
  };
  edges: Edge[];
  raw: {
    signature?: string[];
    jsdoc?: Record<string, JSDoc>;
    imports?: Import[];
    exports?: Export[];
    recentCommits?: Commit[];
    readme?: string;
    functions?: FunctionDetails[];  // Phase 6.6.1 - function details with line numbers
    patterns?: import('../extractor/patterns.ts').DetectedPattern[];  // Phase 6.6.6 - detected design patterns
  };
  prose?: ProseData;  // Generated prose from LLM
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
  const metadata: WikiNode['metadata'] = {
    lines: extracted.lines,
    commits: extracted.git?.commitCount ?? 0,
    lastModified: extracted.git?.lastModified ?? new Date(),
    createdAt: extracted.git?.createdAt,
    authors: extracted.git?.authors ?? [],
  };

  // Step 6.2.4: Add test command for test files
  if (isTestFile(extracted.path)) {
    metadata.testCommand = `npm test -- ${extracted.path}`;
  }

  // Step 2.1.8: Extract function signatures
  const signature = extracted.functions.map((f) => f.signature);

  // Step 6.6.1: Extract function details with line numbers, code snippets, and key statements
  // Step 6.6.7a: Add calls and compute calledBy
  // Step 6.6.8: Add error paths
  const functions: FunctionDetails[] = extracted.functions.map((f) => ({
    name: f.name,
    signature: f.signature,
    startLine: f.startLine,
    endLine: f.endLine,
    isAsync: f.isAsync,
    isExported: f.isExported,
    codeSnippet: f.codeSnippet,
    keyStatements: f.keyStatements,
    calls: f.calls,  // Phase 6.6.7a.3
    calledBy: [],  // Will be computed below
    errorPaths: f.errorPaths,  // Phase 6.6.8
  }));

  // Phase 6.6.7a.4: Compute calledBy from calls
  for (const func of functions) {
    for (const calledFuncName of func.calls) {
      const calledFunc = functions.find((f) => f.name === calledFuncName);
      if (calledFunc && !calledFunc.calledBy.includes(func.name)) {
        calledFunc.calledBy.push(func.name);
      }
    }
  }

  // Step 2.1.9: Copy JSDoc
  const jsdoc = extracted.docs?.jsdoc;

  // Step 2.1.10: Copy imports
  const imports = extracted.imports;

  // Step 2.1.11: Copy exports
  const exports = extracted.exports;

  // Step 2.1.12: Copy recent commits
  const recentCommits = extracted.git?.recentCommits;

  // Phase 6.6.6: Copy detected patterns
  const patterns = extracted.patterns;

  return {
    id,
    type: 'file',
    path: extracted.path,
    name,
    metadata,
    edges: [], // Will be populated in Phase 2.4
    raw: {
      signature: signature.length > 0 ? signature : undefined,
      functions: functions.length > 0 ? functions : undefined,
      jsdoc,
      imports: imports.length > 0 ? imports : undefined,
      exports: exports.length > 0 ? exports : undefined,
      recentCommits,
      patterns,  // Phase 6.6.6
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
export function shouldCreateFunctionNode(func: FunctionData): boolean {
  // Step 2.2.1: Create nodes for exported functions only
  return func.isExported;
}

/**
 * Build a function node from extracted data.
 * @param extracted - The extracted file data
 * @param func - The function data
 * @returns A WikiNode for the function
 */
export function buildFunctionNode(extracted: ExtractedFile, func: FunctionData): WikiNode {
  // Step 2.2.3: Generate ID (file:function)
  const id = `${extracted.path}:${func.name}`;

  // Step 2.2.2: Set name to function name
  const name = func.name;

  // Build metadata with line numbers (Phase 6.6.1)
  const lines = func.endLine - func.startLine + 1;
  const metadata: WikiNode['metadata'] = {
    lines,
    commits: extracted.git?.commitCount ?? 0,
    lastModified: extracted.git?.lastModified ?? new Date(),
    createdAt: extracted.git?.createdAt,
    authors: extracted.git?.authors ?? [],
    startLine: func.startLine,
    endLine: func.endLine,
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

/**
 * Check if a file path represents a test file.
 * Step 6.2.1: Detect test files by extension or directory.
 * @param path - The file path to check
 * @returns True if the file is a test file
 */
export function isTestFile(path: string): boolean {
  // Check if file ends with .test.ts or .spec.ts
  if (path.endsWith('.test.ts') || path.endsWith('.spec.ts')) {
    return true;
  }

  // Check if file is in a __tests__ directory
  if (path.includes('__tests__/')) {
    return true;
  }

  return false;
}

/**
 * Build testFile edges from source files to their corresponding test files.
 * Step 6.2.2: Create edges from source to test files.
 * @param fileNodes - Array of all file nodes
 * @returns Array of edges with source node ID and target test file ID
 */
export function buildTestFileEdges(fileNodes: WikiNode[]): Array<Edge & { sourceId: string }> {
  const edges: Array<Edge & { sourceId: string }> = [];

  // Create a map of test files for quick lookup
  const testFileMap = new Map<string, WikiNode>();
  for (const node of fileNodes) {
    if (isTestFile(node.path)) {
      testFileMap.set(node.id, node);
    }
  }

  // For each source file, find its corresponding test file
  for (const node of fileNodes) {
    // Skip if this is already a test file
    if (isTestFile(node.path)) {
      continue;
    }

    // Try different test file patterns
    const basePath = node.path.replace(/\.ts$/, '');
    const dirPath = node.path.substring(0, node.path.lastIndexOf('/'));
    const fileName = node.path.substring(node.path.lastIndexOf('/') + 1).replace(/\.ts$/, '');

    // Pattern 1: foo.ts → foo.test.ts
    const testPattern1 = `${basePath}.test.ts`;
    if (testFileMap.has(testPattern1)) {
      edges.push({
        type: 'testFile',
        target: testPattern1,
        sourceId: node.id,
      });
      continue;
    }

    // Pattern 2: foo.ts → foo.spec.ts
    const testPattern2 = `${basePath}.spec.ts`;
    if (testFileMap.has(testPattern2)) {
      edges.push({
        type: 'testFile',
        target: testPattern2,
        sourceId: node.id,
      });
      continue;
    }

    // Pattern 3: foo.ts → __tests__/foo.test.ts
    const testPattern3 = `${dirPath}/__tests__/${fileName}.test.ts`;
    if (testFileMap.has(testPattern3)) {
      edges.push({
        type: 'testFile',
        target: testPattern3,
        sourceId: node.id,
      });
      continue;
    }

    // Pattern 4: foo.ts → __tests__/foo.spec.ts
    const testPattern4 = `${dirPath}/__tests__/${fileName}.spec.ts`;
    if (testFileMap.has(testPattern4)) {
      edges.push({
        type: 'testFile',
        target: testPattern4,
        sourceId: node.id,
      });
    }
  }

  return edges;
}

/**
 * Build importedBy edges (reverse of imports) to show which files depend on a given file.
 * Step 6.3.1: Create edges from files to their dependents (files that import them).
 * @param fileNodes - Array of all file nodes
 * @returns Array of importedBy edges with source node ID
 */
export function buildDependentEdges(fileNodes: WikiNode[]): Array<Edge & { sourceId: string }> {
  const edges: Array<Edge & { sourceId: string }> = [];

  // For each file that is imported by others
  for (const importedNode of fileNodes) {
    // Find all files that import this one
    for (const importingNode of fileNodes) {
      // Skip self-references
      if (importingNode.id === importedNode.id) {
        continue;
      }

      // Check if importingNode imports importedNode
      const hasImportEdge = importingNode.edges.some(
        edge => edge.type === 'imports' && edge.target === importedNode.id
      );

      if (hasImportEdge) {
        // Create reverse edge: importedNode → importingNode (with type 'importedBy')
        edges.push({
          type: 'importedBy',
          target: importingNode.id,
          sourceId: importedNode.id,
        });
      }
    }
  }

  return edges;
}

/**
 * Build a transitive impact tree showing all files affected by changes to a source file.
 * Step 6.6.5.1: Traverse importedBy edges recursively to build full impact tree.
 * @param sourceFileId - The ID of the file being changed
 * @param allNodes - Array of all file nodes in the project
 * @param maxDepth - Maximum depth to traverse (default 10, prevents runaway on very deep graphs)
 * @returns An ImpactTree with direct and transitive dependents
 */
export function buildImpactTree(
  sourceFileId: string,
  allNodes: WikiNode[],
  maxDepth: number = 10
): ImpactTree {
  // Create a map for quick node lookup
  const nodeMap = new Map<string, WikiNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  const visited = new Set<string>();
  const directDependents: string[] = [];
  const transitiveDependents: string[] = [];
  const dependentsByDepth: Record<number, string[]> = {};

  // BFS to find all dependents with depth tracking
  const queue: Array<{ nodeId: string; depth: number }> = [];

  // Get the source node
  const sourceNode = nodeMap.get(sourceFileId);
  if (!sourceNode) {
    return {
      sourceFile: sourceFileId,
      directDependents: [],
      transitiveDependents: [],
      totalAffectedFiles: 0,
      dependentsByDepth: {},
    };
  }

  // Add the source to visited (don't count it as affected)
  visited.add(sourceFileId);

  // Find direct dependents (depth 1)
  const importedByEdges = sourceNode.edges.filter(e => e.type === 'importedBy');
  for (const edge of importedByEdges) {
    if (!visited.has(edge.target)) {
      queue.push({ nodeId: edge.target, depth: 1 });
      visited.add(edge.target);
    }
  }

  // Process the queue
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    // Track by depth
    if (!dependentsByDepth[depth]) {
      dependentsByDepth[depth] = [];
    }
    dependentsByDepth[depth].push(nodeId);

    // Categorize as direct or transitive
    if (depth === 1) {
      directDependents.push(nodeId);
    } else {
      transitiveDependents.push(nodeId);
    }

    // Don't go beyond max depth
    if (depth >= maxDepth) {
      continue;
    }

    // Find this node's dependents
    const dependentNode = nodeMap.get(nodeId);
    if (dependentNode) {
      const theirDependents = dependentNode.edges.filter(e => e.type === 'importedBy');
      for (const edge of theirDependents) {
        if (!visited.has(edge.target)) {
          queue.push({ nodeId: edge.target, depth: depth + 1 });
          visited.add(edge.target);
        }
      }
    }
  }

  return {
    sourceFile: sourceFileId,
    directDependents,
    transitiveDependents,
    totalAffectedFiles: directDependents.length + transitiveDependents.length,
    dependentsByDepth,
  };
}

/**
 * Find functions in a dependent file that use symbols from the changed file.
 * Step 6.6.5.2: For each affected file, identify functions that use changed entity.
 * @param dependentNode - The file node that depends on the changed file
 * @param changedExports - Names of exports from the changed file
 * @returns Array of affected functions with the symbols they use
 */
export function findAffectedFunctions(
  dependentNode: WikiNode,
  changedExports: string[]
): AffectedFunction[] {
  const affected: AffectedFunction[] = [];

  // No functions to check
  if (!dependentNode.raw.functions || dependentNode.raw.functions.length === 0) {
    return affected;
  }

  // Check each function's code snippet for usage of changed exports
  for (const func of dependentNode.raw.functions) {
    const usedSymbols: string[] = [];

    // Check if any of the changed exports appear in the function's code
    for (const exportName of changedExports) {
      // Look for the symbol in the code snippet
      // Use word boundary matching to avoid partial matches
      const regex = new RegExp(`\\b${exportName}\\b`);
      if (regex.test(func.codeSnippet)) {
        usedSymbols.push(exportName);
      }
    }

    // If this function uses any of the changed exports, add it to affected list
    if (usedSymbols.length > 0) {
      affected.push({
        name: func.name,
        startLine: func.startLine,
        endLine: func.endLine,
        usedSymbols,
      });
    }
  }

  return affected;
}

/**
 * Get test files that cover the affected source files.
 * Step 6.6.5.4: Include test file impact (which tests touch this code).
 * @param affectedFiles - Array of affected source file IDs
 * @param allNodes - Array of all file nodes
 * @returns Array of test file information
 */
export function getTestFilesForImpact(
  affectedFiles: string[],
  allNodes: WikiNode[]
): TestFileImpact[] {
  const testFiles: TestFileImpact[] = [];
  const seenTestFiles = new Set<string>();

  // Create a map for quick node lookup
  const nodeMap = new Map<string, WikiNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  // For each affected file, find its test files
  for (const fileId of affectedFiles) {
    const node = nodeMap.get(fileId);
    if (!node) continue;

    // Find testFile edges
    const testEdges = node.edges.filter(e => e.type === 'testFile');
    for (const edge of testEdges) {
      // Avoid duplicates
      if (seenTestFiles.has(edge.target)) continue;
      seenTestFiles.add(edge.target);

      // Get test file node for metadata
      const testNode = nodeMap.get(edge.target);
      testFiles.push({
        path: edge.target,
        testCommand: testNode?.metadata.testCommand,
      });
    }
  }

  return testFiles;
}
