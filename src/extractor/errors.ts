import { SyntaxKind, type FunctionDeclaration, type MethodDeclaration } from 'ts-morph';

/**
 * An error path detected in a function.
 * Phase 6.6.8: Error Path Analysis
 * Phase 6.8.4: Enhanced with condition chains and HTTP status codes
 */
export interface ErrorPath {
  type: 'early-return' | 'throw' | 'catch' | 'guard';
  line: number;
  condition?: string; // The condition that triggers this path (for guards and conditional returns)
  action: string; // What happens (return value, error thrown, etc.)
  // Phase 6.8.4 additions:
  conditionChain?: string[]; // Full chain of nested conditions (6.8.4.1)
  httpStatus?: number; // Detected HTTP status code (6.8.4.2)
}

/**
 * Enhanced error summary grouped by HTTP status code.
 * Phase 6.8.4.2: Group error causes by HTTP status code.
 */
export interface ErrorSummaryByStatus {
  status: number;
  paths: ErrorPath[];
  description: string;
}

/**
 * Map of HTTP status codes to descriptions.
 */
const HTTP_STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Extract early return statements from a function.
 * Step 6.6.8.1: Find return statements that exit early (not at end of function).
 *
 * Early returns are returns that:
 * - Are inside if/else blocks
 * - Are not the final statement of the function
 * - Usually handle edge cases or validation failures
 *
 * @param func - The function or method declaration to analyze
 * @returns Array of early return error paths
 */
export function extractEarlyReturns(func: FunctionDeclaration | MethodDeclaration): ErrorPath[] {
  const earlyReturns: ErrorPath[] = [];

  // Get all return statements
  const returnStatements = func.getDescendantsOfKind(SyntaxKind.ReturnStatement);

  // Get the last statement in the function body
  const body = func.getBody();
  if (!body) return earlyReturns;

  const statements =
    body.getKind() === SyntaxKind.Block ? body.asKindOrThrow(SyntaxKind.Block).getStatements() : [];

  const lastStatement = statements[statements.length - 1];
  const lastStatementLine = lastStatement?.getStartLineNumber();

  for (const returnStmt of returnStatements) {
    const line = returnStmt.getStartLineNumber();

    // Check if this is the last statement (not an early return)
    if (line === lastStatementLine) {
      continue;
    }

    // Check if this return is inside a conditional block
    const ifStmt = returnStmt.getFirstAncestorByKind(SyntaxKind.IfStatement);
    const caseClause = returnStmt.getFirstAncestorByKind(SyntaxKind.CaseClause);
    const catchClause = returnStmt.getFirstAncestorByKind(SyntaxKind.CatchClause);

    // Only consider it an early return if it's in a conditional context
    if (ifStmt || caseClause || catchClause) {
      let condition: string | undefined;
      const returnExpr = returnStmt.getExpression();
      const action = returnExpr ? `return ${returnExpr.getText()}` : 'return';

      // Extract condition from if statement
      if (ifStmt) {
        condition = ifStmt.getExpression().getText();
      } else if (caseClause) {
        const caseExpr = caseClause.getExpression();
        condition = caseExpr ? `case ${caseExpr.getText()}` : undefined;
      } else if (catchClause) {
        const param = catchClause.getVariableDeclaration();
        const paramText = param ? param.getText() : 'error';
        condition = `catch (${paramText})`;
      }

      earlyReturns.push({
        type: 'early-return',
        line,
        condition,
        action,
      });
    }
  }

  return earlyReturns;
}

/**
 * Extract throw statements from a function.
 * Step 6.6.8.1: Find all throw statements.
 *
 * @param func - The function or method declaration to analyze
 * @returns Array of throw error paths
 */
export function extractThrowStatements(func: FunctionDeclaration | MethodDeclaration): ErrorPath[] {
  const throws: ErrorPath[] = [];

  // Find all throw statements
  const throwStatements = func.getDescendantsOfKind(SyntaxKind.ThrowStatement);

  for (const throwStmt of throwStatements) {
    const line = throwStmt.getStartLineNumber();
    const expression = throwStmt.getExpression();
    const action = `throw ${expression.getText()}`;

    // Check if throw is inside a conditional
    const ifStmt = throwStmt.getFirstAncestorByKind(SyntaxKind.IfStatement);
    const caseClause = throwStmt.getFirstAncestorByKind(SyntaxKind.CaseClause);

    let condition: string | undefined;
    if (ifStmt) {
      condition = ifStmt.getExpression().getText();
    } else if (caseClause) {
      const caseExpr = caseClause.getExpression();
      condition = caseExpr ? `case ${caseExpr.getText()}` : undefined;
    }

    throws.push({
      type: 'throw',
      line,
      condition,
      action,
    });
  }

  return throws;
}

