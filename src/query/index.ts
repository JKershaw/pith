/**
 * Query Planner module for Phase 7.
 * Accepts natural language queries and returns relevant context automatically.
 */

import type { WikiNode } from '../builder/index.ts';

/**
 * Keyword index for fast lookup of files by various criteria.
 * Step 7.0.1: Build index from deterministic data (exports, patterns, key statements, errors, modules).
 * Step 7.0.2: Extend with summary words (when prose exists) - added separately.
 */
export interface KeywordIndex {
  byExport: Map<string, string[]>; // "login" → ["src/auth.ts"]
  byPattern: Map<string, string[]>; // "retry" → ["src/generator/index.ts"]
  byKeyStatement: Map<string, string[]>; // "timeout" → ["src/config.ts"]
  bySummaryWord: Map<string, string[]>; // "llm" → ["src/generator/index.ts"] (7.0.2)
  byErrorType: Map<string, string[]>; // "404" → ["src/api/index.ts"]
  byModule: Map<string, string[]>; // "generator" → ["src/generator/"]
}

/**
 * Add a value to a Map<string, string[]>, creating the array if needed.
 */
function addToIndex(map: Map<string, string[]>, key: string, value: string): void {
  const normalized = key.toLowerCase();
  const existing = map.get(normalized);
  if (existing) {
    if (!existing.includes(value)) {
      existing.push(value);
    }
  } else {
    map.set(normalized, [value]);
  }
}

/**
 * Common English stopwords to filter from summary text.
 * These provide little value for keyword matching.
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'will',
  'with',
  'which',
  'can',
  'all',
  'also',
  'but',
  'been',
  'into',
  'only',
  'some',
  'such',
  'than',
  'then',
  'them',
  'they',
  'their',
  'there',
  'these',
  'when',
  'where',
  'while',
  'who',
  'why',
  'would',
  'each',
  'more',
  'most',
  'other',
  'should',
  'through',
  'very',
  'about',
  'after',
  'any',
  'before',
  'being',
  'between',
  'both',
  'could',
  'does',
  'during',
  'either',
  'every',
  'had',
  'here',
  'how',
  'just',
  'like',
  'made',
  'make',
  'many',
  'may',
  'must',
  'our',
  'over',
  'own',
  'same',
  'so',
  'still',
  'take',
  'too',
  'under',
  'up',
  'used',
  'using',
  'way',
  'well',
  'what',
  'you',
  'your',
  'provides',
]);

/**
 * Extract significant words from summary text.
 * Filters stopwords and short words.
 */
