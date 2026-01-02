/**
 * Navigator module for Phase 7.3.4-7.3.6.
 * Overview-Based Navigation: LLM reasons over project overview to select files.
 *
 * Instead of keyword-based pre-filtering, the navigator:
 * 1. Receives a project overview (from buildProjectOverview)
 * 2. Reasons about the query in context of the full project structure
 * 3. Outputs specific targets (files, greps, functions, importers)
 * 4. Targets are validated and resolved before synthesis
 */

import type { ProjectOverview } from './overview.ts';
import type { WikiNode } from '../builder/index.ts';

// ============================================================================
// Target Types
// ============================================================================

/** Target a specific file by path */
export interface FileTarget {
  type: 'file';
  path: string;
}

/** Target files matching a grep pattern */
export interface GrepTarget {
  type: 'grep';
  pattern: string;
  scope?: string; // Optional directory to search in
}

/** Target a specific function in a file */
export interface FunctionTarget {
  type: 'function';
  name: string;
  in: string; // File path containing the function
}

/** Target files that import a specific symbol */
export interface ImportersTarget {
  type: 'importers';
  of: string; // Symbol name to find importers of
}

/** Union of all target types */
export type NavigationTarget = FileTarget | GrepTarget | FunctionTarget | ImportersTarget;

/** Response from the navigator LLM */
export interface NavigationResponse {
  reasoning: string;
  targets?: NavigationTarget[];
  error?: string;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Format the project overview for inclusion in the navigator prompt.
 */
export function formatOverviewForPrompt(overview: ProjectOverview): string {
  const sections: string[] = [];

  // README (truncated)
  if (overview.readme) {
    const truncatedReadme = overview.readme.slice(0, 500);
    sections.push(`## Project Description\n${truncatedReadme}`);
  }

  // File tree
  if (overview.fileTree) {
    sections.push(`## File Structure\n\`\`\`\n${overview.fileTree}\n\`\`\``);
  }

  // Modules
  if (overview.modules.length > 0) {
    const moduleLines = overview.modules.map((m) => {
      const exports = m.keyExports.length > 0 ? ` (exports: ${m.keyExports.join(', ')})` : '';
      return `- **${m.path}**: ${m.summary}${exports}`;
    });
    sections.push(`## Modules\n${moduleLines.join('\n')}`);
  }

  // Entry points
  if (overview.entryPoints.length > 0) {
    const entryLines = overview.entryPoints.map((e) => `- **${e.path}**: ${e.description}`);
    sections.push(`## Entry Points\n${entryLines.join('\n')}`);
  }

  // Relationships
  if (overview.relationships.length > 0) {
    const relLines = overview.relationships.map((r) => {
      const consumerInfo = r.consumerCount ? ` (${r.consumerCount} consumers)` : '';
      return `- ${r.from}${consumerInfo} imports: ${r.imports.join(', ')}`;
    });
    sections.push(`## Key Relationships\n${relLines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Build the navigator prompt with project overview and user query.
 */
export function buildNavigatorPrompt(query: string, overview: ProjectOverview): string {
  const formattedOverview = formatOverviewForPrompt(overview);

  return `You are a codebase navigation assistant. Your job is to identify which files and code locations are relevant to answer a developer's question.

## Project Overview

${formattedOverview}

## Developer Question

${query}

## Your Task

Analyze the question and the project structure. Identify the most relevant files and code locations to answer this question.

## Output Format

Return a JSON object with:
- \`reasoning\`: Brief explanation of your analysis (1-2 sentences)
- \`targets\`: Array of targets to fetch, each with a \`type\` field:

Target types:
1. \`{ "type": "file", "path": "src/path/to/file.ts" }\` - Fetch a specific file
2. \`{ "type": "grep", "pattern": "regex_pattern", "scope": "src/dir/" }\` - Search for pattern (scope optional)
3. \`{ "type": "function", "name": "functionName", "in": "src/file.ts" }\` - Get specific function details
4. \`{ "type": "importers", "of": "SymbolName" }\` - Find all files that import this symbol

## Guidelines

- Prefer specific file targets when you know the exact file
- Use grep for patterns or keywords you're unsure about
- Use importers to find consumers/callers of a function or type
- Limit to 3-8 targets for efficiency
- Focus on files that directly answer the question

## Example Response

\`\`\`json
{
  "reasoning": "The question asks about retry logic. From the overview, the generator module handles LLM calls with retry.",
  "targets": [
    { "type": "file", "path": "src/generator/index.ts" },
    { "type": "grep", "pattern": "retry|maxRetries", "scope": "src/generator/" },
    { "type": "function", "name": "callLLM", "in": "src/generator/index.ts" }
  ]
}
\`\`\`

Now analyze the question and provide your response as JSON:`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the navigator LLM response into structured targets.
 */
export function parseNavigatorResponse(rawResponse: string): NavigationResponse {
  // Try to extract JSON from the response
  let jsonStr = rawResponse;

  // Check for JSON in code fence
  const codeFenceMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1].trim();
  } else {
    // Try to find raw JSON object
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      reasoning: '',
      error: `Failed to parse JSON from response: ${rawResponse.slice(0, 100)}...`,
    };
  }

  // Validate structure
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      reasoning: '',
      error: 'Response is not a valid object',
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Extract reasoning
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

  // Validate targets
  if (!Array.isArray(obj.targets)) {
    return {
      reasoning,
      error: 'Response missing targets array',
    };
  }

  // Validate each target
  const targets: NavigationTarget[] = [];
  for (const target of obj.targets) {
    const validated = validateTarget(target);
    if (validated.error) {
      return {
        reasoning,
        error: validated.error,
      };
    }
    if (validated.target) {
      targets.push(validated.target);
    }
  }

  return { reasoning, targets };
}

/**
 * Validate a single target from the LLM response.
 */
function validateTarget(target: unknown): { target?: NavigationTarget; error?: string } {
  if (typeof target !== 'object' || target === null) {
    return { error: 'Target is not an object' };
  }

  const obj = target as Record<string, unknown>;
  const type = obj.type;

  switch (type) {
    case 'file': {
      if (typeof obj.path !== 'string') {
        return { error: 'File target missing path' };
      }
      return { target: { type: 'file', path: obj.path } };
    }

    case 'grep': {
      if (typeof obj.pattern !== 'string') {
        return { error: 'Grep target missing pattern' };
      }
      const grepTarget: GrepTarget = { type: 'grep', pattern: obj.pattern };
      if (typeof obj.scope === 'string') {
        grepTarget.scope = obj.scope;
      }
      return { target: grepTarget };
    }

    case 'function': {
      if (typeof obj.name !== 'string' || typeof obj.in !== 'string') {
        return { error: 'Function target missing name or in' };
      }
      return { target: { type: 'function', name: obj.name, in: obj.in } };
    }

    case 'importers': {
      if (typeof obj.of !== 'string') {
        return { error: 'Importers target missing of' };
      }
      return { target: { type: 'importers', of: obj.of } };
    }

    default:
      return { error: `Unknown target type: ${type}` };
  }
}

// ============================================================================
// Target Resolution - Phase 7.3.6
// ============================================================================

/** Result of resolving a navigation target */
export interface ResolvedTarget {
  /** Whether resolution succeeded */
  success: boolean;
  /** Error message if resolution failed */
  error?: string;
  /** Suggestions for similar paths when file not found */
  suggestions?: string[];
  /** The resolved WikiNode for file targets */
  node?: WikiNode;
  /** Function details for function targets */
  functionDetails?: {
    name: string;
    signature: string;
    startLine: number;
    endLine: number;
  };
  /** List of importing file paths for importers targets */
  importers?: string[];
}

/**
 * Resolve a file target by finding the matching WikiNode.
 * Returns error with suggestions if file not found.
 *
 * @param target - The file target to resolve
 * @param nodes - All WikiNodes in the project
 * @returns ResolvedTarget with node or error
 */
export function resolveFileTarget(target: FileTarget, nodes: WikiNode[]): ResolvedTarget {
  // Validate input
  if (!target.path || target.path.trim() === '') {
    return { success: false, error: 'File path is empty' };
  }

  // Find exact match (only file nodes)
  const node = nodes.find((n) => n.type === 'file' && n.path === target.path);

  if (node) {
    return { success: true, node };
  }

  // File not found - try to find suggestions
  const suggestions = findSimilarPaths(target.path, nodes);

  return {
    success: false,
    error: `File not found: ${target.path}`,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Find similar paths for suggestions when a file is not found.
 * Uses exact segment matching to avoid substring false positives.
 */
function findSimilarPaths(targetPath: string, nodes: WikiNode[]): string[] {
  // Filter empty parts from paths with leading/trailing/double slashes
  const targetParts = targetPath.split('/').filter((p) => p.length > 0);
  if (targetParts.length === 0) return [];

  const targetFilename = targetParts[targetParts.length - 1];
  const targetDirParts = targetParts.slice(0, -1);

  const scored: Array<{ path: string; score: number }> = [];

  for (const node of nodes) {
    if (node.type !== 'file') continue;

    const nodeParts = node.path.split('/').filter((p) => p.length > 0);
    if (nodeParts.length === 0) continue;

    const nodeFilename = nodeParts[nodeParts.length - 1];
    const nodeDirParts = nodeParts.slice(0, -1);

    let score = 0;

    // Same filename is a strong signal
    if (nodeFilename === targetFilename) {
      score += 3;
    }

    // Check for exact matching directory segments (not substring matching)
    const nodeDirSet = new Set(nodeDirParts);
    for (const dirPart of targetDirParts) {
      if (nodeDirSet.has(dirPart)) {
        score += 2;
      }
      // Also check for prefix matches (extract -> extractor)
      for (const nodeDirPart of nodeDirParts) {
        if (nodeDirPart.startsWith(dirPart) && nodeDirPart !== dirPart) {
          score += 1;
        }
      }
    }

    if (score > 0) {
      scored.push({ path: node.path, score });
    }
  }

  // Return top 3 suggestions sorted by score
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.path);
}

/**
 * Resolve a function target by finding the function in the specified file.
 *
 * @param target - The function target to resolve
 * @param nodes - All WikiNodes in the project
 * @returns ResolvedTarget with function details or error
 */
export function resolveFunctionTarget(target: FunctionTarget, nodes: WikiNode[]): ResolvedTarget {
  // Validate input
  if (!target.name || target.name.trim() === '') {
    return { success: false, error: 'Function name is empty' };
  }
  if (!target.in || target.in.trim() === '') {
    return { success: false, error: 'File path is empty' };
  }

  // First find the file (only file nodes)
  const fileNode = nodes.find((n) => n.type === 'file' && n.path === target.in);

  if (!fileNode) {
    // Try to provide suggestions for the file
    const suggestions = findSimilarPaths(target.in, nodes);
    return {
      success: false,
      error: `File not found: ${target.in}`,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  // Find the function in the file's functions array
  const functions = fileNode.raw?.functions || [];
  const func = functions.find((f) => f.name === target.name);

  if (!func) {
    return {
      success: false,
      error: `Function '${target.name}' not found in ${target.in}`,
    };
  }

  return {
    success: true,
    functionDetails: {
      name: func.name,
      signature: func.signature,
      startLine: func.startLine,
      endLine: func.endLine,
    },
  };
}

/**
 * Resolve an importers target by finding files that import the symbol.
 * Uses the importedBy edges on nodes that export the symbol.
 *
 * @param target - The importers target to resolve
 * @param nodes - All WikiNodes in the project
 * @returns ResolvedTarget with list of importing files
 */
export function resolveImportersTarget(target: ImportersTarget, nodes: WikiNode[]): ResolvedTarget {
  // Validate input
  if (!target.of || target.of.trim() === '') {
    return { success: false, error: 'Symbol name is empty' };
  }

  // Use Set for O(1) lookup to avoid O(n²) performance
  const importerSet = new Set<string>();

  // Find nodes that export the symbol
  for (const node of nodes) {
    const exports = node.raw?.exports || [];
    const hasSymbol = exports.some((e) => e.name === target.of);

    if (hasSymbol) {
      // Get all files that import from this node using importedBy edges
      for (const edge of node.edges) {
        if (edge.type === 'importedBy') {
          importerSet.add(edge.target);
        }
      }
    }
  }

  return {
    success: true,
    importers: Array.from(importerSet),
  };
}

// ============================================================================
// Grep Target Execution - Phase 7.3.6.2
// ============================================================================

/** A single match from grep search */
export interface GrepMatch {
  /** File path where match was found */
  path: string;
  /** Type of match (function name, code snippet, key statement, etc.) */
  matchType: 'functionName' | 'signature' | 'codeSnippet' | 'keyStatement' | 'export';
  /** Name of the matched element (function name, export name) */
  name?: string;
  /** Line number if available */
  line?: number;
  /** Content that matched */
  content?: string;
}

/** Result of executing a grep target */
export interface GrepResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if execution failed */
  error?: string;
  /** Array of matches found */
  matches?: GrepMatch[];
}

/** Maximum allowed pattern length to prevent ReDoS attacks */
const MAX_PATTERN_LENGTH = 200;

/** Dangerous regex patterns that could cause catastrophic backtracking */
const DANGEROUS_PATTERNS = [
  /\*\+/, // Nested quantifiers like *+
  /\+\+/, // Nested quantifiers like ++
  /\*\*/, // Nested quantifiers like **
  /\?\+/, // Nested quantifiers like ?+
  /\+\*/, // Nested quantifiers like +*
  /\(\?:.*\)\*.*\(\?:.*\)\*/, // Multiple optional groups
];

/**
 * Validate a regex pattern for potential ReDoS vulnerabilities.
 * Returns an error message if the pattern is dangerous, undefined if safe.
 */
function validateRegexPattern(pattern: string): string | undefined {
  // Check length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern too long (max ${MAX_PATTERN_LENGTH} characters)`;
  }

  // Check for dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return 'Pattern contains potentially dangerous constructs';
    }
  }

