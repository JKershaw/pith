# High Priority Issues - Benchmark Regression Analysis

**Date**: 2025-12-31
**Author**: Claude
**Status**: Under Investigation

## Executive Summary

Pith benchmarks have regressed significantly after recent changes:

| Run             | Pith Score    | Control Score | Gap  | Pith Wins |
| --------------- | ------------- | ------------- | ---- | --------- |
| v7 (2025-12-30) | 16.3/25 (65%) | 23.9/25 (96%) | -7.6 | 0         |
| v1 (2025-12-31) | 19.4/25 (78%) | 22.9/25 (92%) | -3.5 | **5**     |
| v2 (2025-12-31) | 16.8/25 (67%) | 23.3/25 (93%) | -6.5 | 1         |
| v3 (2025-12-31) | 16.3/25 (65%) | 24.5/25 (98%) | -8.2 | 0         |

**Key observation**: v1 showed _improvement_ (+13% from v7), but v2/v3 regressed.

---

## Root Cause Analysis

### Primary Issue: Fuzzy Matching False Positives

**Commit**: `1bb81d9 feat: add fuzzy path matching for API node lookups`

The fuzzy matching feature, added after v1, causes the API to return **wrong files** with high confidence.

#### How It Fails

When querying `src/extractor/index.ts`:

1. Exact match fails (file path may not exist in DB)
2. Fuzzy matching finds `src/generator/index.ts`
3. Scoring:
   - Same filename (`index.ts`): **+50 points**
   - Same parent dir (`src`): **+10 points**
   - `extractor` vs `generator`: Levenshtein distance = 5, penalty = **-5 points**
   - **Total: 55 points**
4. Confidence: 55/70 = **0.79 (79%)**
5. Since 0.79 >= 0.7 (AUTO_MATCH_THRESHOLD), the **wrong file is returned**

#### Why This Is Critical

- **extractor** and **generator** are completely different modules
- The benchmark tasks asked about extraction logic
- Pith returned generator code instead
- Evaluators correctly scored this as irrelevant/incomplete

#### Evidence from v3 Benchmark

| Task | Requested              | Fuzzy Matched          | Result                   |
| ---- | ---------------------- | ---------------------- | ------------------------ |
| A1   | src/extractor          | src/generator          | Missed extractor module  |
| A2   | src/extractor/index.ts | src/generator/index.ts | Missed extraction phase  |
| B1   | src/extractor/cache.ts | (fuzzy to wrong file)  | Irrelevant content       |
| M1   | src/extractor/index.ts | src/generator/index.ts | Wrong modification guide |

---

### Secondary Issue: Token Bloat

Even when correct files are found, responses contain excessive context:

| Metric                  | Pith   | Control | Ratio     |
| ----------------------- | ------ | ------- | --------- |
| Average tokens per task | 21,565 | 9,343   | **2.3x**  |
| Most efficient (R1)     | 21,579 | 1,854   | **11.6x** |

The API returns full file documentation when targeted excerpts would suffice.

---

### Why v1 Showed Improvement

v1 was run on commit `e76b9a8`, **before** the fuzzy matching was added. The queries either:

1. Found exact matches, OR
2. Returned 404 (forcing manual correction of paths)

This meant v1 never received wrong files with false confidence.

---

## Recommended Fixes

### 1. Critical: Fix Fuzzy Matching Algorithm

**Option A**: Stricter thresholds

- Increase AUTO_MATCH_THRESHOLD from 0.7 to 0.85+
- Require exact filename AND directory match for auto-resolve

**Option B**: Semantic validation

- Don't fuzzy match between different module directories
- Require at least 2 exact path segments to match

**Option C**: Disable auto-resolve, always suggest

- Never auto-resolve fuzzy matches
- Always return 404 with suggestions
- Let user explicitly choose correct path

### 2. High: Response Sizing

- Return focused excerpts for `/context` queries
- Add `?compact=true` parameter for summary-only responses
- Limit code snippets to relevant sections

### 3. Medium: Better Path Resolution

- Validate requested paths against actual file structure
- Warn when querying non-existent paths
- Suggest correct paths based on project structure

---

## Impact Assessment

If fuzzy matching is fixed:

- v3's A1, A2, B1, M1 tasks would likely improve by 5-10 points each
- Estimated overall improvement: +3-4 points (65% → 78-80%)
- Win rate should return to v1 levels (5+ wins)

---

## Action Items

1. [ ] Review fuzzy matching thresholds
2. [ ] Consider disabling auto-resolve entirely
3. [ ] Add integration tests for cross-module fuzzy matches
4. [ ] Re-run benchmark after fixes
5. [ ] Update roadmap with findings

---

## Files Involved

- `src/api/fuzzy.ts` - Fuzzy matching algorithm
- `src/api/index.ts` - API endpoint using fuzzy matching
- `docs/ROADMAP.md` - Needs update with these findings
