import type { WikiNode, FunctionDetails } from '../builder/index.ts';
import type { KeyStatement } from '../extractor/ast.ts';
import type { MangoDb } from '@jkershaw/mangodb';
import { ProxyAgent } from 'undici';

/**
 * Get proxy agent for external URLs.
 * Only applies proxy for non-localhost URLs to avoid conflicts with tests.
 */
function getProxyDispatcher(url: string): ProxyAgent | undefined {
  // Don't use proxy for localhost connections (tests)
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('[::1]')) {
    return undefined;
  }

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (proxyUrl) {
    return new ProxyAgent(proxyUrl);
  }
  return undefined;
}

/**
 * A gotcha with optional location and evidence
 */
export interface Gotcha {
  warning: string; // The warning message
  location?: string; // Line number or function name (e.g., "line 442" or "callLLM")
  evidence?: string; // Code or fact that supports this warning
}

/**
 * Debugging hints for a file
 */
export interface DebuggingHints {
  errorPatterns?: string[]; // Common errors and where to look
  keyLocations?: string[]; // Important locations for debugging
}

/**
 * Generated prose for a node
 */
export interface ProseData {
  summary: string; // One-line description
  purpose: string; // 2-3 sentences explaining why this exists
  gotchas: string[]; // Array of warnings (kept for backwards compatibility)
  gotchasDetailed?: Gotcha[]; // Detailed gotchas with location and evidence
  gotchaConfidence?: ('high' | 'medium' | 'low')[]; // Confidence level for each gotcha (Phase 6.5)
  keyExports?: string[]; // Most important exports (for files)
  keyFiles?: string[]; // Most important files (for modules)
  publicApi?: string[]; // Exports that other modules should use (for modules)
  quickStart?: string; // Quick start example (for modules)
  patterns?: string[]; // Usage patterns (for files)
  similarFiles?: string[]; // Files with similar patterns (for files)
  debugging?: DebuggingHints; // Debugging hints with locations (for files)
  dataFlow?: string; // How data flows through the module (for modules)
  generatedAt: Date; // When prose was generated
  stale?: boolean; // True if source changed after prose was generated
}

/**
 * LLM provider configuration
 */
export interface GeneratorConfig {
  provider: 'openrouter';
  model: string; // e.g., 'anthropic/claude-sonnet-4'
  apiKey: string; // OpenRouter API key
  maxTokens?: number; // Default: 4096
  temperature?: number; // Default: 0.3
  timeout?: number; // Request timeout in milliseconds (default: 30000)
}

/**
 * Build a prompt for generating documentation for a wiki node.
 * @param node - The wiki node to generate a prompt for
 * @param childSummaries - Optional map of child node IDs to their summaries (for module nodes)
 * @returns The prompt string
 */
export function buildPrompt(node: WikiNode, childSummaries?: Map<string, string>): string {
  if (node.type === 'file') {
    return buildFilePrompt(node);
  }
  if (node.type === 'module') {
    return buildModulePrompt(node, childSummaries);
  }
  throw new Error(`Unsupported node type: ${node.type}`);
}

/**
 * Format key statements for display in the prompt.
 * @param keyStatements - Array of key statements from AST analysis
 * @returns Formatted string showing key statements by category
 */
function formatKeyStatements(keyStatements: KeyStatement[]): string {
  if (!keyStatements || keyStatements.length === 0) {
    return '';
  }

  const lines: string[] = ['**Key statements:**'];
  for (const stmt of keyStatements) {
    lines.push(`  - [${stmt.category}] line ${stmt.line}: \`${stmt.text}\``);
  }
  return lines.join('\n');
}

/**
 * Format a function for the prompt with line numbers, code snippet, and key statements.
 * @param func - Function details
 * @returns Formatted string with name, lines, code snippet, and key statements
 */
function formatFunctionForPrompt(func: FunctionDetails): string {
  const header = `### ${func.name} (lines ${func.startLine}-${func.endLine})`;
  const codeBlock = `\`\`\`typescript\n${func.codeSnippet}\n\`\`\``;
  const keyStmts = formatKeyStatements(func.keyStatements);

  if (keyStmts) {
    return `${header}\n${codeBlock}\n${keyStmts}`;
  }
  return `${header}\n${codeBlock}`;
}

