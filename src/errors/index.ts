/**
 * Error handling utilities for Pith
 * Provides structured error types with severity levels and suggestions
 */

/**
 * Error codes for different failure scenarios
 */
export type ErrorCode =
  | 'PARSE_ERROR'      // Failed to parse TypeScript file
  | 'GIT_ERROR'        // Git operation failed
  | 'LLM_ERROR'        // LLM API call failed
  | 'CONFIG_ERROR'     // Configuration error
  | 'FILE_NOT_FOUND';  // File or directory not found

/**
 * Error severity levels
 */
export type ErrorSeverity = 'fatal' | 'error' | 'warning';

/**
 * Custom error class with structured information
 */
export class PithError extends Error {
  code: ErrorCode;
  severity: ErrorSeverity;
  suggestion?: string;

  constructor(
    code: ErrorCode,
    message: string,
    severity: ErrorSeverity = 'error',
    suggestion?: string
  ) {
    super(message);
    this.name = 'PithError';
    this.code = code;
    this.severity = severity;
    this.suggestion = suggestion;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PithError);
    }
  }
}

/**
 * Format an error for user-friendly display
 * @param error - The error to format
 * @returns Formatted error string
 */
export function formatError(error: Error | PithError): string {
  const isPithError = error instanceof PithError;

  // Determine severity label
  let label = 'Error';
  if (isPithError) {
    if (error.severity === 'fatal') {
      label = 'Fatal';
    } else if (error.severity === 'warning') {
      label = 'Warning';
    }
  }

  // Build formatted message
  let formatted = `${label}: ${error.message}`;

  if (isPithError) {
    formatted += `\n  Type: ${error.code}`;
    if (error.suggestion) {
      formatted += `\n  Suggestion: ${error.suggestion}`;
    }
  }

  return formatted;
}

/**
 * Group errors by severity level
 * @param errors - Array of errors to group
 * @returns Object with errors grouped by severity
 */
export function groupErrorsBySeverity(errors: Array<Error | PithError>): {
  fatal: Array<Error | PithError>;
  error: Array<Error | PithError>;
  warning: Array<Error | PithError>;
} {
  const grouped = {
    fatal: [] as Array<Error | PithError>,
    error: [] as Array<Error | PithError>,
    warning: [] as Array<Error | PithError>,
  };

  for (const error of errors) {
    if (error instanceof PithError) {
      grouped[error.severity].push(error);
    } else {
      // Standard errors default to 'error' severity
      grouped.error.push(error);
    }
  }

  return grouped;
}

/**
 * Get a helpful suggestion for a given error code
 * @param code - The error code
 * @returns Suggestion text
 */
export function getSuggestion(code: ErrorCode): string {
  const suggestions: Record<ErrorCode, string> = {
    PARSE_ERROR: 'Check for syntax errors in the file. Ensure the file is valid TypeScript.',
    GIT_ERROR: 'Verify that the directory is a git repository and git is properly configured.',
    LLM_ERROR: 'Try again later. Check your API key and rate limits.',
    CONFIG_ERROR: 'Check your pith.config.json file and ensure all required fields are present.',
    FILE_NOT_FOUND: 'Verify the path exists and you have permission to access it.',
  };

  return suggestions[code] || 'Please check the error message for details.';
}