  return undefined;
}

/**
 * Execute a grep target by searching WikiNode metadata.
 * Searches function names, signatures, code snippets, key statements, and exports.
 *
 * @param target - The grep target with pattern and optional scope
 * @param nodes - All WikiNodes in the project
 * @returns GrepResult with matches or error
 */
export function executeGrepTarget(target: GrepTarget, nodes: WikiNode[]): GrepResult {
  // Validate input
  if (!target.pattern || target.pattern.trim() === '') {
    return { success: false, error: 'Grep pattern is empty' };
  }

  // Validate pattern for ReDoS vulnerabilities
  const validationError = validateRegexPattern(target.pattern);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Validate regex
  let regex: RegExp;
  try {
    regex = new RegExp(target.pattern, 'i'); // Case-insensitive by default
  } catch {
    return { success: false, error: `Invalid regex pattern: ${target.pattern}` };
  }

  const matches: GrepMatch[] = [];

  // Filter nodes by scope if provided
  const fileNodes = nodes.filter((n) => {
    if (n.type !== 'file') return false;
    if (target.scope && !n.path.startsWith(target.scope)) return false;
    return true;
  });

  for (const node of fileNodes) {
    // Search exports
    const exports = node.raw?.exports || [];
    for (const exp of exports) {
      if (regex.test(exp.name)) {
        matches.push({
          path: node.path,
          matchType: 'export',
          name: exp.name,
          content: exp.name,
        });
      }
    }

    // Search functions
    const functions = node.raw?.functions || [];
    for (const func of functions) {
      // Search function name
      if (regex.test(func.name)) {
        matches.push({
          path: node.path,
          matchType: 'functionName',
          name: func.name,
          line: func.startLine,
          content: func.name,
        });
      }

      // Search signature
      if (regex.test(func.signature)) {
        matches.push({
          path: node.path,
          matchType: 'signature',
          name: func.name,
          line: func.startLine,
          content: func.signature,
        });
      }

      // Search code snippet
      if (func.codeSnippet && regex.test(func.codeSnippet)) {
        matches.push({
          path: node.path,
          matchType: 'codeSnippet',
          name: func.name,
          line: func.startLine,
          content: func.codeSnippet,
        });
      }

      // Search key statements
      const keyStatements = func.keyStatements || [];
      for (const stmt of keyStatements) {
        if (regex.test(stmt.text)) {
          matches.push({
            path: node.path,
            matchType: 'keyStatement',
            name: func.name,
            line: stmt.line,
            content: stmt.text,
          });
        }
      }
    }
  }

  return { success: true, matches };
}