/**
 * Build a prompt for a file node.
 * @param node - The file wiki node
 * @returns The prompt string
 */
function buildFilePrompt(node: WikiNode): string {
  // Build imports section
  const importsSection =
    node.raw.imports && node.raw.imports.length > 0
      ? node.raw.imports
          .map((imp) => `  - ${imp.names?.join(', ') || 'default'} from "${imp.from}"`)
          .join('\n')
      : '(none)';

  // Build exports section
  const exportsSection =
    node.raw.exports && node.raw.exports.length > 0
      ? node.raw.exports.map((exp) => `  - ${exp.name} (${exp.kind})`).join('\n')
      : '(none)';

  // Build functions section with line numbers (Phase 6.6.1)
  let functionsSection = '(none)';
  if (node.raw.functions && node.raw.functions.length > 0) {
    functionsSection = node.raw.functions.map(formatFunctionForPrompt).join('\n');
  } else if (node.raw.signature && node.raw.signature.length > 0) {
    // Fallback to signatures if functions not available
    functionsSection = node.raw.signature.map((sig) => `  - ${sig}`).join('\n');
  }

  // Build git section
  const gitSection = `Last modified ${node.metadata.lastModified.toISOString().split('T')[0]}. ${node.metadata.commits} commits total.`;

  // Build JSDoc section
  let jsdocSection = '(none)';
  if (node.raw.jsdoc && Object.keys(node.raw.jsdoc).length > 0) {
    jsdocSection = Object.entries(node.raw.jsdoc)
      .map(([name, doc]) => {
        let docStr = `  ${name}: ${doc.description || ''}`;
        if (doc.params?.length) {
          docStr +=
            '\n    Params: ' + doc.params.map((p) => `${p.name}: ${p.description}`).join(', ');
        }
        if (doc.returns) {
          docStr += `\n    Returns: ${doc.returns}`;
        }
        return docStr;
      })
      .join('\n');
  }

  // Extract key statements summary for emphasis
  const allKeyStatements: string[] = [];
  if (node.raw.functions) {
    for (const func of node.raw.functions) {
      if (func.keyStatements) {
        for (const stmt of func.keyStatements) {
          allKeyStatements.push(`[${stmt.category}] ${func.name} line ${stmt.line}: ${stmt.text}`);
        }
      }
    }
  }
  const keyStatementsEmphasis =
    allKeyStatements.length > 0
      ? `\n\nKEY VALUES FOUND (reference significant ones in gotchasDetailed):\n${allKeyStatements.map((s) => `  - ${s}`).join('\n')}`
      : '';

  // Phase 6.6.6: Build detected patterns section
  let patternsSection = '';
  if (node.raw.patterns && node.raw.patterns.length > 0) {
    const patternLines = node.raw.patterns.map((p) => {
      const evidenceStr = p.evidence.join(', ');
      return `  - ${p.name.toUpperCase()} pattern at ${p.location} (confidence: ${p.confidence})\n    Evidence: ${evidenceStr}`;
    });
    patternsSection = `\n\nDETECTED PATTERNS (confirm and refine these in your response):\n${patternLines.join('\n')}`;
  }

  return `You are documenting a TypeScript file for a developer-focused codebase wiki.

## CRITICAL RULES - Read these first:

1. TRANSFORM SIGNIFICANT KEY STATEMENTS → GOTCHAS: Key statements that could surprise developers or cause issues should become gotchasDetailed entries. Prioritize:
   - ✓ Timeouts, retry counts, rate limits (e.g., maxRetries = 3, timeout = 30000)
   - ✓ Error conditions and thresholds (e.g., if (status === 429), MAX_SIZE = 10MB)
   - ✗ Skip mundane defaults (e.g., indent = 2, encoding = 'utf8', port = 3000)

2. BE SPECIFIC, NOT VAGUE: When you do include something, use actual values, line numbers, and function names.

3. EXAMPLE - How to transform input to output:

INPUT (Key statements from code):
  [config] callLLM line 47: maxRetries = 3       ← Important: affects error recovery
  [config] callLLM line 48: timeout = 30000      ← Important: could cause hangs
  [config] callLLM line 49: indent = 2           ← Skip: mundane formatting default
  [condition] callLLM line 85: if (response.status === 429)  ← Important: error handling

WRONG OUTPUT (too vague - DO NOT do this):
  "gotchas": ["Has retry logic", "Handles rate limiting"]
  "gotchasDetailed": [{"warning": "May timeout", "location": "callLLM"}]

CORRECT OUTPUT (specific and actionable, skips mundane config):
  "gotchas": ["Retries 3 times with 30s timeout", "429 responses trigger retry"]
  "gotchasDetailed": [
    {"warning": "API calls retry up to 3 times before failing", "location": "callLLM line 47", "evidence": "maxRetries = 3"},
    {"warning": "Requests timeout after 30 seconds", "location": "callLLM line 48", "evidence": "timeout = 30000"},
    {"warning": "Rate-limited responses (429) trigger automatic retry", "location": "callLLM line 85", "evidence": "if (response.status === 429)"}
  ]
  "debugging": {
    "errorPatterns": ["Timeout errors: check callLLM line 48, timeout = 30000"],
    "keyLocations": ["Retry logic: callLLM lines 47-90"]
  }

---

## FILE DATA:

FILE: ${node.path}
IMPORTS:
${importsSection}
EXPORTS:
${exportsSection}
FUNCTIONS:
${functionsSection}
GIT: ${gitSection}
JSDOC:
${jsdocSection}${keyStatementsEmphasis}${patternsSection}

---

## OUTPUT FORMAT:

Generate JSON with these fields:
{
  "summary": "One sentence describing what this file does",
  "purpose": "2-3 sentences explaining why this file exists and its role",
  "gotchas": ["Short warning strings (include key values like 'timeout=30s')"],
  "gotchasDetailed": [
    {"warning": "Description", "location": "functionName line X", "evidence": "actual code/value"}
  ],
  "keyExports": ["Most important exports"],
  "patterns": ["Design patterns detected (confirm and refine the detected patterns if any, or describe usage patterns)"],
  "similarFiles": ["Paths to files with similar patterns"],
  "debugging": {
    "errorPatterns": ["For error X, check functionName at line Y"],
    "keyLocations": ["Category: functionName lines X-Y"]
  }
}

Remember:
- Focus on key statements that could surprise developers or cause issues. Include specific values and line numbers.
- If design patterns were detected, confirm them and add details about how they're implemented.`;
}