function extractSummaryWords(summary: string): string[] {
  if (!summary) return [];

  // Extract words (alphabetic only)
  const words = summary.toLowerCase().match(/[a-z]+/g) || [];

  // Filter stopwords and short words
  return words.filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Extract keywords from key statement text.
 * Finds variable names and significant values.
 */
function extractKeywordsFromStatement(text: string): string[] {
  const keywords: string[] = [];

  // Extract variable names (left side of assignment)
  const assignmentMatch = text.match(/^(\w+)\s*=/);
  if (assignmentMatch) {
    keywords.push(assignmentMatch[1]);
  }

  // Extract camelCase parts
  const words = text.match(/[a-zA-Z]+/g) || [];
  for (const word of words) {
    // Split camelCase: maxRetries → max, Retries
    const parts = word.split(/(?=[A-Z])/);
    for (const part of parts) {
      if (part.length > 2) {
        keywords.push(part.toLowerCase());
      }
    }
  }

  return keywords;
}

/**
 * Build a keyword index from WikiNodes.
 * Step 7.0.1: Index deterministic data - exports, patterns, key statements, error types, module names.
 *
 * @param nodes - All WikiNodes from the database
 * @returns KeywordIndex for fast lookup
 */
export function buildKeywordIndex(nodes: WikiNode[]): KeywordIndex {
  const index: KeywordIndex = {
    byExport: new Map(),
    byPattern: new Map(),
    byKeyStatement: new Map(),
    bySummaryWord: new Map(),
    byErrorType: new Map(),
    byModule: new Map(),
  };

  for (const node of nodes) {
    // Skip function nodes - we index their parent file nodes instead
    if (node.type === 'function') {
      continue;
    }

    const filePath = node.path;

    // Index module names
    if (node.type === 'module') {
      addToIndex(index.byModule, node.name, filePath);
      continue;
    }

    // For file nodes, index various data:

    // 1. Index exports (both full name and camelCase parts)
    if (node.raw.exports) {
      for (const exp of node.raw.exports) {
        addToIndex(index.byExport, exp.name, filePath);
        // Also index camelCase parts
        const parts = splitCamelCase(exp.name);
        for (const part of parts) {
          if (part.length > 2) {
            addToIndex(index.byExport, part, filePath);
          }
        }
      }
    }

    // 2. Index function names (as exports, both full name and parts)
    if (node.raw.functions) {
      for (const func of node.raw.functions) {
        if (func.isExported) {
          addToIndex(index.byExport, func.name, filePath);
          // Also index camelCase parts
          const parts = splitCamelCase(func.name);
          for (const part of parts) {
            if (part.length > 2) {
              addToIndex(index.byExport, part, filePath);
            }
          }
        }

        // 3. Index key statements
        if (func.keyStatements) {
          for (const stmt of func.keyStatements) {
            const keywords = extractKeywordsFromStatement(stmt.text);
            for (const keyword of keywords) {
              addToIndex(index.byKeyStatement, keyword, filePath);
            }
          }
        }

        // 4. Index error types (HTTP status codes)
        if (func.errorPaths) {
          for (const errorPath of func.errorPaths) {
            if (errorPath.httpStatus) {
              addToIndex(index.byErrorType, String(errorPath.httpStatus), filePath);
            }
          }
        }
      }
    }

    // 5. Index detected patterns
    if (node.raw.patterns) {
      for (const pattern of node.raw.patterns) {
        addToIndex(index.byPattern, pattern.name, filePath);
      }
    }

    // 6. Index summary words from prose (Phase 7.0.2)
    if (node.prose?.summary) {
      const summaryWords = extractSummaryWords(node.prose.summary);
      for (const word of summaryWords) {
        addToIndex(index.bySummaryWord, word, filePath);
      }
    }
  }

  return index;
}

/**
 * Split a word on camelCase boundaries.
 * "extractFile" → ["extract", "File"]
 * "API" → ["API"] (all caps stays together)
 * "parseAPIResponse" → ["parse", "API", "Response"]
 */
function splitCamelCase(word: string): string[] {
  // Handle all-caps words (acronyms)
  if (word === word.toUpperCase()) {
    return [word];
  }

  // Split on lowercase→uppercase transitions, keeping uppercase sequences together
  // parseAPIResponse → parse, API, Response
  return word.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
}

/**
 * Tokenize a natural language query into searchable keywords.
 * Step 7.0.3: Query tokenizer with stopword filtering.
 *
 * @param query - The natural language query (e.g., "How does retry work?")
 * @returns Array of normalized, deduplicated keyword tokens
 */
export function tokenizeQuery(query: string): string[] {
  if (!query) return [];

  const tokens: string[] = [];
  const seen = new Set<string>();

  // Extract words (alphabetic and numeric for matching things like "404")
  const words = query.match(/[a-zA-Z0-9]+/g) || [];

  for (const word of words) {
    // Numbers stay as-is (for matching error codes like 404)
    if (/^\d+$/.test(word)) {
      if (!seen.has(word)) {
        tokens.push(word);
        seen.add(word);
      }
      continue;
    }

    // Split camelCase: extractFile → extract, File
    const parts = splitCamelCase(word);

    for (const part of parts) {
      const normalized = part.toLowerCase();

      // Skip stopwords and short words, avoid duplicates
      if (normalized.length > 2 && !STOPWORDS.has(normalized) && !seen.has(normalized)) {
        tokens.push(normalized);
        seen.add(normalized);
      }
    }
  }

  return tokens;
}

/**
 * Match scores by type.
 * Higher scores indicate more relevant matches.
 */
const MATCH_SCORES = {
  export: 10,
  pattern: 8,
  error: 7,
  keyStatement: 5,
  summary: 3,
  module: 2,
  highFanIn: 1, // Bonus for high-fanIn files
} as const;

/** Maximum number of candidates to return */
const MAX_CANDIDATES = 25;

/** FanIn threshold for "high" fanIn files */
const HIGH_FAN_IN_THRESHOLD = 5;

/**
 * Pre-filter candidate with scoring information.
 */
export interface PreFilterCandidate {
  path: string;
  score: number;
  matchReasons: string[];
  isHighFanIn: boolean;
  isModule: boolean;
}

/**
 * Pre-filter files based on query keywords.
 * Step 7.0.4: Match tokens, score, add modules.
 *
 * @param query - Natural language query
 * @param index - Keyword index built from nodes
 * @param nodes - All WikiNodes for additional lookups
 * @returns Scored candidates, sorted by score descending, capped at 25
 */
export function preFilter(
  query: string,
  index: KeywordIndex,
  nodes: WikiNode[]
): PreFilterCandidate[] {
  const candidateMap = new Map<string, PreFilterCandidate>();

  // Helper to add or update a candidate
  const addCandidate = (path: string, score: number, reason: string, isModule = false) => {
    const existing = candidateMap.get(path);
    if (existing) {
      existing.score += score;
      if (!existing.matchReasons.includes(reason)) {
        existing.matchReasons.push(reason);
      }
    } else {
      candidateMap.set(path, {
        path,
        score,
        matchReasons: [reason],
        isHighFanIn: false,
        isModule,
      });
    }
  };

  // Build node lookup for parent module resolution
  const nodeMap = new Map<string, WikiNode>();
  for (const node of nodes) {
    nodeMap.set(node.path, node);
  }

  // Tokenize the query
  const tokens = tokenizeQuery(query);

  // Match each token against all index maps
  for (const token of tokens) {
    // 1. Export matches (highest priority)
    const exportMatches = index.byExport.get(token);
    if (exportMatches) {
      for (const path of exportMatches) {
        addCandidate(path, MATCH_SCORES.export, `export: ${token}`);
      }
    }

    // 2. Pattern matches
    const patternMatches = index.byPattern.get(token);
    if (patternMatches) {
      for (const path of patternMatches) {
        addCandidate(path, MATCH_SCORES.pattern, `pattern: ${token}`);
      }
    }

    // 3. Error type matches
    const errorMatches = index.byErrorType.get(token);
    if (errorMatches) {
      for (const path of errorMatches) {
        addCandidate(path, MATCH_SCORES.error, `error: ${token}`);
      }
    }

    // 4. Key statement matches
    const keyStatementMatches = index.byKeyStatement.get(token);
    if (keyStatementMatches) {
      for (const path of keyStatementMatches) {
        addCandidate(path, MATCH_SCORES.keyStatement, `keyStatement: ${token}`);
      }
    }

    // 5. Summary word matches
    const summaryMatches = index.bySummaryWord.get(token);
    if (summaryMatches) {
      for (const path of summaryMatches) {
        addCandidate(path, MATCH_SCORES.summary, `summary: ${token}`);
      }
    }

    // 6. Module name matches
    const moduleMatches = index.byModule.get(token);
    if (moduleMatches) {
      for (const path of moduleMatches) {
        addCandidate(path, MATCH_SCORES.module, `module: ${token}`, true);
      }
    }
  }

  // Add parent modules for matched files
  for (const [path, candidate] of candidateMap) {
    if (!candidate.isModule) {
      const node = nodeMap.get(path);
      if (node) {
        const parentEdge = node.edges.find((e) => e.type === 'parent');
        if (parentEdge && !candidateMap.has(parentEdge.target)) {
          addCandidate(parentEdge.target, 1, 'parent of matched file', true);
        }
      }
    }
  }

  // Add high-fanIn files (always included for context)
  const highFanInFiles = nodes
    .filter((n) => n.type === 'file' && (n.metadata.fanIn ?? 0) >= HIGH_FAN_IN_THRESHOLD)
    .sort((a, b) => (b.metadata.fanIn ?? 0) - (a.metadata.fanIn ?? 0))
    .slice(0, 5);

  for (const node of highFanInFiles) {
    const existing = candidateMap.get(node.path);
    if (existing) {
      existing.isHighFanIn = true;
      existing.score += MATCH_SCORES.highFanIn;
    } else {
      candidateMap.set(node.path, {
        path: node.path,
        score: MATCH_SCORES.highFanIn,
        matchReasons: ['high fanIn'],
        isHighFanIn: true,
        isModule: false,
      });
    }
  }

  // Mark module candidates
  for (const candidate of candidateMap.values()) {
    const node = nodeMap.get(candidate.path);
    if (node?.type === 'module') {
      candidate.isModule = true;
    }
  }

  // Sort by score descending and cap at MAX_CANDIDATES
  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  return candidates;
}

/**
 * Format candidates for the planner LLM prompt.
 * Step 7.0.5: Compact format with relationships.
 *
 * Output format (~40 tokens each):
 * {path}: {one-line summary} [Uses: a, b] [Matched: export:foo, pattern:retry]
 *
 * @param candidates - Pre-filtered candidates with scores
 * @param nodes - All WikiNodes for node lookup
 * @returns Formatted string for planner prompt
 */
export function formatCandidatesForPlanner(
  candidates: PreFilterCandidate[],
  nodes: WikiNode[]
): string {
  if (candidates.length === 0) return '';

  // Build node lookup
  const nodeMap = new Map<string, WikiNode>();
  for (const node of nodes) {
    nodeMap.set(node.path, node);
  }

  // Build set of candidate paths for relationship filtering
  const candidatePaths = new Set(candidates.map((c) => c.path));

  const lines: string[] = [];

  for (const candidate of candidates) {
    const node = nodeMap.get(candidate.path);
    if (!node) continue;

    // Get summary (or placeholder)
    const summary = node.prose?.summary || '(no summary)';

    // Find imports that are also candidates
    const uses = node.edges
      .filter((e) => e.type === 'imports' && candidatePaths.has(e.target))
      .map((e) => e.target);

    // Format match reasons (strip the category prefix for brevity)
    const matchedParts = candidate.matchReasons.map((r) => r.replace(': ', ':'));

    // Build the line
    let line = `${candidate.path}: ${summary}`;

    if (uses.length > 0) {
      line += ` [Uses: ${uses.join(', ')}]`;
    }

    if (matchedParts.length > 0) {
      line += ` [Matched: ${matchedParts.join(', ')}]`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Build the planner prompt for the LLM.
 * Step 7.1.3: Construct a prompt that presents candidates and asks LLM to select files.
 *
 * The planner LLM selects which 3-8 files to include for synthesis.
 * Output format: JSON with selected file paths and reasoning.
 *
 * @param query - The user's natural language query
 * @param candidates - Pre-filtered candidates with scores
 * @param nodes - All WikiNodes for additional context
 * @returns The prompt string for the planner LLM
 */
export function buildPlannerPrompt(
  query: string,
  candidates: PreFilterCandidate[],
  nodes: WikiNode[]
): string {
  const candidatesFormatted = formatCandidatesForPlanner(candidates, nodes);

  // Separate modules and files for two-level presentation
  const modules = candidates.filter((c) => c.isModule);
  const files = candidates.filter((c) => !c.isModule);

  let moduleSection = '';
  if (modules.length > 0) {
    const nodeMap = new Map<string, WikiNode>();
    for (const node of nodes) {
      nodeMap.set(node.path, node);
    }

    const moduleLines = modules.map((m) => {
      const node = nodeMap.get(m.path);
      const summary = node?.prose?.summary || '(no summary)';
      return `- ${m.path}: ${summary}`;
    });
    moduleSection = `
## Relevant Modules
${moduleLines.join('\n')}
`;
  }

  return `You are a codebase navigation assistant. Given a user question and a list of candidate files, select the 3-8 most relevant files that would help answer the question.

## User Question
${query}

${moduleSection}
## Candidate Files (${files.length} files, sorted by relevance score)
${candidatesFormatted}

## Your Task
1. Analyze the question to understand what information is needed
2. Select 3-8 files that are most likely to contain the answer
3. Prefer files that:
   - Directly match the query keywords (exports, patterns)
   - Have high relevance scores
   - Are related to each other (check the [Uses: ...] relationships)
4. Include at least one module-level file if the question is about architecture

## Output Format
Respond with ONLY valid JSON in this exact format:
{
  "selectedFiles": ["path/to/file1.ts", "path/to/file2.ts"],
  "reasoning": "Brief explanation of why these files were selected",
  "informationNeeded": "What specific information should be extracted from these files"
}

Important:
- Return ONLY the JSON, no markdown code blocks or other text
- Select between 3 and 8 files
- Use exact paths from the candidate list
`;
}

/**
 * Planner LLM response structure.
 */
export interface PlannerResponse {
  selectedFiles: string[];
  reasoning: string;
  informationNeeded: string;
}

/**
 * Parse the LLM response from the planner.
 * Step 7.1.4: Extract selected files and reasoning from JSON response.
 *
 * @param response - Raw LLM response string
 * @param candidatePaths - Valid candidate paths to validate against
 * @returns Parsed planner response or error
 */
export function parsePlannerResponse(
  response: string,
  candidatePaths: Set<string>
): PlannerResponse | { error: string } {
  // Try to extract JSON from the response
  // Handle potential markdown code blocks
  let jsonString = response.trim();

  // Remove markdown code blocks if present
  if (jsonString.startsWith('```')) {
    const lines = jsonString.split('\n');
    // Skip first line (```json) and last line (```)
    jsonString = lines.slice(1, -1).join('\n');
  }

  try {
    const parsed = JSON.parse(jsonString) as {
      selectedFiles?: unknown;
      reasoning?: unknown;
      informationNeeded?: unknown;
    };

    // Validate structure
    if (!parsed.selectedFiles || !Array.isArray(parsed.selectedFiles)) {
      return { error: 'Missing or invalid selectedFiles array' };
    }

    if (typeof parsed.reasoning !== 'string') {
      return { error: 'Missing or invalid reasoning string' };
    }

    // Validate selected files exist in candidates
    const validFiles: string[] = [];
    const invalidFiles: string[] = [];

    for (const file of parsed.selectedFiles) {
      if (typeof file === 'string' && candidatePaths.has(file)) {
        validFiles.push(file);
      } else if (typeof file === 'string') {
        invalidFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      return {
        error: `No valid files selected. Invalid paths: ${invalidFiles.join(', ')}`,
      };
    }

    // Warn about invalid files but continue with valid ones
    return {
      selectedFiles: validFiles,
      reasoning:
        parsed.reasoning +
        (invalidFiles.length > 0
          ? ` (Note: ${invalidFiles.length} invalid path(s) were filtered out)`
          : ''),
      informationNeeded:
        typeof parsed.informationNeeded === 'string'
          ? parsed.informationNeeded
          : 'General information about the selected files',
    };
  } catch {
    return { error: `Failed to parse JSON: ${response.slice(0, 100)}...` };
  }
}

/**
 * Build the synthesis prompt for the LLM.
 * Step 7.1.6: Construct a prompt that presents selected file context and asks LLM to answer.
 *
 * @param query - The user's natural language query
 * @param nodes - Selected WikiNodes with their prose and details
 * @param plannerInfo - The planner's reasoning and information needs
 * @returns The prompt string for the synthesis LLM
 */
export function buildSynthesisPrompt(
  query: string,
  nodes: WikiNode[],
  plannerInfo: PlannerResponse
): string {
  const lines: string[] = [];

  lines.push(
    "You are a codebase documentation assistant. Answer the developer's question based on the provided file context."
  );
  lines.push('');
  lines.push('## Question');
  lines.push(query);
  lines.push('');

  // Include planner's reasoning for context
  lines.push('## Analysis Context');
  lines.push(`*Why these files were selected:* ${plannerInfo.reasoning}`);
  lines.push(`*Information to extract:* ${plannerInfo.informationNeeded}`);
  lines.push('');

  // Build detailed context for each selected file
  lines.push('## Relevant Files');
  lines.push('');

  for (const node of nodes) {
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

    // Functions with key statements
    if (node.raw.functions && node.raw.functions.length > 0) {
      lines.push('**Key Functions:**');
      for (const func of node.raw.functions) {
        lines.push(`- \`${func.name}\` (lines ${func.startLine}-${func.endLine})`);

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

/**
 * Synthesis response result.
 */
export interface SynthesisResult {
  answer: string;
  error?: boolean;
}

/**
 * Parse the LLM response from the synthesis step.
 * Step 7.1.7: Extract the answer from the LLM response.
 *
 * @param response - Raw LLM response string
 * @returns Parsed synthesis result
 */
export function parseSynthesisResponse(response: string): SynthesisResult {
  const trimmed = response.trim();

  // Handle empty response
  if (!trimmed) {
    return {
      answer: 'Unable to generate an answer. Please try rephrasing your question.',
      error: true,
    };
  }

  // Try to extract JSON answer if response is JSON
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { answer?: string };
      if (typeof parsed.answer === 'string') {
        return { answer: parsed.answer };
      }
    } catch {
      // Not JSON, treat as plain text
    }
  }

  // Return plain text response as-is
  return { answer: trimmed };
}
