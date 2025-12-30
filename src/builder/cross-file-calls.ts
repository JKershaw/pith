/**
 * Cross-file call graph builder (Phase 6.6.7b).
 * Resolves imported symbols and builds call graphs across files.
 */

import type { WikiNode } from './index.ts';
import type { Import } from '../extractor/ast.ts';
import { join, dirname } from 'node:path';

/**
 * Resolved symbol location.
 */
export interface ResolvedSymbol {
  sourceFile: string;  // The file path where the symbol is defined
  symbolName: string;  // The name of the symbol in that file (may differ due to aliasing)
}

/**
 * Map of imported symbol names to their source location.
 */
export interface ImportSymbolMap {
  [symbolName: string]: ResolvedSymbol;
}

/**
 * Cross-file function call.
 */
export interface CrossFileCall {
  caller: string;      // 'file.ts:functionName'
  callee: string;      // 'otherFile.ts:functionName'
  importedAs?: string; // The name used when importing (may differ due to aliasing)
}

/**
 * Cross-file call graph: maps function IDs to their cross-file calls.
 */
export interface CrossFileCallGraph {
  [functionId: string]: CrossFileCall[];
}

/**
 * Maximum depth for following re-export chains (prevents infinite loops).
 */
const MAX_REEXPORT_DEPTH = 5;

/**
 * Build a map of file paths for quick lookup.
 * @param allNodes - All file nodes in the project
 * @returns Map from file path to node id
 */
function buildFilePathMap(allNodes: WikiNode[]): Map<string, string> {
  const filePathMap = new Map<string, string>();
  for (const node of allNodes) {
    if (node.type === 'file') {
      filePathMap.set(node.path, node.id);
    }
  }
  return filePathMap;
}

/**
 * Resolve a relative import path to an absolute file path.
 * @param importingFile - The file doing the import
 * @param importPath - The import path (e.g., './utils', '../helpers/format')
 * @param filePathMap - Pre-built map of file paths for O(1) lookup
 * @returns Resolved file path or null if not found
 */