/**
 * Build a prompt for a module node.
 * @param node - The module wiki node
 * @param childSummaries - Optional map of child node IDs to their summaries
 * @returns The prompt string
 */
function buildModulePrompt(node: WikiNode, childSummaries?: Map<string, string>): string {
  // Get child files from contains edges
  const childFiles = node.edges
    .filter((edge) => edge.type === 'contains')
    .map((edge) => edge.target);

  // Build files section with summaries
  const filesSection =
    childFiles.length > 0
      ? childFiles
          .map((filePath) => {
            const fileName = filePath.split('/').pop() || filePath;
            const summary = childSummaries?.get(filePath) || '(no summary yet)';
            return `  - ${fileName}: ${summary}`;
          })
          .join('\n')
      : '(none)';

  // Build README section
  const readmeSection = node.raw.readme || '(none)';

  return `You are documenting a module (directory) for a developer-focused codebase wiki.

## CRITICAL RULES - Read these first:

1. TRACE DATA FLOW WITH FILE NAMES: In dataFlow, explicitly name which file is the entry point, which files transform data, and which file outputs it.

2. BE SPECIFIC ABOUT CONNECTIONS: Don't just list files - explain HOW they connect.

3. EXAMPLE - How to write good vs bad module documentation:

WRONG (too vague - DO NOT do this):
  "dataFlow": "Data flows through the module files."
  "keyFiles": ["index.ts: main file", "utils.ts: utilities"]
  "gotchas": ["Complex module"]

CORRECT (specific and actionable):
  "dataFlow": "Data enters via api.ts which parses requests, transforms via processor.ts which validates and enriches, then exits via output.ts which formats responses. The db.ts file is called by processor.ts for persistence."
  "keyFiles": ["api.ts: HTTP entry point - all requests start here", "processor.ts: core business logic - validation and transformation", "db.ts: persistence layer - called by processor for storage"]
  "gotchas": ["Must call init() from index.ts before using processor.ts", "db.ts requires DATABASE_URL env var or throws on import"]

---

## MODULE DATA:

MODULE: ${node.path}
FILES:
${filesSection}

README:
${readmeSection}

---

## OUTPUT FORMAT:

Generate JSON with these fields:
{
  "summary": "One sentence describing what this module does",
  "purpose": "2-3 sentences explaining this module's role in the architecture",
  "keyFiles": ["filename.ts: what it does and why it matters"],
  "publicApi": ["Exports that other modules should use"],
  "quickStart": "A 2-3 line code example showing typical usage",
  "dataFlow": "Trace data: 'Enters via X.ts, transforms in Y.ts, exits via Z.ts'. Name specific files.",
  "gotchas": ["Specific warnings with file names (e.g., 'X.ts requires Y to be called first')"]
}

Remember: A developer reading this should understand exactly how data moves through this module and which file to look at for each concern.`;
}

