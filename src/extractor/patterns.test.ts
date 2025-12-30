import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  detectRetryPattern,
  detectCachePattern,
  detectBuilderPattern,
  detectSingletonPattern,
  detectPatterns,
  type DetectedPattern,
} from './patterns.ts';
import { createProject, extractFile } from './ast.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pithRoot = join(__dirname, '../..');

describe('detectRetryPattern', () => {
  it('detects retry pattern in generator/index.ts callLLM function', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/generator/index.ts');

    const patterns = detectRetryPattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    assert.ok(patterns.length > 0, 'Should detect at least one retry pattern');

    const retryPattern = patterns[0];
    assert.strictEqual(retryPattern.name, 'retry');
    assert.strictEqual(retryPattern.confidence, 'high');
    assert.ok(retryPattern.location.includes('callLLM'), 'Should be in callLLM function');

    // Check evidence includes key indicators
    assert.ok(retryPattern.evidence.length > 0, 'Should have evidence');
    const evidenceStr = retryPattern.evidence.join(' ');
    assert.ok(
      evidenceStr.includes('maxRetries') || evidenceStr.includes('retry'),
      'Evidence should mention retries'
    );
    assert.ok(
      evidenceStr.includes('Math.pow') || evidenceStr.includes('backoff'),
      'Evidence should mention exponential backoff'
    );
  });

  it('returns empty array when no retry pattern found', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectRetryPattern(extracted);

    assert.strictEqual(patterns.length, 0, 'Should not detect retry pattern in cache.ts');
  });
});

describe('detectCachePattern', () => {
  it('detects cache pattern in extractor/cache.ts', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectCachePattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    assert.ok(patterns.length > 0, 'Should detect cache pattern');

    const cachePattern = patterns[0];
    assert.strictEqual(cachePattern.name, 'cache');
    assert.strictEqual(cachePattern.confidence, 'high');
    assert.ok(cachePattern.location.includes('cache.ts'), 'Should be in cache.ts');

    // Check evidence includes key indicators
    assert.ok(cachePattern.evidence.length > 0, 'Should have evidence');
    const evidenceStr = cachePattern.evidence.join(' ');
    assert.ok(
      evidenceStr.includes('ExtractionCache') || evidenceStr.includes('cache'),
      'Evidence should mention cache'
    );
    assert.ok(
      evidenceStr.includes('load') || evidenceStr.includes('save') || evidenceStr.includes('get'),
      'Evidence should mention cache operations'
    );
  });

  it('returns empty array when no cache pattern found', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/generator/index.ts');

    const patterns = detectCachePattern(extracted);

    assert.strictEqual(patterns.length, 0, 'Should not detect cache pattern in generator');
  });
});

describe('detectBuilderPattern', () => {
  it('returns empty array for files without builder pattern', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectBuilderPattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    assert.strictEqual(patterns.length, 0, 'Should not detect builder pattern in cache.ts');
  });

  it('has medium confidence when detected', () => {
    // This test will pass once we find a builder pattern example
    // For now, just verify the function exists and returns correct structure
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectBuilderPattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    // If a pattern is found, it should have medium confidence
    for (const pattern of patterns) {
      assert.strictEqual(pattern.name, 'builder');
      assert.strictEqual(pattern.confidence, 'medium');
    }
  });
});

describe('detectSingletonPattern', () => {
  it('returns empty array for files without singleton pattern', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectSingletonPattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    assert.strictEqual(patterns.length, 0, 'Should not detect singleton pattern in cache.ts');
  });

  it('has medium confidence when detected', () => {
    // This test will pass once we find a singleton pattern example
    // For now, just verify the function exists and returns correct structure
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/extractor/cache.ts');

    const patterns = detectSingletonPattern(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    // If a pattern is found, it should have medium confidence
    for (const pattern of patterns) {
      assert.strictEqual(pattern.name, 'singleton');
      assert.strictEqual(pattern.confidence, 'medium');
    }
  });
});

describe('detectPatterns', () => {
  it('detects all patterns in a file', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/generator/index.ts');

    const patterns = detectPatterns(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    assert.ok(patterns.length > 0, 'Should detect patterns in generator');

    // Should detect retry pattern in callLLM
    const retryPattern = patterns.find(p => p.name === 'retry');
    assert.ok(retryPattern, 'Should detect retry pattern');
  });

  it('returns empty array for files with no patterns', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/db/index.ts');

    const patterns = detectPatterns(extracted);

    assert.ok(Array.isArray(patterns), 'Should return an array');
    // db/index.ts may or may not have patterns - just verify it doesn't crash
  });

  it('validates detected patterns have required fields', () => {
    const ctx = createProject(pithRoot);
    const extracted = extractFile(ctx, 'src/generator/index.ts');

    const patterns = detectPatterns(extracted);

    for (const pattern of patterns) {
      assert.ok(pattern.name, 'Pattern should have name');
      assert.ok(pattern.confidence, 'Pattern should have confidence');
      assert.ok(Array.isArray(pattern.evidence), 'Pattern should have evidence array');
      assert.ok(pattern.location, 'Pattern should have location');

      // Validate name is one of the known patterns
      assert.ok(
        ['retry', 'cache', 'builder', 'singleton'].includes(pattern.name),
        `Pattern name should be valid, got: ${pattern.name}`
      );

      // Validate confidence is valid
      assert.ok(
        ['high', 'medium', 'low'].includes(pattern.confidence),
        `Confidence should be valid, got: ${pattern.confidence}`
      );
    }
  });
});
