/**
 * Fuzzy path matching for node lookups.
 *
 * When an exact path match fails, this module provides fallback matching
 * to find the most similar node path. This helps handle common typos like
 * "src/extract" instead of "src/extractor".
 */

/**
 * Result of a fuzzy match attempt.
 */
export interface FuzzyMatchResult {
  /** The matched path (or null if no good match) */
  matchedPath: string | null;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Alternative suggestions if confidence is low */
  alternatives: string[];
  /** The original requested path */
  requestedPath: string;
}

/**
 * Metadata to attach to a node response when fuzzy matched.
 */
export interface FuzzyMatchInfo {
  /** The path that was originally requested */
  requestedPath: string;
  /** The path that was actually matched */
  actualPath: string;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Other close matches */
  alternatives?: string[];
}

/**
 * Calculate Levenshtein distance between two strings.
 * This is the minimum number of single-character edits needed
 * to transform one string into the other.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance (lower = more similar)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // deletion
        matrix[i]![j - 1]! + 1, // insertion
        matrix[i - 1]![j - 1]! + cost // substitution
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

/**
 * Score similarity between two paths.
 * Higher score = more similar.
 *
 * Scoring factors:
 * - Exact filename match: +50 points
 * - Each matching path segment: +10 points
 * - Segment is prefix of candidate: +5 points
 * - Levenshtein penalty: -1 per edit distance
 *
 * @param query - The requested path
 * @param candidate - A candidate path to compare
 * @returns Similarity score (higher = better)
 */
export function scoreSimilarity(query: string, candidate: string): number {
  let score = 0;

  const queryParts = query.split('/');
  const candidateParts = candidate.split('/');

  const queryFilename = queryParts[queryParts.length - 1] || '';
  const candidateFilename = candidateParts[candidateParts.length - 1] || '';

  // Exact filename match is heavily weighted
  if (queryFilename === candidateFilename) {
    score += 50;
  } else {
    // Partial filename similarity
    const filenameDist = levenshteinDistance(queryFilename, candidateFilename);
    const maxLen = Math.max(queryFilename.length, candidateFilename.length);
    if (maxLen > 0) {
      // Give partial credit for similar filenames
      score += Math.max(0, 20 - filenameDist * 2);
    }
  }

  // Compare directory segments
  const queryDirs = queryParts.slice(0, -1);
  const candidateDirs = candidateParts.slice(0, -1);

  // Exact segment matches
  const minDirLen = Math.min(queryDirs.length, candidateDirs.length);
  for (let i = 0; i < minDirLen; i++) {
    const querySeg = queryDirs[i]!;
    const candidateSeg = candidateDirs[i]!;

    if (querySeg === candidateSeg) {
      score += 10;
    } else if (candidateSeg.startsWith(querySeg) || querySeg.startsWith(candidateSeg)) {
      // One is prefix of the other (e.g., "extract" vs "extractor")
      score += 5;
      // Small penalty for the difference
      const diff = Math.abs(querySeg.length - candidateSeg.length);
      score -= diff;
    } else {
      // Different segments - apply Levenshtein penalty
      const segDist = levenshteinDistance(querySeg, candidateSeg);
      score -= segDist;
    }
  }

  // Penalty for different directory depth
  const depthDiff = Math.abs(queryDirs.length - candidateDirs.length);
  score -= depthDiff * 5;

  return score;
}

/**
 * Normalize a score to a 0-1 confidence value.
 * Based on empirical testing of typical path similarities.
 *
 * @param score - Raw similarity score
 * @returns Confidence value from 0 to 1
 */
export function normalizeScore(score: number): number {
  // A perfect match (same filename + 2 matching dirs) would score ~70
  // A good match (same filename + prefix match) would score ~55
  // A poor match might score ~20-30
  const maxExpectedScore = 70;
  const normalized = Math.max(0, Math.min(1, score / maxExpectedScore));
  return Math.round(normalized * 100) / 100; // Round to 2 decimal places
}

/**
 * Find the best matching paths for a query.
 *
 * @param query - The requested path
 * @param candidates - Available paths to match against
 * @param topN - Maximum number of results to return (default 3)
 * @returns Sorted array of [path, score] pairs, highest score first
 */
export function findBestMatches(
  query: string,
  candidates: string[],
  topN: number = 3
): Array<{ path: string; score: number; confidence: number }> {
  const scored = candidates
    .map((candidate) => {
      const score = scoreSimilarity(query, candidate);
      return {
        path: candidate,
        score,
        confidence: normalizeScore(score),
      };
    })
    .filter((m) => m.score > 0) // Only consider positive scores
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

/**
 * Attempt fuzzy matching for a path.
 *
 * Returns a result with matchedPath set if confidence >= SUGGESTION_THRESHOLD (0.4).
 * The caller should use AUTO_MATCH_THRESHOLD (0.7) to decide whether to auto-resolve
 * the match or just show it as a suggestion.
 *
 * Behavior by confidence level:
 * - >= 0.7 (AUTO_MATCH_THRESHOLD): matchedPath set, alternatives exclude best match
 * - >= 0.4 (SUGGESTION_THRESHOLD): matchedPath set, alternatives include all options
 * - < 0.4: matchedPath is null, alternatives may contain low-quality suggestions
 *
 * @param query - The requested path that wasn't found
 * @param candidates - All available node paths
 * @returns Fuzzy match result with best match and alternatives
 */
export function fuzzyMatch(query: string, candidates: string[]): FuzzyMatchResult {
  const matches = findBestMatches(query, candidates, 5);

  if (matches.length === 0) {
    return {
      matchedPath: null,
      confidence: 0,
      alternatives: [],
      requestedPath: query,
    };
  }

  const best = matches[0]!;
  const alternatives = matches.slice(1, 4).map((m) => m.path);

  return {
    matchedPath: best.confidence >= 0.4 ? best.path : null,
    confidence: best.confidence,
    alternatives: best.confidence >= 0.7 ? alternatives : [best.path, ...alternatives].slice(0, 3),
    requestedPath: query,
  };
}

/** Threshold for auto-returning a fuzzy match */
export const AUTO_MATCH_THRESHOLD = 0.7;

/** Threshold for including in suggestions */
export const SUGGESTION_THRESHOLD = 0.4;
