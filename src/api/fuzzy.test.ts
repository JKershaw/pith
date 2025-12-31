import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  levenshteinDistance,
  scoreSimilarity,
  normalizeScore,
  findBestMatches,
  fuzzyMatch,
  AUTO_MATCH_THRESHOLD,
  SUGGESTION_THRESHOLD,
} from './fuzzy.ts';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    assert.strictEqual(levenshteinDistance('hello', 'hello'), 0);
    assert.strictEqual(levenshteinDistance('', ''), 0);
  });

  it('returns length of non-empty string when other is empty', () => {
    assert.strictEqual(levenshteinDistance('hello', ''), 5);
    assert.strictEqual(levenshteinDistance('', 'world'), 5);
  });

  it('counts single character differences', () => {
    assert.strictEqual(levenshteinDistance('cat', 'bat'), 1); // substitution
    assert.strictEqual(levenshteinDistance('cat', 'cats'), 1); // insertion
    assert.strictEqual(levenshteinDistance('cats', 'cat'), 1); // deletion
  });

  it('handles multiple edits', () => {
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
    assert.strictEqual(levenshteinDistance('extract', 'extractor'), 2);
    assert.strictEqual(levenshteinDistance('build', 'builder'), 2);
  });

  it('is symmetric', () => {
    assert.strictEqual(levenshteinDistance('abc', 'def'), levenshteinDistance('def', 'abc'));
  });
});

describe('scoreSimilarity', () => {
  it('gives high score for exact match', () => {
    const score = scoreSimilarity('src/api/index.ts', 'src/api/index.ts');
    assert.ok(score > 60, `Expected score > 60, got ${score}`);
  });

  it('gives high score for same filename with similar directory', () => {
    // This is the key case: src/extract/index.ts vs src/extractor/index.ts
    const score = scoreSimilarity('src/extract/index.ts', 'src/extractor/index.ts');
    assert.ok(score > 50, `Expected score > 50, got ${score}`);
  });

  it('gives high score for build vs builder', () => {
    const score = scoreSimilarity('src/build/index.ts', 'src/builder/index.ts');
    assert.ok(score > 50, `Expected score > 50, got ${score}`);
  });

  it('gives low score for completely different paths', () => {
    const score = scoreSimilarity('src/api/routes.ts', 'lib/utils/helpers.ts');
    assert.ok(score < 30, `Expected score < 30, got ${score}`);
  });

  it('prefers same filename over similar directory', () => {
    const scoreExactFilename = scoreSimilarity('src/foo/index.ts', 'src/bar/index.ts');
    const scoreSimilarDir = scoreSimilarity('src/foo/index.ts', 'src/foo/other.ts');
    assert.ok(
      scoreExactFilename > scoreSimilarDir,
      `Expected ${scoreExactFilename} > ${scoreSimilarDir}`
    );
  });

  it('handles different directory depths', () => {
    const score = scoreSimilarity('src/index.ts', 'src/api/index.ts');
    assert.ok(score > 40, `Expected score > 40, got ${score}`);
  });

  it('penalizes very different filenames', () => {
    const score = scoreSimilarity('src/api/foo.ts', 'src/api/bar.ts');
    assert.ok(score < 40, `Expected score < 40, got ${score}`);
  });
});

describe('normalizeScore', () => {
  it('returns 1 for high scores', () => {
    assert.strictEqual(normalizeScore(70), 1);
    assert.strictEqual(normalizeScore(100), 1);
  });

  it('returns 0 for negative or zero scores', () => {
    assert.strictEqual(normalizeScore(0), 0);
    assert.strictEqual(normalizeScore(-10), 0);
  });

  it('returns proportional values for middle scores', () => {
    const mid = normalizeScore(35);
    assert.ok(mid >= 0.4 && mid <= 0.6, `Expected ~0.5, got ${mid}`);
  });

  it('rounds to 2 decimal places', () => {
    const score = normalizeScore(45);
    const decimals = score.toString().split('.')[1]?.length || 0;
    assert.ok(decimals <= 2, `Expected <= 2 decimals, got ${decimals}`);
  });
});

