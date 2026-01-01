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

    // 1. Index exports
    if (node.raw.exports) {
      for (const exp of node.raw.exports) {
        addToIndex(index.byExport, exp.name, filePath);
      }
    }

    // 2. Index function names (as exports)
    if (node.raw.functions) {
      for (const func of node.raw.functions) {
        if (func.isExported) {
          addToIndex(index.byExport, func.name, filePath);
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