/**
 * Parses LLM response text into structured ProseData
 * Handles markdown code blocks and leading text
 */
export function parseLLMResponse(response: string): ProseData {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  // Parse JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`Failed to parse LLM response as JSON: ${(error as Error).message}`);
  }

  // Validate required fields
  if (typeof parsed.summary !== 'string') {
    throw new Error('Missing required field: summary');
  }
  if (typeof parsed.purpose !== 'string') {
    throw new Error('Missing required field: purpose');
  }

  // Parse gotchasDetailed if present
  let gotchasDetailed: Gotcha[] | undefined;
  if (Array.isArray(parsed.gotchasDetailed)) {
    gotchasDetailed = parsed.gotchasDetailed
      .filter(
        (g: unknown): g is Record<string, unknown> =>
          typeof g === 'object' &&
          g !== null &&
          typeof (g as Record<string, unknown>).warning === 'string'
      )
      .map((g: Record<string, unknown>) => ({
        warning: g.warning as string,
        location: typeof g.location === 'string' ? g.location : undefined,
        evidence: typeof g.evidence === 'string' ? g.evidence : undefined,
      }));
  }

  // Parse debugging hints if present
  let debugging: DebuggingHints | undefined;
  if (parsed.debugging && typeof parsed.debugging === 'object') {
    const dbg = parsed.debugging as Record<string, unknown>;
    debugging = {
      errorPatterns: Array.isArray(dbg.errorPatterns)
        ? dbg.errorPatterns.filter((e): e is string => typeof e === 'string')
        : undefined,
      keyLocations: Array.isArray(dbg.keyLocations)
        ? dbg.keyLocations.filter((e): e is string => typeof e === 'string')
        : undefined,
    };
    // Only include if at least one field is present
    if (!debugging.errorPatterns && !debugging.keyLocations) {
      debugging = undefined;
    }
  }

  // Build ProseData with defaults for optional fields
  return {
    summary: parsed.summary,
    purpose: parsed.purpose,
    gotchas: Array.isArray(parsed.gotchas) ? parsed.gotchas : [],
    gotchasDetailed,
    keyExports: Array.isArray(parsed.keyExports) ? parsed.keyExports : undefined,
    keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles : undefined,
    publicApi: Array.isArray(parsed.publicApi) ? parsed.publicApi : undefined,
    quickStart: typeof parsed.quickStart === 'string' ? parsed.quickStart : undefined,
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns : undefined,
    similarFiles: Array.isArray(parsed.similarFiles) ? parsed.similarFiles : undefined,
    debugging,
    dataFlow: typeof parsed.dataFlow === 'string' ? parsed.dataFlow : undefined,
    generatedAt: new Date(),
  };
}