describe('findBestMatches', () => {
  const candidates = [
    'src/api/index.ts',
    'src/api/routes.ts',
    'src/extractor/index.ts',
    'src/extractor/ast.ts',
    'src/builder/index.ts',
    'src/generator/index.ts',
    'src/db/index.ts',
    'src/cli/index.ts',
  ];

  it('finds exact matches first', () => {
    const matches = findBestMatches('src/api/index.ts', candidates);
    assert.strictEqual(matches[0]?.path, 'src/api/index.ts');
    assert.strictEqual(matches[0]?.confidence, 1);
  });

  it('finds src/extractor for src/extract query', () => {
    const matches = findBestMatches('src/extract/index.ts', candidates);
    assert.strictEqual(matches[0]?.path, 'src/extractor/index.ts');
    assert.ok(
      matches[0]!.confidence >= 0.7,
      `Expected confidence >= 0.7, got ${matches[0]?.confidence}`
    );
  });

  it('finds src/builder for src/build query', () => {
    const matches = findBestMatches('src/build/index.ts', candidates);
    assert.strictEqual(matches[0]?.path, 'src/builder/index.ts');
    assert.ok(
      matches[0]!.confidence >= 0.7,
      `Expected confidence >= 0.7, got ${matches[0]?.confidence}`
    );
  });

  it('finds src/generator for src/generate query', () => {
    const matches = findBestMatches('src/generate/index.ts', candidates);
    assert.strictEqual(matches[0]?.path, 'src/generator/index.ts');
    assert.ok(
      matches[0]!.confidence >= 0.7,
      `Expected confidence >= 0.7, got ${matches[0]?.confidence}`
    );
  });

  it('returns multiple alternatives sorted by score', () => {
    const matches = findBestMatches('src/api/foo.ts', candidates, 3);
    assert.ok(matches.length <= 3);
    for (let i = 1; i < matches.length; i++) {
      assert.ok(
        matches[i]!.score <= matches[i - 1]!.score,
        'Matches should be sorted by score descending'
      );
    }
  });

  it('respects topN limit', () => {
    const matches = findBestMatches('src/index.ts', candidates, 2);
    assert.ok(matches.length <= 2);
  });

  it('handles queries with no good matches', () => {
    const matches = findBestMatches('zzz/yyy/xxx.xyz', candidates);
    if (matches.length > 0) {
      assert.ok(
        matches[0]!.confidence < 0.4,
        `Expected low confidence for bad match, got ${matches[0]?.confidence}`
      );
    }
  });
});

describe('fuzzyMatch', () => {
  const candidates = [
    'src/api/index.ts',
    'src/extractor/index.ts',
    'src/extractor/ast.ts',
    'src/builder/index.ts',
    'src/generator/index.ts',
  ];

  it('returns high-confidence match for extract -> extractor', () => {
    const result = fuzzyMatch('src/extract/index.ts', candidates);
    assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
    assert.ok(
      result.confidence >= AUTO_MATCH_THRESHOLD,
      `Expected confidence >= ${AUTO_MATCH_THRESHOLD}, got ${result.confidence}`
    );
    assert.strictEqual(result.requestedPath, 'src/extract/index.ts');
  });

  it('returns null matchedPath for very low confidence', () => {
    const result = fuzzyMatch('completely/different/path.xyz', candidates);
    assert.strictEqual(result.matchedPath, null);
    assert.ok(
      result.confidence < SUGGESTION_THRESHOLD,
      `Expected confidence < ${SUGGESTION_THRESHOLD}, got ${result.confidence}`
    );
  });

  it('includes alternatives when confidence is high', () => {
    const result = fuzzyMatch('src/extract/index.ts', candidates);
    assert.ok(
      !result.alternatives.includes(result.matchedPath!),
      'Alternatives should not include the matched path'
    );
  });

  it('preserves requestedPath in result', () => {
    const result = fuzzyMatch('any/path/here.ts', candidates);
    assert.strictEqual(result.requestedPath, 'any/path/here.ts');
  });

  it('returns empty alternatives when no candidates', () => {
    const result = fuzzyMatch('src/foo.ts', []);
    assert.strictEqual(result.matchedPath, null);
    assert.deepStrictEqual(result.alternatives, []);
    assert.strictEqual(result.confidence, 0);
  });
});

describe('threshold constants', () => {
  it('AUTO_MATCH_THRESHOLD is reasonable', () => {
    assert.ok(AUTO_MATCH_THRESHOLD >= 0.5 && AUTO_MATCH_THRESHOLD <= 0.9);
  });

  it('SUGGESTION_THRESHOLD is lower than AUTO_MATCH_THRESHOLD', () => {
    assert.ok(SUGGESTION_THRESHOLD < AUTO_MATCH_THRESHOLD);
  });
});

describe('benchmark failure cases', () => {
  // These are the actual cases that caused benchmark failures
  const pithNodes = [
    'src/cli/index.ts',
    'src/extractor/index.ts',
    'src/extractor/ast.ts',
    'src/extractor/cache.ts',
    'src/builder/index.ts',
    'src/generator/index.ts',
    'src/api/index.ts',
    'src/db/index.ts',
    'src/types.ts',
    'src/config/index.ts',
  ];

  it('matches src/extract/index.ts -> src/extractor/index.ts', () => {
    const result = fuzzyMatch('src/extract/index.ts', pithNodes);
    assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
    assert.ok(result.confidence >= 0.7, `Expected confidence >= 0.7, got ${result.confidence}`);
  });

  it('matches src/build/index.ts -> src/builder/index.ts', () => {
    const result = fuzzyMatch('src/build/index.ts', pithNodes);
    assert.strictEqual(result.matchedPath, 'src/builder/index.ts');
    assert.ok(result.confidence >= 0.7, `Expected confidence >= 0.7, got ${result.confidence}`);
  });

  it('matches src/generate/index.ts -> src/generator/index.ts', () => {
    const result = fuzzyMatch('src/generate/index.ts', pithNodes);
    assert.strictEqual(result.matchedPath, 'src/generator/index.ts');
    assert.ok(result.confidence >= 0.7, `Expected confidence >= 0.7, got ${result.confidence}`);
  });

  it('handles src/llm/client.ts with low confidence (no good match)', () => {
    const result = fuzzyMatch('src/llm/client.ts', pithNodes);
    assert.strictEqual(result.requestedPath, 'src/llm/client.ts');
    // Should have low confidence since there's no llm directory
    assert.ok(result.confidence < 0.7, `Expected low confidence, got ${result.confidence}`);
  });
});
