# High Priority Issues - Benchmark Regression Analysis

**Date**: 2025-12-31 (Updated: 2026-01-01)
**Author**: Claude
**Status**: ✅ RESOLVED - Fuzzy matching fixed, new gaps identified

## Executive Summary

The fuzzy matching regression has been fixed. v4 benchmark shows improvement:

| Run             | Pith Score    | Control Score | Gap  | Pith Wins |
| --------------- | ------------- | ------------- | ---- | --------- |
| v7 (2025-12-30) | 16.3/25 (65%) | 23.9/25 (96%) | -7.6 | 0         |
| v1 (2025-12-31) | 19.4/25 (78%) | 22.9/25 (92%) | -3.5 | **5**     |
| v3 (2025-12-31) | 16.3/25 (65%) | 24.5/25 (98%) | -8.2 | 0         |
| **v4 (2025-12-31)** | **17.8/25 (71%)** | **24.0/25 (96%)** | **-6.2** | **1 tie** |

**Key observation**: v4 shows recovery from v3's regression (+6%), gap narrowed by 2 points.

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

### ✅ FIXED: Fuzzy Matching Algorithm

The fuzzy matching issue was resolved. v4 benchmark confirms improvement from 65% to 71%.

### 2. High: Smarter Default Output (Phase 6.9.1)

- Default to compact output (prose + key statements only)
- Auto-expand for small files, prioritize by fan-in
- Include full code only for functions with patterns/errors
- No new parameters - Pith decides automatically

**Status**: Planned in Phase 6.9.1

### 3. High: Function-Level Consumer Tracking (Phase 6.9.2)

- Track call sites across files (not just file-level imports)
- Store file:line references for each call site
- Distinguish production vs test consumers

**Status**: Planned in Phase 6.9.2

### 4. Query Planner (Phase 7)

- Accept natural language queries, not file paths
- Planner LLM selects files with reasoning
- Final LLM synthesizes answer from query + reasoning + prose
- Handles debugging/modification queries by seeing actual question

**Status**: Planned in Phase 7 (replaces 6.9.3 and 6.9.4)

---

## Current Gaps (v4 Analysis)

| Issue                  | Impact | v4 Evidence                                           |
| ---------------------- | ------ | ----------------------------------------------------- |
| Token inefficiency     | High   | 1.2x average, 4.9x worst (M1)                         |
| Missing function calls | High   | R3: 2 files shown, 48 call sites missed               |
| No debugging guidance  | Medium | D1-D3: 16.3/25 average                                |
| Generic responses      | Medium | Same bundling for all query types                     |

---

## Action Items

1. [x] ~~Review fuzzy matching thresholds~~ - Fixed
2. [x] ~~Re-run benchmark after fixes~~ - v4 shows improvement
3. [x] ~~Update roadmap with findings~~ - Phase 6.9 added
4. [ ] Implement smarter defaults (6.9.1)
5. [ ] Implement function-level tracking (6.9.2)
6. [ ] Implement Query Planner (Phase 7)
7. [ ] Re-run benchmark after Phase 7

---

## Files Involved

- `src/api/fuzzy.ts` - Fuzzy matching algorithm (fixed)
- `src/api/index.ts` - API endpoint (needs response targeting)
- `src/extractor/ast.ts` - Call site tracking (needs 6.9.2)
- `src/generator/index.ts` - Prose generation (needs 6.9.3)
- `docs/ROADMAP.md` - Updated with Phase 6.9
- `docs/PROGRESS.md` - Updated with v4 results