/**
 * Extract catch blocks and analyze error propagation.
 * Step 6.6.8.2: Trace error propagation in catch blocks.
 *
 * Analyzes what happens in catch blocks:
 * - Re-throw: catch (e) { throw e; } or catch (e) { throw ... }
 * - Transform: catch (e) { throw new WrapperError(e); }
 * - Log: catch (e) { console.log/error(...) }
 * - Swallow: catch (e) { } or catch (e) { return ... }
 *
 * @param func - The function or method declaration to analyze
 * @returns Array of catch block error paths
 */
export function extractCatchBlocks(func: FunctionDeclaration | MethodDeclaration): ErrorPath[] {
  const catchPaths: ErrorPath[] = [];

  // Find all catch clauses
  const catchClauses = func.getDescendantsOfKind(SyntaxKind.CatchClause);

  for (const catchClause of catchClauses) {
    const line = catchClause.getStartLineNumber();
    const param = catchClause.getVariableDeclaration();
    const paramText = param ? param.getText() : 'error';
    const condition = `catch (${paramText})`;

    // Analyze what happens in the catch block
    const block = catchClause.getBlock();
    const statements = block.getStatements();

    // Determine the action
    let action = '';
    const hasThrow = block.getDescendantsOfKind(SyntaxKind.ThrowStatement).length > 0;
    const hasReturn = block.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0;
    // Use AST-based detection for console calls to avoid false positives from string literals
    const hasConsoleLog = block.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
      const callText = call.getExpression().getText();
      return (
        callText === 'console.log' || callText === 'console.error' || callText === 'console.warn'
      );
    });

    if (statements.length === 0) {
      action = 'swallows error (empty catch)';
    } else if (hasThrow) {
      const throwStmt = block.getDescendantsOfKind(SyntaxKind.ThrowStatement)[0];
      const throwExpr = throwStmt?.getExpression().getText() || '';

      // Check if it's re-throwing the same error or transforming it
      const paramName = param?.getName() || 'error';
      if (throwExpr === paramName || throwExpr === `(${paramName})`) {
        action = 're-throws error';
      } else if (throwExpr.includes(paramName)) {
        action = `transforms error: ${throwExpr}`;
      } else {
        action = `throws new error: ${throwExpr}`;
      }
    } else if (hasReturn) {
      const returnStmt = block.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
      const returnExpr = returnStmt?.getExpression()?.getText();
      action = returnExpr ? `returns ${returnExpr}` : 'returns (swallows error)';
    } else if (hasConsoleLog) {
      action = 'logs and continues';
    } else {
      // Some other action - just indicate we handle it
      action = 'handles error';
    }

    catchPaths.push({
      type: 'catch',
      line,
      condition,
      action,
    });
  }

  return catchPaths;
}

/**
 * Extract validation guards from the beginning of a function.
 * Step 6.6.8.3: Identify validation guards (if checks before main logic).
 *
 * Validation guards are:
 * - if statements at the beginning of a function (first ~5 statements)
 * - That check parameters or preconditions
 * - That return or throw if validation fails
 *
 * @param func - The function or method declaration to analyze
 * @returns Array of validation guard error paths
 */
export function extractValidationGuards(
  func: FunctionDeclaration | MethodDeclaration
): ErrorPath[] {
  const guards: ErrorPath[] = [];

  const body = func.getBody();
  if (!body) return guards;

  const statements =
    body.getKind() === SyntaxKind.Block ? body.asKindOrThrow(SyntaxKind.Block).getStatements() : [];

  // Only look at the first 5 statements (typical guard location)
  const earlyStatements = statements.slice(0, 5);

  for (const stmt of earlyStatements) {
    // Look for if statements
    if (stmt.getKind() !== SyntaxKind.IfStatement) {
      continue;
    }

    const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
    if (!ifStmt) continue;

    const thenBlock = ifStmt.getThenStatement();

    // Check if the then block contains a return or throw
    const hasReturn = thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0;
    const hasThrow = thenBlock.getDescendantsOfKind(SyntaxKind.ThrowStatement).length > 0;

    if (hasReturn || hasThrow) {
      const line = ifStmt.getStartLineNumber();
      const condition = ifStmt.getExpression().getText();

      let action = '';
      if (hasThrow) {
        const throwStmt = thenBlock.getDescendantsOfKind(SyntaxKind.ThrowStatement)[0];
        const throwExpr = throwStmt?.getExpression().getText() || '';
        action = `throws ${throwExpr}`;
      } else if (hasReturn) {
        const returnStmt = thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
        const returnExpr = returnStmt?.getExpression()?.getText();
        action = returnExpr ? `returns ${returnExpr}` : 'returns';
      }

      guards.push({
        type: 'guard',
        line,
        condition,
        action,
      });
    }
  }

  return guards;
}