function resolveImportPath(
  importingFile: string,
  importPath: string,
  filePathMap: Map<string, string>
): string | null {
  // Skip non-relative imports (node_modules, etc.)
  if (!importPath.startsWith('.')) {
    return null;
  }

  // Get directory of importing file
  const importingDir = dirname(importingFile);

  // Resolve the relative path
  let resolvedPath = join(importingDir, importPath);

  // Normalize path separators (join uses OS-specific separators, we want forward slashes)
  resolvedPath = resolvedPath.split('\\').join('/');

  // Try different extensions
  const candidates = [
    resolvedPath + '.ts',
    resolvedPath,
    resolvedPath + '/index.ts',
  ];

  for (const candidate of candidates) {
    if (filePathMap.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve an imported symbol to its source file.
 * Step 6.6.7b.1: Map `import X from './y'` → `y.ts:X`
 * @param symbolName - The name of the symbol being resolved
 * @param importStmt - The import statement that imports this symbol
 * @param importingFile - The file doing the import
 * @param allNodes - All file nodes in the project
 * @param filePathMap - Pre-built map of file paths (optional, built if not provided)
 * @returns Resolved symbol location or null if not found/not applicable
 */
export function resolveImportedSymbol(
  symbolName: string,
  importStmt: Import,
  importingFile: string,
  allNodes: WikiNode[],
  filePathMap?: Map<string, string>
): ResolvedSymbol | null {
  // Skip type-only imports (Step 6.6.7b.1)
  if (importStmt.isTypeOnly) {
    return null;
  }

  // Skip node_modules imports (Step 6.6.7b.1)
  if (!importStmt.from.startsWith('.')) {
    return null;
  }

  // Build file path map if not provided
  const pathMap = filePathMap ?? buildFilePathMap(allNodes);

  // Resolve the import path to an actual file
  const resolvedFile = resolveImportPath(importingFile, importStmt.from, pathMap);
  if (!resolvedFile) {
    return null;
  }

  // Check if this is a default import
  if (importStmt.defaultName === symbolName) {
    return {
      sourceFile: resolvedFile,
      symbolName: 'default',
    };
  }

  // Check if this is a named import
  if (importStmt.names.includes(symbolName)) {
    return {
      sourceFile: resolvedFile,
      symbolName: symbolName,
    };
  }

  // Check namespace imports (import * as ns from './file')
  if (importStmt.namespaceImport === symbolName) {
    // Namespace imports don't map to a specific symbol
    return null;
  }

  return null;
}

/**
 * Follow a re-export chain to find the original source of a symbol.
 * Step 6.6.7b.2: Handle re-exports (`export { X } from './y'`)
 * @param symbolName - The name of the symbol being traced
 * @param currentFile - The current file in the chain
 * @param allNodes - All file nodes in the project
 * @param filePathMap - Pre-built map of file paths (optional, built if not provided)
 * @param maxDepth - Maximum depth to prevent infinite loops (default 5)
 * @param depth - Current depth (used internally for recursion)
 * @returns The original source location or null if not found/max depth reached
 */
export function followReExportChain(
  symbolName: string,
  currentFile: string,
  allNodes: WikiNode[],
  filePathMap?: Map<string, string>,
  maxDepth: number = MAX_REEXPORT_DEPTH,
  depth: number = 0
): ResolvedSymbol | null {
  // Prevent infinite loops
  if (depth >= maxDepth) {
    return null;
  }

  // Build file path map if not provided (first call in chain)
  const pathMap = filePathMap ?? buildFilePathMap(allNodes);

  // Find the current file node
  const currentNode = allNodes.find(n => n.id === currentFile || n.path === currentFile);
  if (!currentNode || !currentNode.raw.exports) {
    return null;
  }

  // Find the export with this name
  const exportDecl = currentNode.raw.exports.find(e => e.name === symbolName);
  if (!exportDecl) {
    return null;
  }

  // If this is not a re-export, we've found the source
  if (!exportDecl.isReExport) {
    return {
      sourceFile: currentFile,
      symbolName: symbolName,
    };
  }

  // This is a re-export, find the import that corresponds to it
  if (!currentNode.raw.imports) {
    return null;
  }

  // Find the import statement that imports this symbol
  for (const importStmt of currentNode.raw.imports) {
    // Check if this import includes the symbol
    if (importStmt.names.includes(symbolName) || importStmt.defaultName === symbolName) {
      // Resolve the import path
      const nextFile = resolveImportPath(currentFile, importStmt.from, pathMap);
      if (!nextFile) {
        return null;
      }

      // Recursively follow the chain (pass pathMap to avoid rebuilding)
      return followReExportChain(symbolName, nextFile, allNodes, pathMap, maxDepth, depth + 1);
    }
  }

  return null;
}

/**
 * Build an import symbol map for a file.
 * Maps imported symbol names to their source file and symbol name.
 * @param fileNode - The file node
 * @param allNodes - All file nodes in the project
 * @param filePathMap - Pre-built map of file paths for O(1) lookup
 * @returns Map of symbol names to resolved locations
 */
function buildImportSymbolMap(
  fileNode: WikiNode,
  allNodes: WikiNode[],
  filePathMap: Map<string, string>
): ImportSymbolMap {
  const symbolMap: ImportSymbolMap = {};

  if (!fileNode.raw.imports) {
    return symbolMap;
  }

  for (const importStmt of fileNode.raw.imports) {
    // Process named imports
    for (const name of importStmt.names) {
      const resolved = resolveImportedSymbol(name, importStmt, fileNode.path, allNodes, filePathMap);
      if (resolved) {
        // Follow re-export chains to find the original source
        const original = followReExportChain(resolved.symbolName, resolved.sourceFile, allNodes, filePathMap);
        if (original) {
          symbolMap[name] = original;
        } else {
          symbolMap[name] = resolved;
        }
      }
    }

    // Process default import
    if (importStmt.defaultName) {
      const resolved = resolveImportedSymbol(importStmt.defaultName, importStmt, fileNode.path, allNodes, filePathMap);
      if (resolved) {
        // Follow re-export chains
        const original = followReExportChain(resolved.symbolName, resolved.sourceFile, allNodes, filePathMap);
        if (original) {
          symbolMap[importStmt.defaultName] = original;
        } else {
          symbolMap[importStmt.defaultName] = resolved;
        }
      }
    }
  }

  return symbolMap;
}

/**
 * Build cross-file call graph from file nodes.
 * Step 6.6.7b.3: Build cross-file call graph.
 * @param fileNodes - Array of all file nodes
 * @returns Cross-file call graph mapping function IDs to their cross-file calls
 */
export function buildCrossFileCallGraph(fileNodes: WikiNode[]): CrossFileCallGraph {
  const callGraph: CrossFileCallGraph = {};

  // Build file path map once for O(1) lookups (optimization from CodeRabbit review)
  const filePathMap = buildFilePathMap(fileNodes);

  // Build import maps for all files
  const importMaps = new Map<string, ImportSymbolMap>();
  for (const fileNode of fileNodes) {
    importMaps.set(fileNode.id, buildImportSymbolMap(fileNode, fileNodes, filePathMap));
  }

  // Process each file
  for (const fileNode of fileNodes) {
    if (!fileNode.raw.functions || fileNode.raw.functions.length === 0) {
      continue;
    }

    const importMap = importMaps.get(fileNode.id) || {};

    // Process each function in the file
    for (const func of fileNode.raw.functions) {
      const functionId = `${fileNode.path}:${func.name}`;
      const crossFileCalls: CrossFileCall[] = [];

      // Check each function call
      for (const calledFuncName of func.calls) {
        // Check if this call is to an imported function
        const resolved = importMap[calledFuncName];
        if (resolved) {
          // This is a cross-file call
          const calleeId = `${resolved.sourceFile}:${resolved.symbolName}`;

          // Skip if the callee is 'default' (we need the actual function name)
          // Instead, find the actual function in the target file
          if (resolved.symbolName === 'default') {
            // Find the target file
            const targetFile = fileNodes.find(n => n.path === resolved.sourceFile);
            if (targetFile && targetFile.raw.functions) {
              // Find the default exported function using explicit isDefaultExport field
              const defaultFunc = targetFile.raw.functions.find(f => f.isDefaultExport);
              if (defaultFunc) {
                crossFileCalls.push({
                  caller: functionId,
                  callee: `${resolved.sourceFile}:${defaultFunc.name}`,
                  importedAs: calledFuncName,
                });
              }
            }
          } else {
            crossFileCalls.push({
              caller: functionId,
              callee: calleeId,
              importedAs: calledFuncName !== resolved.symbolName ? calledFuncName : undefined,
            });
          }
        }
      }

      // Store cross-file calls if any
      if (crossFileCalls.length > 0) {
        callGraph[functionId] = crossFileCalls;
      }
    }
  }

  return callGraph;
}

/**
 * Get cross-file calls and calledBy relationships for a function.
 * @param functionId - The function ID (file.ts:functionName)
 * @param callGraph - The cross-file call graph
 * @returns Object with calls and calledBy arrays
 */
export function getCrossFileCallsForFunction(
  functionId: string,
  callGraph: CrossFileCallGraph
): { calls: string[]; calledBy: string[] } {
  const calls: string[] = [];
  const calledBy: string[] = [];

  // Get calls from this function
  const functionCalls = callGraph[functionId];
  if (functionCalls) {
    calls.push(...functionCalls.map(c => c.callee));
  }

  // Get calledBy (functions that call this one)
  for (const [callerId, callerCalls] of Object.entries(callGraph)) {
    for (const call of callerCalls) {
      if (call.callee === functionId) {
        calledBy.push(callerId);
      }
    }
  }

  return { calls, calledBy };
}
