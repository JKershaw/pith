import { SyntaxKind, type SourceFile } from 'ts-morph';
import type { ExtractedFile } from './ast.ts';

/**
 * A detected design pattern in the code.
 * Phase 6.6.6: Design Pattern Recognition
 */
export interface DetectedPattern {
  name: 'retry' | 'cache' | 'builder' | 'singleton';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];  // Line numbers and code snippets proving the pattern
  location: string;    // file:function or file path
}

/**
 * Detect retry pattern in functions.
 * Step 6.6.6.1: Look for loops with try/catch and exponential backoff.
 *
 * Retry pattern indicators:
 * - for/while loop with retry counter
 * - try/catch inside loop
 * - Math.pow or ** operator (exponential backoff)
 * - sleep/delay call
 *
 * @param extracted - The extracted file data
 * @returns Array of detected retry patterns
 */
export function detectRetryPattern(extracted: ExtractedFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Check each function for retry pattern
  for (const func of extracted.functions) {
    const evidence: string[] = [];
    let hasLoop = false;
    let hasTryCatch = false;
    let hasExponentialBackoff = false;
    let hasSleep = false;
    let hasRetryVariable = false;

    // Check keyStatements for retry indicators (more reliable than code snippet)
    for (const stmt of func.keyStatements) {
      // Look for retry/attempt variables
      if (stmt.category === 'config' && (stmt.text.includes('retry') || stmt.text.includes('attempt'))) {
        hasRetryVariable = true;
        const match = stmt.text.match(/(maxRetries|attempts|retries)\s*=\s*(\d+)/);
        if (match) {
          evidence.push(`line ${stmt.line}: ${match[1]} = ${match[2]}`);
        } else {
          evidence.push(`line ${stmt.line}: ${stmt.text.substring(0, 50)}`);
        }
      }

      // Look for exponential backoff
      if (stmt.category === 'math' && (stmt.text.includes('Math.pow') || stmt.text.includes('**'))) {
        hasExponentialBackoff = true;
        evidence.push(`line ${stmt.line}: exponential backoff`);
      }

      // Look for error handling
      if (stmt.category === 'error') {
        hasTryCatch = true;
      }

      // Look for retry conditions (status checks that trigger retries)
      if (stmt.category === 'condition' && (stmt.text.includes('429') || stmt.text.includes('500'))) {
        evidence.push(`line ${stmt.line}: retry condition ${stmt.text}`);
      }
    }

    // Also check code snippet for loops and sleep/delay
    if (func.codeSnippet.match(/\b(for|while)\s*\(/)) {
      hasLoop = true;
    }

    if (func.codeSnippet.match(/\b(sleep|delay|wait|setTimeout)\s*\(/)) {
      hasSleep = true;
      evidence.push('sleep/delay between retries');
    }

    // If code snippet doesn't show loop, check if we have retry variable and error handling
    // (indicates a loop even if not visible in snippet)
    if (!hasLoop && hasRetryVariable && hasTryCatch) {
      hasLoop = true; // Infer loop from retry logic
    }

    // Check for retry pattern: loop + try/catch + (exponential backoff or retry variable)
    const isRetryPattern = hasLoop && hasTryCatch && (hasExponentialBackoff || hasRetryVariable);

    if (isRetryPattern) {
      patterns.push({
        name: 'retry',
        confidence: 'high',
        evidence,
        location: `${extracted.path}:${func.name}`,
      });
    }
  }

  return patterns;
}

/**
 * Detect cache pattern in a module.
 * Step 6.6.6.2: Look for Map/Object + get/set/has functions.
 *
 * Cache pattern indicators:
 * - Module-level Map, Record, or interface with cache-like structure
 * - Functions with names like: load, save, get, set, has, clear
 * - Pattern: check cache → if miss, compute → store in cache
 *
 * @param extracted - The extracted file data
 * @returns Array of detected cache patterns
 */
export function detectCachePattern(extracted: ExtractedFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const evidence: string[] = [];

  // Look for cache-related types/interfaces
  let hasCacheType = false;
  for (const iface of extracted.interfaces) {
    if (iface.name.toLowerCase().includes('cache')) {
      hasCacheType = true;
      evidence.push(`interface ${iface.name}`);
    }
  }

  // Look for cache-related functions
  const cacheOperations = ['load', 'save', 'get', 'set', 'has', 'clear', 'invalidate'];
  const foundOperations: string[] = [];

  for (const func of extracted.functions) {
    const funcNameLower = func.name.toLowerCase();

    // Check if function name contains cache operations
    for (const op of cacheOperations) {
      if (funcNameLower.includes(op) && funcNameLower.includes('cache')) {
        foundOperations.push(func.name);
      }
    }

    // Also check for functions that work with cache even if not named explicitly
    if (func.codeSnippet.toLowerCase().includes('cache')) {
      if (!foundOperations.includes(func.name)) {
        foundOperations.push(func.name);
      }
    }
  }

  // Detect cache pattern if we have:
  // 1. A cache-related type, OR
  // 2. Multiple cache operations (at least 2)
  const isCachePattern = hasCacheType || foundOperations.length >= 2;

  if (isCachePattern) {
    if (foundOperations.length > 0) {
      evidence.push(`cache operations: ${foundOperations.join(', ')}`);
    }

    patterns.push({
      name: 'cache',
      confidence: 'high',
      evidence,
      location: extracted.path,
    });
  }

  return patterns;
}

/**
 * Detect builder pattern in classes.
 * Step 6.6.6.3: Look for chained methods returning `this`.
 *
 * Builder pattern indicators:
 * - Class methods that return `this`
 * - Multiple chainable methods (setters)
 * - Usually has a build() or create() method at the end
 *
 * @param extracted - The extracted file data
 * @returns Array of detected builder patterns
 */
export function detectBuilderPattern(extracted: ExtractedFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Check each class for builder pattern
  for (const cls of extracted.classes) {
    const evidence: string[] = [];
    let chainableMethodCount = 0;

    // Look for methods that return this
    for (const method of cls.methods) {
      if (method.codeSnippet.includes('return this')) {
        chainableMethodCount++;
        evidence.push(`${method.name} returns this`);
      }
    }

    // Builder pattern: at least 2 chainable methods
    if (chainableMethodCount >= 2) {
      patterns.push({
        name: 'builder',
        confidence: 'medium',
        evidence,
        location: `${extracted.path}:${cls.name}`,
      });
    }
  }

  return patterns;
}

/**
 * Detect singleton pattern in a module.
 * Step 6.6.6.4: Look for module-level instance variable + getter.
 *
 * Singleton pattern indicators:
 * - Module-level variable (let instance = null or undefined)
 * - Getter function that checks null and creates if needed
 * - Only one instance created
 *
 * @param extracted - The extracted file data
 * @returns Array of detected singleton patterns
 */
export function detectSingletonPattern(extracted: ExtractedFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const evidence: string[] = [];

  // Look for module-level instance variables
  let hasInstanceVar = false;
  let hasGetterFunction = false;

  // Check functions for singleton getter pattern
  for (const func of extracted.functions) {
    const snippet = func.codeSnippet.toLowerCase();

    // Look for instance variable check and creation
    if (snippet.includes('instance') &&
        (snippet.includes('null') || snippet.includes('undefined')) &&
        (snippet.includes('new ') || snippet.includes('create'))) {
      hasGetterFunction = true;
      evidence.push(`${func.name} checks and creates instance`);
    }

    // Also check for getInstance pattern
    if (func.name.toLowerCase().includes('getinstance') ||
        func.name.toLowerCase().includes('get') && snippet.includes('instance')) {
      hasGetterFunction = true;
      if (!evidence.some(e => e.includes(func.name))) {
        evidence.push(`${func.name} singleton getter`);
      }
    }
  }

  // Detect singleton pattern
  if (hasGetterFunction) {
    patterns.push({
      name: 'singleton',
      confidence: 'medium',
      evidence,
      location: extracted.path,
    });
  }

  return patterns;
}

/**
 * Detect all patterns in a file.
 * Step 6.6.6.5: Run all pattern detectors and validate results.
 *
 * @param extracted - The extracted file data
 * @returns Array of all detected patterns
 */
export function detectPatterns(extracted: ExtractedFile): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Run all pattern detectors
  patterns.push(...detectRetryPattern(extracted));
  patterns.push(...detectCachePattern(extracted));
  patterns.push(...detectBuilderPattern(extracted));
  patterns.push(...detectSingletonPattern(extracted));

  // Step 6.6.6.5: Validate detected patterns
  // For now, basic validation is done in each detector
  // Future: Add cross-checking with AST evidence

  return patterns;
}

/**
 * Add pattern detection to an extracted file.
 * Modifies the extracted file in place to add detected patterns.
 *
 * @param extracted - The extracted file data to add patterns to
 */
export function addPatternsToExtractedFile(extracted: ExtractedFile): void {
  const patterns = detectPatterns(extracted);
  if (patterns.length > 0) {
    extracted.patterns = patterns;
  }
}