/**
 * Result of validating a gotcha
 */
export interface ValidatedGotcha {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  verifiedNames: string[];
}

/**
 * Extract code-like identifiers from text (camelCase, PascalCase, snake_case)
 * @param text - The text to extract identifiers from
 * @returns Array of extracted identifiers
 */
export function extractIdentifiers(text: string): string[] {
  if (!text) return [];

  // Match any identifier-like word (letters, numbers, underscores)
  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;

  const matches = text.match(identifierPattern) || [];

  // Filter out common English words and short words
  const commonWords = new Set([
    'the',
    'is',
    'at',
    'which',
    'on',
    'a',
    'an',
    'as',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'with',
    'this',
    'that',
    'from',
    'by',
    'or',
    'and',
    'but',
    'not',
    'it',
    'if',
    'then',
    'else',
    'function',
    'requires',
    'calls',
    'returns',
    'uses',
    'needs',
    'when',
    'where',
    'what',
    'why',
    'how',
    'who',
    'which',
    'all',
    'some',
    'any',
    'each',
    'every',
    'other',
    'another',
    'var',
    'env',
    'does',
    'exist',
    'intensive',
    'return',
    'null',
    'their',
    'about',
    'after',
    'also',
    'before',
    'between',
    'both',
    'during',
    'into',
    'over',
    'through',
    'under',
    'against',
    'along',
    'among',
    'around',
    'because',
    'before',
    'behind',
    'below',
    'beneath',
    'beside',
    'besides',
    'beyond',
    'down',
    'inside',
    'outside',
    'since',
    'than',
    'toward',
    'upon',
    'within',
    'without',
  ]);

  return matches.filter((match) => {
    // Filter out single letters and common words
    if (match.length <= 2 || commonWords.has(match.toLowerCase())) {
      return false;
    }

    // Keep identifiers that have mixed case (likely code)
    if (/[a-z].*[A-Z]|[A-Z].*[a-z]/.test(match)) {
      return true;
    }

    // Keep identifiers with underscores (snake_case) but not all-caps with underscores (env vars)
    if (match.includes('_')) {
      // Exclude SCREAMING_SNAKE_CASE (likely environment variables)
      if (match === match.toUpperCase()) {
        return false;
      }
      return true;
    }

    // Exclude all-caps words (likely constants/env vars, not function names)
    if (match === match.toUpperCase()) {
      return false;
    }

    // For lowercase words, only keep them if they're longer and look like identifiers
    // This catches things like "login", "logout", "session", etc.
    if (match.length >= 4) {
      return true;
    }

    return false;
  });
}

/**
 * Validate a single gotcha against node data
 * @param gotcha - The gotcha text to validate
 * @param node - The wiki node to validate against
 * @returns Validation result with confidence level
 */
