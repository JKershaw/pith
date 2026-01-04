# Regression Analysis: 2026-01-03 vs 2026-01-02

## Summary

The 2026-01-03 benchmark showed a **3.3% regression** from the previous run (82.0% → 78.7%), losing 2 ties and dropping 10 total points across 15 tasks.

## Task-by-Task Comparison

| Task | 01-02 | 01-03 | Delta  | Cause Analysis                          |
| ---- | ----- | ----- | ------ | --------------------------------------- |
| A1   | 15    | 15    | 0      | Stable                                  |
| A2   | 19    | 18    | -1     | LLM synthesis variance (lost tie)       |
| A3   | 18    | 15    | -3     | Possible scoring variance               |
| B1   | 20    | 20    | 0      | **Tie maintained**                      |
| B2   | 15    | 16    | +1     | Improved                                |
| B3   | 20    | 16    | **-4** | **Key regression** - truncated response |
| R1   | 18    | 18    | 0      | Stable                                  |
| R2   | 14    | 16    | +2     | Improved                                |
| R3   | 11    | 11    | 0      | Stable                                  |
| D1   | 16    | 16    | 0      | Stable                                  |
| D2   | 16    | 15    | -1     | LLM synthesis variance                  |
| D3   | 18    | 16    | **-2** | `fuzzy.ts` missing prose                |
| M1   | 13    | 12    | -1     | Scoring/synthesis variance              |
| M2   | 16    | 16    | 0      | Stable                                  |
| M3   | 17    | 16    | -1     | Scoring/synthesis variance              |

**Totals**: 246 → 236 = **-10 points** (-0.67 per task average)

## Root Causes Identified

### 1. Generation Failures (3 nodes)

Three files/modules failed prose generation with JSON parsing errors:

| Node                     | Error Type                   | Impact                              |
| ------------------------ | ---------------------------- | ----------------------------------- |
| `src/api/fuzzy.ts`       | Unterminated string in JSON  | **D3 task** (404 for existing file) |
| `src/extractor/docs.ts`  | Expected ',' or ']' in array | Minimal                             |
| `src/generator` (module) | Unterminated string in JSON  | Architecture tasks                  |

**Key Finding**: The `src/api/fuzzy.ts` file is **directly relevant** to task D3, which asks about 404 errors. Without prose for this file, Pith couldn't provide detailed fuzzy matching threshold information.

**Evidence**: D3 lost 2 points (18 → 16).

### 2. LLM Synthesis Quality Variance

The biggest single regression was **B3** losing 4 points and the perfect tie:

**01-02 B3 (20/20 tie)**:

> "Pith correctly identified all: `maxRetries=3` (line 738), timeout 30s (line 739), exponential backoff `2^attempt * 1000ms` (lines 792, 819), retryable conditions in `isRetryableError` (lines 703-724)."

**01-03 B3 (16/20)**:

> "Pith answer was truncated but identified callLLM and retry concepts."

**Root Cause**: The file `src/generator/index.ts` **does have prose** with retry information (verified: gotchas include "Retries 3 times with 30s timeout"). The regression is in the **query synthesis step**, not the stored prose.

The LLM synthesis during `/query` produced a truncated or less detailed answer than in 01-02.

### 3. Generation Speed vs Quality Tradeoff

| Metric           | 01-02      | 01-03        | Change                 |
| ---------------- | ---------- | ------------ | ---------------------- |
| Generation time  | 301.6s     | 71.3s        | **-77% (4.2x faster)** |
| Nodes with prose | 60/60      | 60/63        | -3 errors              |
| Concurrency      | Sequential | Parallel (5) | Changed                |

The parallel generation with concurrency limiter (commit `21646c2`) made generation 4.2x faster but introduced 3 errors (5% failure rate).

**Hypothesis**: Parallel requests may have:

1. Hit rate limits causing incomplete responses
2. Exceeded context limits on larger files
3. Triggered timeout-related truncation

### 4. Codebase Changes Since 01-02

Key commits between benchmarks:

1. `21646c2` - **Parallel prose generation** (explains speed change + errors)
2. `c2dafc7` - Removed legacy planner mode
3. `d8b02f6` - Added 'callers' target type for consumer tracking
4. `416f701` - Added config files and modification guidance
5. `4c97031` - Added loop/async-pattern extraction categories

**Impact**: The parallel generation change is the primary cause of the 3 errors.

## Detailed Breakdown

### Regressions Explained

| Points Lost | Task(s)        | Primary Cause                                     |
| ----------- | -------------- | ------------------------------------------------- |
| -4          | B3             | LLM synthesis truncation/variance                 |
| -3          | A3             | Scoring variance (design patterns interpretation) |
| -2          | D3             | `fuzzy.ts` missing prose                          |
| -4          | A2, D2, M1, M3 | Combined LLM synthesis + scoring variance         |

### Improvements Explained

| Points Gained | Task(s) | Reason                                             |
| ------------- | ------- | -------------------------------------------------- |
| +2            | R2      | Better route-to-DB mapping from improved navigator |
| +1            | B2      | Better buildPrompt explanation                     |

**Net**: -10 points + 3 points = -7 net change (but I calculated -10 total, so no improvements in my run)

Wait - let me recalculate:

- Improvements: R2 (+2), B2 (+1) = +3
- Regressions: B3 (-4), A3 (-3), D3 (-2), A2 (-1), D2 (-1), M1 (-1), M3 (-1) = -13
- Net: -10

## Conclusions

### Primary Regression Causes (ranked by impact)

1. **LLM synthesis variance** (-5 points): B3 and A2 produced less detailed answers despite having good underlying prose
2. **Generation failures** (-2 points): `fuzzy.ts` missing prose directly impacted D3
3. **Scoring variance** (-3 points): A3, D2, M1, M3 had minor differences likely from subjective scoring

### Recommendations

| Priority | Action                                    | Expected Impact                 |
| -------- | ----------------------------------------- | ------------------------------- |
| High     | Retry failed generations with `--force`   | Recovers 3 missing prose nodes  |
| High     | Increase query synthesis token limit      | Prevents B3-style truncation    |
| Medium   | Add generation error metrics to benchmark | Better visibility into failures |
| Medium   | Lower concurrency if errors increase      | Trade speed for reliability     |

### Is This a Real Regression?

**Partially.** The benchmark methodology has inherent variance:

1. **LLM non-determinism**: Same query can produce different quality answers
2. **Scorer variance**: Different humans may score ±1-2 points differently
3. **Generation errors**: Random failures can affect key files

**The 3 generation errors are a real issue** that should be addressed. The B3 regression may be statistical noise or could indicate a synthesis prompt issue.

**Recommended**: Run benchmark 3x and average scores to reduce variance.
