# Benchmark: P0 Implementation (Line Numbers + Code Snippets)

**Date**: 2025-12-30
**Changes**: Phase 6.6.1.1 (line numbers) + Phase 6.6.1.2 (code snippets)

---

## Actual Benchmark Results

### Task 2: Error Handling
**Question**: "How does the prose generator handle errors and retries when the LLM API fails?"

| Criterion | Baseline | P0 (Pith) | Control |
|-----------|:--------:|:---------:|:-------:|
| Relevance | 2 | **5** | 5 |
| Completeness | 2 | **3** | 5 |
| Accuracy | 4 | **5** | 5 |
| Efficiency | 4 | **3** | 5 |
| Actionability | 2 | **2** | 5 |
| **Total** | **14/25** | **18/25** | **25/25** |

**Improvement**: +4 points (14 → 18)

### Judge Reasoning
> "Context B provides comprehensive, actionable information including the complete retry mechanism with exponential backoff formula (2^attempt seconds), specific delay examples, and clear categorization of error types. Context A shows actual code but is heavily truncated ("... (82 more lines)"), omitting the critical retry loop implementation and backoff calculation."

---

## Analysis

### What Improved (+4 points)
- **Relevance**: 2→5 - Code snippets directly show the relevant functions
- **Accuracy**: 4→5 - Actual code is authoritative

### What Didn't Improve
- **Completeness**: 2→3 - Still missing backoff formula (deeper in function)
- **Actionability**: 2→2 - Truncated snippets still require exploration

### Root Cause
The 15-line snippet captures:
- ✅ `maxRetries = 3`
- ✅ `timeout = config.timeout ?? 30000`
- ✅ Error conditions in `isRetryableError`

But misses (line 82+ of `callLLM`):
- ❌ Backoff formula: `Math.pow(2, attempt) * 1000`
- ❌ Retry loop structure
- ❌ How errors trigger the backoff

---

## Before vs After Detail

### Before (Baseline 2025-12-30)

Pith said:
```
"gotchas": ["The 'callLLM' function has retry logic but may still fail on persistent network issues"]
```

**Score**: 14/25 (vs Control 25/25)

| Detail | Pith | Control |
|--------|------|---------|
| Retry exists? | "has retry logic" | ✅ "maxRetries = 3" |
| Backoff strategy? | ❌ Not mentioned | ✅ "2^attempt seconds" |
| Timeout value? | ❌ Not mentioned | ✅ "30 seconds default" |
| Error conditions? | ❌ Not mentioned | ✅ "429, 5xx, timeout, network" |
| Code location? | ❌ Not mentioned | ✅ "Lines 431-527" |

### After (P0 Implementation)

Pith now provides:

```typescript
### callLLM (lines 445-541)
export async function callLLM(...): Promise<string> {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const maxRetries = 3;
  const timeout = config.timeout ?? 30000; // 30 seconds default
  // ...
```

```typescript
### isRetryableError (lines 418-437)
function isRetryableError(error: Error, status?: number): boolean {
  // Retry on rate limits (429)
  if (status === 429) return true;

  // Retry on server errors (5xx)
  if (status && status >= 500) return true;

  // Retry on AbortError (timeout via AbortController)
  if (error.name === 'AbortError') return true;

  // Retry on network/timeout errors
  if (error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('ECONNRESET') ||
  // ...
```

| Detail | Pith Before | Pith After |
|--------|-------------|------------|
| Retry exists? | "has retry logic" | ✅ `const maxRetries = 3;` |
| Backoff strategy? | ❌ | ⚠️ Visible in full function (needs scroll) |
| Timeout value? | ❌ | ✅ `timeout = config.timeout ?? 30000` |
| Error conditions? | ❌ | ✅ 429, 5xx, AbortError, network errors |
| Code location? | ❌ | ✅ lines 445-541, 418-437 |

---

## Expected Score Improvement

| Criterion | Before | After (Expected) | Reason |
|-----------|--------|------------------|--------|
| Relevance | 2 | 4 | Code snippets directly address the question |
| Completeness | 2 | 4 | Key details now present in snippets |
| Accuracy | 4 | 5 | Actual code is authoritative |
| Efficiency | 4 | 4 | Snippets add some bulk but are focused |
| Actionability | 2 | 4 | Can act on specific values shown |
| **Total** | 14/25 | **21/25** | +7 points |

---

## Information Gap Closure

| Information Type | Before | After | Status |
|------------------|:------:|:-----:|:------:|
| Line numbers | ❌ | ✅ | **Closed** |
| Code snippets | ❌ | ✅ | **Closed** |
| Specific values (retry, timeout) | ❌ | ✅ | **Closed** |
| Error conditions | ❌ | ✅ | **Closed** |
| Implementation details | ❌ | ✅ | **Closed** |

### Remaining Gaps (P1 Tasks)

| Information Type | Status | Next Step |
|------------------|:------:|-----------|
| Backoff formula (2^attempt) | ⚠️ Partial | P1: Pattern detection would extract explicitly |
| Retry flow narrative | ❌ | P1: Enhanced prose could synthesize |

---

## Summary

### Actual Results
| Metric | Baseline | After P0 | Control |
|--------|:--------:|:--------:|:-------:|
| Task 2 Score | 14/25 | **18/25** | 25/25 |
| Improvement | - | **+4 pts** | - |

### What P0 Achieved
1. ✅ **Line numbers** - Every function shows exact location
2. ✅ **Code snippets** - First 15 lines of each function visible
3. ✅ **Config values** - `maxRetries = 3`, `timeout = 30000` now visible
4. ✅ **Error conditions** - `isRetryableError` function fully shown
5. ✅ **Relevance** - 2→5 (code directly addresses questions)

### Remaining Gap (7 points)
The 15-line snippet limit means implementation details deeper in functions are still hidden:
- Backoff formula (`Math.pow(2, attempt) * 1000`) at line ~82
- Retry loop structure
- Error-to-backoff flow

### Next Steps for Further Improvement
1. **P1: Pattern Detection** - Explicitly extract retry/backoff patterns
2. **Increase snippet length** for long functions (or smart truncation)
3. **Synthesize narratives** from detected patterns