export function validateGotcha(gotcha: string, node: WikiNode): ValidatedGotcha {
  // Extract identifiers from the gotcha text
  const identifiers = extractIdentifiers(gotcha);

  if (identifiers.length === 0) {
    // No identifiers found - can't verify
    return {
      text: gotcha,
      confidence: 'low',
      verifiedNames: [],
    };
  }

  // Build a set of all names in the node's raw data
  const knownNames = new Set<string>();

  // Add export names
  if (node.raw.exports) {
    for (const exp of node.raw.exports) {
      knownNames.add(exp.name);
    }
  }

  // Add function names from signatures
  if (node.raw.signature) {
    for (const sig of node.raw.signature) {
      // Extract function name from signature (e.g., "login(..." or "function login(..." or "async function login(...)")
      const match = sig.match(/(?:async\s+)?(?:function\s+)?(\w+)\s*\(/);
      if (match?.[1]) {
        knownNames.add(match[1]);
      }
    }
  }

  // Add import names
  if (node.raw.imports) {
    for (const imp of node.raw.imports) {
      if (imp.names) {
        for (const name of imp.names) {
          knownNames.add(name);
        }
      }
    }
  }

  // Check which identifiers are verified
  const verifiedNames = identifiers.filter((id) => knownNames.has(id));

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (verifiedNames.length === identifiers.length) {
    // All identifiers verified
    confidence = 'high';
  } else if (verifiedNames.length > 0) {
    // Some identifiers verified
    confidence = 'medium';
  } else {
    // No identifiers verified
    confidence = 'low';
  }

  return {
    text: gotcha,
    confidence,
    verifiedNames,
  };
}

/**
 * Validate multiple gotchas against node data
 * @param gotchas - Array of gotcha texts to validate
 * @param node - The wiki node to validate against
 * @returns Array of validation results
 */
export function validateGotchas(gotchas: string[], node: WikiNode): ValidatedGotcha[] {
  return gotchas.map((gotcha) => validateGotcha(gotcha, node));
}

/**
 * Sleep for a given number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines if an error should trigger a retry
 */
function isRetryableError(error: Error, status?: number): boolean {
  // Retry on rate limits (429)
  if (status === 429) return true;

  // Retry on server errors (5xx)
  if (status && status >= 500) return true;

  // Retry on AbortError (timeout via AbortController)
  if (error.name === 'AbortError') return true;

  // Retry on network/timeout errors
  if (
    error.message.includes('timeout') ||
    error.message.includes('network') ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('aborted')
  ) {
    return true;
  }

  return false;
}

/**
 * Calls OpenRouter API and returns the response content
 * @param prompt - The prompt to send to the LLM
 * @param config - Generator configuration with API key and model
 * @param fetchFn - Optional fetch function for testing (defaults to global fetch)
 */
export async function callLLM(
  prompt: string,
  config: GeneratorConfig,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const maxRetries = 3;
  const timeout = config.timeout ?? 30000; // 30 seconds default

  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.3,
    response_format: { type: 'json_object' },
    plugins: [{ id: 'response-healing' }],
  };

  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  // Try up to maxRetries times
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Get proxy dispatcher for external URLs (won't apply for localhost/tests)
        const dispatcher = getProxyDispatcher(url);

        const response = await fetchFn(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/pith-wiki/pith',
            'X-Title': 'Pith Codebase Wiki',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          dispatcher,
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastStatus = response.status;

          if (response.status === 429) {
            lastError = new Error(
              `Rate limited by OpenRouter. Please wait and try again. ${errorText}`
            );
          } else {
            lastError = new Error(
              `OpenRouter API error: ${response.status} ${response.statusText}. ${errorText}`
            );
          }

          // Check if we should retry
          if (isRetryableError(lastError, response.status) && attempt < maxRetries) {
            // Exponential backoff: 2^attempt seconds
            const backoffMs = Math.pow(2, attempt) * 1000;
            await sleep(backoffMs);
            continue;
          }

          throw lastError;
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        const firstChoice = data.choices?.[0];
        if (!firstChoice) {
          throw new Error('Empty response from OpenRouter');
        }

        return firstChoice.message.content;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (isRetryableError(lastError, lastStatus) && attempt < maxRetries) {
        // Exponential backoff: 2^attempt seconds
        const backoffMs = Math.pow(2, attempt) * 1000;
        await sleep(backoffMs);
        continue;
      }

      throw lastError;
    }
  }

  // Fallback for edge case where maxRetries = 0 (loop never executes)
  throw lastError ?? new Error('Failed after maximum retry attempts');
}

/**
 * Options for generateProse
 */
export interface GenerateProseOptions {
  childSummaries?: Map<string, string>; // For module nodes
  fetchFn?: typeof fetch; // For testing
}

/**
 * Checks if an error is a JSON parsing error that should trigger a retry
 */
function isJsonParseError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('json') ||
    message.includes('parse') ||
    message.includes('unexpected token') ||
    message.includes('unterminated string')
  );
}

/**
 * Generates prose for a WikiNode by calling the LLM
 * @param node - The node to generate prose for
 * @param config - LLM provider configuration
 * @param options - Optional child summaries and fetch function
 */