// ============================================================================
// Target Resolution Orchestration - Phase 7.3.7.1
// ============================================================================

/** Function details from resolved function targets */
export interface FunctionDetail {
  path: string;
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
}

/** Result of resolving all navigation targets */
export interface ResolvedContext {
  /** WikiNodes collected from file and importer targets */
  nodes: WikiNode[];
  /** Grep matches from grep targets */
  grepMatches: GrepMatch[];
  /** Function details from function targets */
  functionDetails: FunctionDetail[];
  /** Errors encountered during resolution */
  errors: string[];
}

/**
 * Resolve all navigation targets and collect context.
 * Orchestrates the individual resolver functions and aggregates results.
 *
 * @param targets - Array of navigation targets from LLM
 * @param nodes - All WikiNodes in the project
 * @returns ResolvedContext with collected nodes, matches, and errors
 */
export function resolveAllTargets(targets: NavigationTarget[], nodes: WikiNode[]): ResolvedContext {
  const nodeMap = new Map<string, WikiNode>();
  const grepMatches: GrepMatch[] = [];
  const functionDetails: FunctionDetail[] = [];
  const errors: string[] = [];

  // Build lookup map for nodes
  const nodeLookup = new Map<string, WikiNode>();
  for (const node of nodes) {
    nodeLookup.set(node.path, node);
  }

  for (const target of targets) {
    switch (target.type) {
      case 'file': {
        const result = resolveFileTarget(target, nodes);
        if (result.success && result.node) {
          nodeMap.set(result.node.path, result.node);
        } else if (result.error) {
          errors.push(result.error);
        }
        break;
      }

      case 'grep': {
        const result = executeGrepTarget(target, nodes);
        if (result.success && result.matches) {
          grepMatches.push(...result.matches);
          // Also add the nodes where matches were found
          for (const match of result.matches) {
            const node = nodeLookup.get(match.path);
            if (node && !nodeMap.has(match.path)) {
              nodeMap.set(match.path, node);
            }
          }
        } else if (result.error) {
          errors.push(result.error);
        }
        break;
      }

      case 'function': {
        const result = resolveFunctionTarget(target, nodes);
        if (result.success && result.functionDetails) {
          functionDetails.push({
            path: target.in,
            name: result.functionDetails.name,
            signature: result.functionDetails.signature,
            startLine: result.functionDetails.startLine,
            endLine: result.functionDetails.endLine,
          });
          // Also add the file node
          const node = nodeLookup.get(target.in);
          if (node && !nodeMap.has(target.in)) {
            nodeMap.set(target.in, node);
          }
        } else if (result.error) {
          errors.push(result.error);
        }
        break;
      }

      case 'importers': {
        const result = resolveImportersTarget(target, nodes);
        if (result.success && result.importers) {
          // Add all importing nodes
          for (const importerPath of result.importers) {
            const node = nodeLookup.get(importerPath);
            if (node && !nodeMap.has(importerPath)) {
              nodeMap.set(importerPath, node);
            }
          }
        } else if (result.error) {
          errors.push(result.error);
        }
        break;
      }

      default: {
        // Exhaustive type check - ensures all target types are handled
        const _exhaustiveCheck: never = target;
        errors.push(`Unknown target type: ${(_exhaustiveCheck as NavigationTarget).type}`);
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    grepMatches,
    functionDetails,
    errors,
  };
}

// ============================================================================
// Synthesis Prompt Building - Phase 7.3.7.2
// ============================================================================

/**
 * Build the synthesis prompt from navigator context.
 * Phase 7.3.7.2: Format resolved context for LLM synthesis.
 *
 * @param query - The user's natural language query
 * @param context - Resolved context from navigation targets
 * @param navigatorReasoning - The navigator's reasoning about file selection
 * @returns The prompt string for the synthesis LLM
 */
export function buildNavigatorSynthesisPrompt(
  query: string,
  context: ResolvedContext,
  navigatorReasoning: string
): string {
  const lines: string[] = [];

  lines.push(
    "You are a codebase documentation assistant. Answer the developer's question based on the provided file context."
  );
  lines.push('');
  lines.push('## Question');
  lines.push(query);
  lines.push('');

  // Include navigator's reasoning for context
  lines.push('## Analysis Context');
  lines.push(`*Why these files were selected:* ${navigatorReasoning}`);
  lines.push('');

  // Include any resolution errors as warnings
  if (context.errors.length > 0) {
    lines.push('## Warnings');
    for (const error of context.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  // Build detailed context for each selected file
  lines.push('## Relevant Files');
  lines.push('');

  for (const node of context.nodes) {
    lines.push(`### ${node.path}`);
    lines.push('');

    // Summary and purpose
    if (node.prose) {
      lines.push(`**Summary:** ${node.prose.summary}`);
      lines.push('');
      lines.push(`**Purpose:** ${node.prose.purpose}`);
      lines.push('');

      // Gotchas (important warnings)
      if (node.prose.gotchas && node.prose.gotchas.length > 0) {
        lines.push('**Gotchas:**');
        for (const gotcha of node.prose.gotchas) {
          lines.push(`- ${gotcha}`);
        }
        lines.push('');
      }

      // Patterns
      if (node.prose.patterns && node.prose.patterns.length > 0) {
        lines.push('**Patterns:**');
        for (const pattern of node.prose.patterns) {
          lines.push(`- ${pattern}`);
        }
        lines.push('');
      }
    }

    // Detected patterns from raw data
    if (node.raw.patterns && node.raw.patterns.length > 0) {
      lines.push('**Detected Patterns:**');
      for (const pattern of node.raw.patterns) {
        lines.push(`- ${pattern.name} (${pattern.confidence}): ${pattern.evidence.join(', ')}`);
      }
      lines.push('');
    }

    // Functions with key statements (show highlighted functions first)
    const highlightedFunctions = context.functionDetails.filter((f) => f.path === node.path);
    if (node.raw.functions && node.raw.functions.length > 0) {
      lines.push('**Key Functions:**');
      for (const func of node.raw.functions) {
        const isHighlighted = highlightedFunctions.some((hf) => hf.name === func.name);
        const highlight = isHighlighted ? ' ⭐' : '';
        lines.push(`- \`${func.name}\` (lines ${func.startLine}-${func.endLine})${highlight}`);

        // Show key statements (config values, important logic)
        if (func.keyStatements && func.keyStatements.length > 0) {
          for (const stmt of func.keyStatements) {
            lines.push(`  - [${stmt.category}] line ${stmt.line}: \`${stmt.text}\``);
          }
        }
      }
      lines.push('');
    }

    // Exports for reference
    if (node.raw.exports && node.raw.exports.length > 0) {
      const exportNames = node.raw.exports.map((e) => e.name).join(', ');
      lines.push(`**Exports:** ${exportNames}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Include grep matches as additional context
  if (context.grepMatches.length > 0) {
    lines.push('## Pattern Matches');
    lines.push('');
    lines.push('*Additional code locations matching search patterns:*');
    lines.push('');

    // Group matches by file
    const matchesByFile = new Map<string, GrepMatch[]>();
    for (const match of context.grepMatches) {
      const existing = matchesByFile.get(match.path) || [];
      existing.push(match);
      matchesByFile.set(match.path, existing);
    }

    for (const [path, matches] of matchesByFile) {
      lines.push(`**${path}:**`);
      for (const match of matches) {
        const location = match.line ? `line ${match.line}` : match.matchType;
        lines.push(`- [${location}] ${match.name || ''}: \`${match.content}\``);
      }
      lines.push('');
    }
  }

  // Instructions for the answer
  lines.push('## Instructions');
  lines.push('');
  lines.push(
    "Based on the file context above, provide a clear, technical answer to the developer's question."
  );
  lines.push('');
  lines.push('Guidelines:');
  lines.push('- Be specific: reference function names, line numbers, and configuration values');
  lines.push('- Be concise: focus on directly answering the question');
  lines.push('- Include code references when relevant (e.g., "see `callLLM` at line 100")');
  lines.push('- Mention gotchas or edge cases if they relate to the question');
  lines.push('');
  lines.push('Provide your answer as plain text (no JSON or special formatting needed).');

  return lines.join('\n');
}
