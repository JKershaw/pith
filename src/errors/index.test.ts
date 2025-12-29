import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PithError,
  formatError,
  groupErrorsBySeverity,
  getSuggestion,
  type ErrorCode,
  type ErrorSeverity,
} from './index.ts';

describe('PithError', () => {
  it('creates error with all properties', () => {
    const error = new PithError(
      'PARSE_ERROR',
      'Failed to parse file',
      'fatal',
      'Check for syntax errors'
    );

    assert.strictEqual(error.code, 'PARSE_ERROR');
    assert.strictEqual(error.message, 'Failed to parse file');
    assert.strictEqual(error.severity, 'fatal');
    assert.strictEqual(error.suggestion, 'Check for syntax errors');
    assert.ok(error instanceof Error);
  });

  it('creates error without suggestion', () => {
    const error = new PithError(
      'CONFIG_ERROR',
      'Invalid config',
      'error'
    );

    assert.strictEqual(error.code, 'CONFIG_ERROR');
    assert.strictEqual(error.severity, 'error');
    assert.strictEqual(error.suggestion, undefined);
  });

  it('has default severity of error', () => {
    const error = new PithError(
      'FILE_NOT_FOUND',
      'File not found'
    );

    assert.strictEqual(error.severity, 'error');
  });
});

describe('formatError', () => {
  it('formats error with all fields', () => {
    const error = new PithError(
      'PARSE_ERROR',
      'Failed to parse src/broken.ts',
      'error',
      'Check for syntax errors in the file'
    );

    const formatted = formatError(error);

    assert.ok(formatted.includes('Error: Failed to parse src/broken.ts'));
    assert.ok(formatted.includes('Type: PARSE_ERROR'));
    assert.ok(formatted.includes('Suggestion: Check for syntax errors in the file'));
  });

  it('formats fatal error', () => {
    const error = new PithError(
      'GIT_ERROR',
      'Git repository not found',
      'fatal'
    );

    const formatted = formatError(error);

    assert.ok(formatted.includes('Fatal: Git repository not found'));
    assert.ok(formatted.includes('Type: GIT_ERROR'));
  });

  it('formats warning', () => {
    const error = new PithError(
      'LLM_ERROR',
      'Rate limited (429)',
      'warning',
      'Retrying in a few seconds...'
    );

    const formatted = formatError(error);

    assert.ok(formatted.includes('Warning: Rate limited (429)'));
    assert.ok(formatted.includes('Type: LLM_ERROR'));
    assert.ok(formatted.includes('Suggestion: Retrying in a few seconds...'));
  });

  it('formats error without suggestion', () => {
    const error = new PithError(
      'CONFIG_ERROR',
      'Missing config file',
      'error'
    );

    const formatted = formatError(error);

    assert.ok(formatted.includes('Error: Missing config file'));
    assert.ok(!formatted.includes('Suggestion:'));
  });

  it('formats standard Error objects', () => {
    const error = new Error('Standard error message');
    const formatted = formatError(error);

    assert.ok(formatted.includes('Error: Standard error message'));
    assert.ok(!formatted.includes('Type:'));
  });
});

describe('groupErrorsBySeverity', () => {
  it('groups errors by severity level', () => {
    const errors: Array<PithError | Error> = [
      new PithError('PARSE_ERROR', 'Parse error 1', 'error'),
      new PithError('GIT_ERROR', 'Git error', 'fatal'),
      new PithError('LLM_ERROR', 'LLM warning', 'warning'),
      new PithError('PARSE_ERROR', 'Parse error 2', 'error'),
      new Error('Standard error'),
    ];

    const grouped = groupErrorsBySeverity(errors);

    assert.strictEqual(grouped.fatal.length, 1);
    assert.strictEqual(grouped.error.length, 3); // 2 PithErrors + 1 standard Error
    assert.strictEqual(grouped.warning.length, 1);
  });

  it('handles empty error array', () => {
    const grouped = groupErrorsBySeverity([]);

    assert.strictEqual(grouped.fatal.length, 0);
    assert.strictEqual(grouped.error.length, 0);
    assert.strictEqual(grouped.warning.length, 0);
  });

  it('defaults standard errors to error severity', () => {
    const errors = [new Error('Test error')];
    const grouped = groupErrorsBySeverity(errors);

    assert.strictEqual(grouped.error.length, 1);
    assert.strictEqual(grouped.fatal.length, 0);
    assert.strictEqual(grouped.warning.length, 0);
  });
});

describe('getSuggestion', () => {
  it('suggests solution for PARSE_ERROR', () => {
    const suggestion = getSuggestion('PARSE_ERROR');
    assert.ok(suggestion.includes('syntax'));
  });

  it('suggests solution for GIT_ERROR', () => {
    const suggestion = getSuggestion('GIT_ERROR');
    assert.ok(suggestion.includes('git') || suggestion.includes('repository'));
  });

  it('suggests solution for LLM_ERROR', () => {
    const suggestion = getSuggestion('LLM_ERROR');
    assert.ok(suggestion.includes('Try again') || suggestion.includes('retry'));
  });

  it('suggests solution for CONFIG_ERROR', () => {
    const suggestion = getSuggestion('CONFIG_ERROR');
    assert.ok(suggestion.includes('config'));
  });

  it('suggests solution for FILE_NOT_FOUND', () => {
    const suggestion = getSuggestion('FILE_NOT_FOUND');
    assert.ok(suggestion.includes('path') || suggestion.includes('exists'));
  });

  it('returns generic suggestion for unknown error code', () => {
    const suggestion = getSuggestion('UNKNOWN_ERROR' as ErrorCode);
    assert.ok(suggestion.length > 0);
  });
});

describe('error types', () => {
  it('ErrorCode includes all expected codes', () => {
    const codes: ErrorCode[] = [
      'PARSE_ERROR',
      'GIT_ERROR',
      'LLM_ERROR',
      'CONFIG_ERROR',
      'FILE_NOT_FOUND',
    ];

    // Just verify the type compiles
    codes.forEach(code => {
      assert.ok(typeof code === 'string');
    });
  });

  it('ErrorSeverity includes all levels', () => {
    const severities: ErrorSeverity[] = ['fatal', 'error', 'warning'];

    severities.forEach(severity => {
      assert.ok(['fatal', 'error', 'warning'].includes(severity));
    });
  });
});