export async function generateProse(
  node: WikiNode,
  config: GeneratorConfig,
  options: GenerateProseOptions = {}
): Promise<ProseData> {
  const { childSummaries, fetchFn } = options;

  // Build the prompt for this node type
  const prompt = buildPrompt(node, childSummaries);

  const maxParseRetries = 3;
  let lastError: Error | null = null;

  // Retry loop for JSON parse failures
  for (let attempt = 1; attempt <= maxParseRetries; attempt++) {
    // Call the LLM
    const response = await callLLM(prompt, config, fetchFn);

    try {
      // Parse the response into structured prose
      const prose = parseLLMResponse(response);

      // Validate gotchas and add confidence levels (Phase 6.5)
      if (prose.gotchas.length > 0) {
        const validatedGotchas = validateGotchas(prose.gotchas, node);
        prose.gotchaConfidence = validatedGotchas.map((v) => v.confidence);
      }

      return prose;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on JSON parse errors
      if (isJsonParseError(lastError) && attempt < maxParseRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(backoffMs);
        continue;
      }

      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Failed after maximum parse retry attempts');
}

/**
 * Updates a node in the database with generated prose
 * @param db - MangoDB database instance
 * @param nodeId - ID of the node to update
 * @param prose - Generated prose data
 * @returns true if node was updated, false if not found
 */
export async function updateNodeWithProse(
  db: MangoDb,
  nodeId: string,
  prose: ProseData
): Promise<boolean> {
  const nodes = db.collection<WikiNode>('nodes');

  const result = await nodes.updateOne({ id: nodeId }, { $set: { prose } });

  return result.modifiedCount > 0;
}

/**
 * Checks if a node's prose is stale (source changed after generation)
 * @param node - The node to check
 * @returns true if prose is stale, false otherwise
 */
export function isStale(node: WikiNode): boolean {
  if (!node.prose) {
    return false; // No prose = nothing to be stale
  }

  const lastModified = new Date(node.metadata.lastModified);
  const generatedAt = new Date(node.prose.generatedAt);

  return lastModified > generatedAt;
}

/**
 * Marks all nodes with stale prose in the database
 * @param db - MangoDB database instance
 * @returns Number of nodes marked stale
 */
export async function markStaleNodes(db: MangoDb): Promise<number> {
  const nodes = db.collection<WikiNode>('nodes');

  // Get all nodes with prose
  const nodesWithProse = await nodes.find({ prose: { $exists: true } }).toArray();

  let staleCount = 0;

  for (const node of nodesWithProse) {
    if (isStale(node)) {
      await nodes.updateOne({ id: node.id }, { $set: { 'prose.stale': true } });
      staleCount++;
    }
  }

  return staleCount;
}

/**
 * Generates prose for a node by ID and caches it to the database
 * @param nodeId - ID of the node to generate prose for
 * @param db - MangoDB database instance
 * @param config - LLM provider configuration
 * @param fetchFn - Optional fetch function for testing
 * @returns Updated node with prose, or null if node not found
 */
export async function generateProseForNode(
  nodeId: string,
  db: MangoDb,
  config: GeneratorConfig,
  fetchFn?: typeof fetch
): Promise<WikiNode | null> {
  const nodes = db.collection<WikiNode>('nodes');

  // Fetch the node from DB
  const node = await nodes.findOne({ id: nodeId });
  if (!node) {
    return null;
  }

  // For module nodes, gather child summaries
  let childSummaries: Map<string, string> | undefined;
  if (node.type === 'module') {
    const childIds = node.edges.filter((e) => e.type === 'contains').map((e) => e.target);

    const children = await nodes.find({ id: { $in: childIds } }).toArray();

    childSummaries = new Map(
      children.filter((c) => c.prose?.summary).map((c) => [c.id, c.prose!.summary])
    );
  }

  // Generate prose
  const prose = await generateProse(node, config, { childSummaries, fetchFn });

  // Cache to DB
  await updateNodeWithProse(db, nodeId, prose);

  // Return updated node
  return {
    ...node,
    prose,
  };
}
