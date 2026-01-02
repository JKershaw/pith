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
    const relLines = overview.relationships.map(
      (r) => `- ${r.from} imports: ${r.imports.join(', ')}`
    );
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