/**
 * Extract all error paths from a function.
 * Combines early returns, throws, catch blocks, and validation guards.
 *
 * @param func - The function or method declaration to analyze
 * @returns Array of all error paths found
 */
export function extractErrorPaths(func: FunctionDeclaration | MethodDeclaration): ErrorPath[] {
  const errorPaths: ErrorPath[] = [];

  // Extract all error path types
  errorPaths.push(...extractValidationGuards(func)); // Guards first (they're at the top)
  errorPaths.push(...extractEarlyReturns(func));
  errorPaths.push(...extractThrowStatements(func));
  errorPaths.push(...extractCatchBlocks(func));

  // Sort by line number
  errorPaths.sort((a, b) => a.line - b.line);

  // Phase 6.8.4: Enhance with condition chains and HTTP status codes
  for (const path of errorPaths) {
    path.httpStatus = detectHttpStatus(path);
  }

  return errorPaths;
}

/**
 * Detect HTTP status code from an error path.
 * Phase 6.8.4.2: Looks for status codes in conditions and actions.
 * @param path - The error path to analyze
 * @returns The HTTP status code if detected, undefined otherwise
 */
function detectHttpStatus(path: ErrorPath): number | undefined {
  const textToSearch = [path.condition || '', path.action].join(' ');

  // Look for status code patterns: 404, status === 404, etc.
  const statusMatch = textToSearch.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (HTTP_STATUS_DESCRIPTIONS[status]) {
      return status;
    }
  }

  // Look for error type patterns
  if (textToSearch.match(/not\s*found|NotFound/i)) {
    return 404;
  }
  if (textToSearch.match(/unauthorized|Unauthorized/i)) {
    return 401;
  }
  if (textToSearch.match(/forbidden|Forbidden/i)) {
    return 403;
  }
  if (textToSearch.match(/bad\s*request|BadRequest|invalid/i)) {
    return 400;
  }
  if (textToSearch.match(/too\s*many\s*requests|rate\s*limit/i)) {
    return 429;
  }

  return undefined;
}

/**
 * Group error paths by HTTP status code.
 * Phase 6.8.4.2: Group error causes by HTTP status code.
 * @param paths - Array of error paths to group
 * @returns Array of error summaries grouped by status code
 */
export function groupErrorsByStatus(paths: ErrorPath[]): ErrorSummaryByStatus[] {
  const grouped = new Map<number, ErrorPath[]>();

  for (const path of paths) {
    if (path.httpStatus) {
      const existing = grouped.get(path.httpStatus) || [];
      existing.push(path);
      grouped.set(path.httpStatus, existing);
    }
  }

  const result: ErrorSummaryByStatus[] = [];
  for (const [status, statusPaths] of grouped) {
    result.push({
      status,
      paths: statusPaths,
      description: HTTP_STATUS_DESCRIPTIONS[status] || `HTTP ${status}`,
    });
  }

  // Sort by status code
  result.sort((a, b) => a.status - b.status);

  return result;
}

/**
 * Format a condition chain as a readable string.
 * Phase 6.8.4.1: Show the full condition chain.
 * @param path - The error path with conditions
 * @returns Formatted condition chain string
 */
export function formatConditionChain(path: ErrorPath): string {
  if (path.conditionChain && path.conditionChain.length > 0) {
    return path.conditionChain.join(' && ');
  }
  return path.condition || 'unconditional';
}

/**
 * Format error paths for debugging output.
 * Phase 6.8.4: Enhanced debugging output.
 * @param paths - Array of error paths to format
 * @returns Formatted markdown string
 */
export function formatErrorPathsForDebugging(paths: ErrorPath[]): string {
  const lines: string[] = [];

  // Group by HTTP status
  const byStatus = groupErrorsByStatus(paths);

  if (byStatus.length > 0) {
    lines.push('### Error Paths by HTTP Status');
    lines.push('');

    for (const group of byStatus) {
      lines.push(`**${group.status} ${group.description}** (${group.paths.length} path(s)):`);
      for (const path of group.paths) {
        const condition = formatConditionChain(path);
        lines.push(`- Line ${path.line}: ${condition} → ${path.action}`);
      }
      lines.push('');
    }
  }

  // Show paths without HTTP status
  const withoutStatus = paths.filter((p) => !p.httpStatus);
  if (withoutStatus.length > 0) {
    lines.push('### Other Error Paths');
    lines.push('');
    for (const path of withoutStatus) {
      const condition = formatConditionChain(path);
      lines.push(`- Line ${path.line} (${path.type}): ${condition} → ${path.action}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
