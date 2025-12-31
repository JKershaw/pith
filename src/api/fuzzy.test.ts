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

  it('prefers same module over same filename when modules differ', () => {
    // After the cross-module penalty fix, same module with different filename
    // should score higher than same filename with different module
    // This prevents false positives like extractor/index.ts -> generator/index.ts
    const scoreDiffModuleSameFile = scoreSimilarity('src/foo/index.ts', 'src/bar/index.ts');
    const scoreSameModuleDiffFile = scoreSimilarity('src/foo/index.ts', 'src/foo/other.ts');
    assert.ok(
      scoreSameModuleDiffFile > scoreDiffModuleSameFile,
      `Expected same module (${scoreSameModuleDiffFile}) > diff module (${scoreDiffModuleSameFile})`
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
    // Verify by checking that multiplying by 100 gives an integer
    const scaledScore = Math.round(score * 100);
    assert.strictEqual(score, scaledScore / 100, 'Score should be rounded to 2 decimal places');
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

describe('benchmark failure cases - prefix matching (should work)', () => {
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

/**
 * CRITICAL REGRESSION TESTS
 *
 * These tests expose the cross-module false positive bug that caused the
 * benchmark regression from 78% to 65% (v1 -> v3).
 *
 * Root cause: When a file path doesn't exist in the DB, fuzzy matching returns
 * a DIFFERENT module's file with high confidence because:
 * - Same filename (index.ts): +50 points
 * - Same parent dir (src): +10 points
 * - Levenshtein penalty for different module name: only -5 points
 * - Result: 55/70 = 79% confidence, which exceeds AUTO_MATCH_THRESHOLD (70%)
 *
 * Example: src/extractor/index.ts -> src/generator/index.ts at 79% confidence
 *
 * These modules are semantically unrelated and returning the wrong one causes
 * the benchmark to answer questions about the wrong code entirely.
 */
describe('REGRESSION: cross-module false positives (the actual bug)', () => {
  // Realistic set of Pith nodes - this is what exists in the database
  const pithNodes = [
    'src/cli/index.ts',
    'src/cli/extract.ts',
    'src/cli/build.ts',
    'src/cli/generate.ts',
    'src/cli/serve.ts',
    'src/extractor/index.ts',
    'src/extractor/ast.ts',
    'src/extractor/cache.ts',
    'src/extractor/git.ts',
    'src/extractor/docs.ts',
    'src/builder/index.ts',
    'src/builder/cross-file-calls.ts',
    'src/generator/index.ts',
    'src/api/index.ts',
    'src/api/fuzzy.ts',
    'src/db/index.ts',
    'src/config/index.ts',
    'src/types.ts',
  ];

  describe('when querying a path that does NOT exist in candidates', () => {
    /**
     * THE CORE BUG: extractor/index.ts matches generator/index.ts
     *
     * Current behavior (WRONG):
     * - Score: filename match (+50) + src match (+10) - levenshtein(extractor,generator)=5 (-5) = 55
     * - Confidence: 55/70 = 0.79 (79%)
     * - Since 0.79 >= 0.7 (AUTO_MATCH_THRESHOLD), returns generator/index.ts
     *
     * Expected behavior:
     * - Should NOT auto-match to a completely different module
     * - Should return null matchedPath or very low confidence
     */
    it('should NOT match src/extractor/index.ts to src/generator/index.ts with high confidence', () => {
      // Simulate: extractor/index.ts is NOT in the database (maybe extraction failed)
      const candidatesWithoutExtractor = pithNodes.filter(
        (p) => !p.includes('extractor/')
      );

      const result = fuzzyMatch('src/extractor/index.ts', candidatesWithoutExtractor);

      // Either matchedPath should be null, OR confidence should be below threshold
      const isCorrectBehavior =
        result.matchedPath === null || result.confidence < AUTO_MATCH_THRESHOLD;

      assert.ok(
        isCorrectBehavior,
        `Cross-module false positive: src/extractor/index.ts should NOT auto-match to ` +
        `${result.matchedPath} with ${(result.confidence * 100).toFixed(0)}% confidence. ` +
        `Expected: null match or low confidence.`
      );
    });

    it('should NOT match src/builder/index.ts to src/generator/index.ts', () => {
      const candidatesWithoutBuilder = pithNodes.filter(
        (p) => !p.includes('builder/')
      );

      const result = fuzzyMatch('src/builder/index.ts', candidatesWithoutBuilder);

      const isCorrectBehavior =
        result.matchedPath === null || result.confidence < AUTO_MATCH_THRESHOLD;

      assert.ok(
        isCorrectBehavior,
        `Cross-module false positive: src/builder/index.ts should NOT auto-match to ` +
        `${result.matchedPath} with ${(result.confidence * 100).toFixed(0)}% confidence.`
      );
    });

    it('should NOT match src/api/index.ts to src/cli/index.ts', () => {
      const candidatesWithoutApi = pithNodes.filter(
        (p) => !p.includes('api/')
      );

      const result = fuzzyMatch('src/api/index.ts', candidatesWithoutApi);

      const isCorrectBehavior =
        result.matchedPath === null || result.confidence < AUTO_MATCH_THRESHOLD;

      assert.ok(
        isCorrectBehavior,
        `Cross-module false positive: src/api/index.ts should NOT auto-match to ` +
        `${result.matchedPath} with ${(result.confidence * 100).toFixed(0)}% confidence.`
      );
    });

    it('should NOT match src/db/index.ts to another module', () => {
      const candidatesWithoutDb = pithNodes.filter(
        (p) => !p.includes('db/')
      );

      const result = fuzzyMatch('src/db/index.ts', candidatesWithoutDb);

      const isCorrectBehavior =
        result.matchedPath === null || result.confidence < AUTO_MATCH_THRESHOLD;

      assert.ok(
        isCorrectBehavior,
        `Cross-module false positive: src/db/index.ts should NOT auto-match to ` +
        `${result.matchedPath} with ${(result.confidence * 100).toFixed(0)}% confidence.`
      );
    });
  });

  describe('specific benchmark task failures', () => {
    /**
     * From benchmark v3:
     * | Task | Requested              | Fuzzy Matched          | Result                   |
     * | A1   | src/extractor          | src/generator          | Missed extractor module  |
     * | A2   | src/extractor/index.ts | src/generator/index.ts | Missed extraction phase  |
     * | B1   | src/extractor/cache.ts | (fuzzy to wrong file)  | Irrelevant content       |
     * | M1   | src/extractor/index.ts | src/generator/index.ts | Wrong modification guide |
     */

    it('A2/M1: src/extractor/index.ts query should not return generator', () => {
      // Simulate extractor not in DB
      const candidates = pithNodes.filter((p) => !p.includes('extractor/'));

      const result = fuzzyMatch('src/extractor/index.ts', candidates);

      assert.ok(
        result.matchedPath !== 'src/generator/index.ts' || result.confidence < AUTO_MATCH_THRESHOLD,
        `Benchmark regression case A2/M1: Matched wrong file with high confidence`
      );
    });

    it('B1: src/extractor/cache.ts query should not return unrelated file', () => {
      // Simulate cache.ts not in DB
      const candidates = pithNodes.filter((p) => p !== 'src/extractor/cache.ts');

      const result = fuzzyMatch('src/extractor/cache.ts', candidates);

      // It could match extractor/index.ts (same module) - that's acceptable
      // It should NOT match a file from a different module with high confidence
      const matchedDifferentModule =
        result.matchedPath !== null &&
        !result.matchedPath.includes('extractor/') &&
        result.confidence >= AUTO_MATCH_THRESHOLD;

      assert.ok(
        !matchedDifferentModule,
        `Benchmark regression case B1: src/extractor/cache.ts matched to ${result.matchedPath} ` +
        `(different module) with ${(result.confidence * 100).toFixed(0)}% confidence`
      );
    });
  });

  describe('confidence scoring analysis', () => {
    it('should score cross-module matches below AUTO_MATCH_THRESHOLD', () => {
      const query = 'src/extractor/index.ts';
      const wrongCandidate = 'src/generator/index.ts';

      const score = scoreSimilarity(query, wrongCandidate);
      const confidence = normalizeScore(score);

      assert.ok(
        confidence < AUTO_MATCH_THRESHOLD,
        `Different modules should not score ${(confidence * 100).toFixed(0)}% ` +
        `(above ${(AUTO_MATCH_THRESHOLD * 100).toFixed(0)}% threshold). ` +
        `Cross-module penalty should prevent auto-matching.`
      );
    });

    it('prefix match (extract->extractor) should score HIGHER than cross-module match', () => {
      const query = 'src/extract/index.ts';
      const correctMatch = 'src/extractor/index.ts';
      const wrongMatch = 'src/generator/index.ts';

      const correctScore = scoreSimilarity(query, correctMatch);
      const wrongScore = scoreSimilarity(query, wrongMatch);

      assert.ok(
        correctScore > wrongScore,
        `Prefix match (${correctScore}) should score higher than cross-module (${wrongScore})`
      );
    });

    it('same-module different-file should score higher than cross-module same-filename', () => {
      // If querying extractor/foo.ts, should prefer extractor/bar.ts over generator/foo.ts
      const query = 'src/extractor/utils.ts';
      const sameModuleDiffFile = 'src/extractor/ast.ts';
      const diffModuleSamePattern = 'src/generator/utils.ts';

      const sameModuleScore = scoreSimilarity(query, sameModuleDiffFile);
      const diffModuleScore = scoreSimilarity(query, diffModuleSamePattern);

      assert.ok(
        sameModuleScore > diffModuleScore,
        `Same module (${sameModuleScore}) should score higher than different module ` +
        `with similar filename (${diffModuleScore})`
      );
    });
  });
});

describe('fix validation tests', () => {
  const pithNodes = [
    'src/extractor/index.ts',
    'src/extractor/ast.ts',
    'src/builder/index.ts',
    'src/generator/index.ts',
    'src/api/index.ts',
    'src/cli/index.ts',
  ];

  describe('legitimate fuzzy matches should still work', () => {
    it('typo: src/extractr/index.ts -> src/extractor/index.ts', () => {
      const result = fuzzyMatch('src/extractr/index.ts', pithNodes);
      assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
      assert.ok(result.confidence >= 0.5, 'Typo correction should have reasonable confidence');
    });

    it('prefix: src/extract/index.ts -> src/extractor/index.ts', () => {
      const result = fuzzyMatch('src/extract/index.ts', pithNodes);
      assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
      assert.ok(result.confidence >= 0.7, 'Prefix match should have high confidence');
    });

    it('case variation: src/Extractor/index.ts -> src/extractor/index.ts', () => {
      const result = fuzzyMatch('src/Extractor/index.ts', pithNodes);
      // Case-insensitive matching should find the correct file with high confidence
      assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
      assert.ok(
        result.confidence >= AUTO_MATCH_THRESHOLD,
        `Case variation should match with high confidence, got ${(result.confidence * 100).toFixed(0)}%`
      );
    });

    it('missing extension: src/extractor/index -> src/extractor/index.ts', () => {
      const result = fuzzyMatch('src/extractor/index', pithNodes);
      assert.strictEqual(result.matchedPath, 'src/extractor/index.ts');
    });
  });

  describe('cross-module queries should NOT auto-match', () => {
    it('completely different modules should have low confidence', () => {
      const candidates = ['src/generator/index.ts', 'src/api/index.ts', 'src/cli/index.ts'];
      const result = fuzzyMatch('src/extractor/index.ts', candidates);

      assert.ok(
        result.confidence < AUTO_MATCH_THRESHOLD,
        `Query for extractor should not auto-match to ${result.matchedPath} ` +
        `when extractor doesn't exist. Got ${(result.confidence * 100).toFixed(0)}% confidence.`
      );
    });

    it('should provide suggestions but not auto-resolve for missing modules', () => {
      const candidates = ['src/generator/index.ts', 'src/api/index.ts'];
      const result = fuzzyMatch('src/database/connection.ts', candidates);

      // Should NOT auto-match since database module doesn't exist
      assert.ok(
        result.matchedPath === null || result.confidence < AUTO_MATCH_THRESHOLD,
        'Should not auto-match to unrelated module'
      );

      // But should still provide alternatives for user to choose
      assert.ok(
        result.alternatives.length > 0,
        'Should provide alternatives even when not auto-matching'
      );
    });
  });
});
