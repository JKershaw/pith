# Bug Analysis: Root Causes of Benchmark Regression

## Summary

The regression is caused by **3 distinct bugs** in the codebase, not just configuration issues or LLM variance.

---

## Bug 1: JSON Parsing Errors Are Not Retried (Critical)

### Location

- `src/generator/index.ts:703-724` - `isRetryableError()` function
- `src/generator/index.ts:358-380` - `parseLLMResponse()` function
- `src/generator/index.ts:846-869` - `generateProse()` function

### The Problem

The retry logic is **inside `callLLM()`**, but JSON parsing happens **outside** it:

```typescript
// In generateProse() at line 846:
export async function generateProse(...) {
  const response = await callLLM(prompt, config);  // ← Has retry logic internally
  const prose = parseLLMResponse(response);        // ← NO retry if this fails!
  return prose;
}
```

The `isRetryableError()` function only handles:

- HTTP 429 (rate limit)
- HTTP 5xx (server errors)
- AbortError (timeout)
- Network errors

It does **NOT** handle:

- JSON parsing errors from malformed LLM responses
- Incomplete/truncated responses (which return HTTP 200)

### Why This Causes the Bug

1. LLM returns HTTP 200 but with truncated JSON (e.g., `{"summary": "foo`, missing closing brace)
2. `callLLM()` returns successfully (HTTP 200 = success)
3. `parseLLMResponse()` calls `JSON.parse()` which throws
4. Error propagates up with **no retry**
5. Node is marked as failed and skipped on future runs

### Evidence

The 3 failed nodes all have JSON parsing errors:

- `src/api/fuzzy.ts: Unterminated string in JSON at position 1048283`
- `src/extractor/docs.ts: Expected ',' or ']' after array element`
- `src/generator: Unterminated string in JSON at position 1048292`

These are all **truncated JSON responses**, not network errors.

### Why `--force` Doesn't Automatically Retry

The `--force` flag only skips the "already has prose" check. It doesn't implement retry logic for parsing errors. Without `--force`, the node is skipped because it's not in the "needs regeneration" list.

### Fix

Move retry logic to wrap the entire `generateProse()` call, or add JSON parsing errors to `isRetryableError()`.

---

## Bug 2: Token Limit Too Low for Complex Files

### Location

- `src/generator/index.ts:72` - Default: `maxTokens?: number; // Default: 1024`
- `src/generator/index.ts:744` - `max_tokens: config.maxTokens ?? 1024`

### The Problem

1024 tokens is approximately **750-800 words**. For complex files, the required JSON response includes:

- `summary` (1 sentence)
- `purpose` (2-3 sentences)
- `gotchas` (array of strings)
- `gotchasDetailed` (array of objects with warning/location/evidence)
- `keyExports` (array)
- `patterns` (array)
- `debugging` (object with arrays)
- `dataFlow` (string, for modules)

For a file like `fuzzy.ts` with 500+ lines and complex logic, the LLM needs more than 1024 tokens to generate complete JSON.

### Evidence

The failed files are among the larger/more complex in the codebase:

- `src/api/fuzzy.ts` - 273 lines of fuzzy matching logic
- `src/generator/index.ts` - 900+ lines (generator module is the entire directory)

### Why This Correlates with Parallel Generation

With parallel generation (concurrency=5), multiple large files request responses simultaneously. If any approach the token limit, they get truncated → JSON parsing fails.

Sequential generation (slower) may have given the LLM more "attention" per request.

---

## Bug 3: Query Synthesis Has Same Token Limit Issue

### Location

- `src/cli/index.ts:779-783` - `generatorConfig` creation in serve command
- `src/api/index.ts:1316` - `callLLM(synthesisPrompt, generatorConfig, fetchFn)`

### The Problem

The serve command creates a generator config without specifying `maxTokens`:

```typescript
// src/cli/index.ts:779-783
generatorConfig = {
  provider: 'openrouter',
  model,
  apiKey,
  // maxTokens NOT SET → defaults to 1024
};
```

This same config is used for query synthesis, which often requires MORE tokens than prose generation because:

- Synthesis prompts include prose from multiple files
- The answer needs to cite specific line numbers
- Complex questions need detailed explanations

### Evidence

B3 regression notes: "Pith answer was truncated but identified callLLM and retry concepts"

The B3 task asks about retry logic, which requires explaining:

- maxRetries value
- timeout configuration
- backoff formula
- All 4 retry conditions

At 1024 tokens, the answer gets cut off before completing.

---

## Bug Impact on Benchmark Scores

| Bug                          | Affected Tasks            | Points Lost          |
| ---------------------------- | ------------------------- | -------------------- |
| Bug 1 (No JSON retry)        | D3 (-2), module tasks     | -2 to -4             |
| Bug 2 (Low token limit)      | All complex files         | Contributed to Bug 1 |
| Bug 3 (Synthesis truncation) | B3 (-4), D2 (-1), A2 (-1) | -5 to -6             |

**Total attributable to bugs: 7-10 points** (out of 10 point regression)

---

## Recommended Fixes

### Fix 1: Add JSON Parsing to Retry Logic (High Priority)

```typescript
// Option A: Wrap generateProse with retry
async function generateProseWithRetry(node, config, options, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateProse(node, config, options);
    } catch (error) {
      if (error.message.includes('JSON') && attempt < maxAttempts) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw error;
    }
  }
}
```

### Fix 2: Increase Default Token Limit (High Priority)

```typescript
// src/generator/index.ts:72
maxTokens?: number; // Default: 2048 (or 4096 for complex files)

// src/generator/index.ts:744
max_tokens: config.maxTokens ?? 2048,
```

### Fix 3: Set Explicit Token Limit for Synthesis (Medium Priority)

```typescript
// src/cli/index.ts:779-783
generatorConfig = {
  provider: 'openrouter',
  model,
  apiKey,
  maxTokens: 2048, // Explicit limit for synthesis
};
```

### Fix 4: Add Auto-Retry on Generation Failure (Medium Priority)

In CLI's `processNode()` function, add retry logic for parsing errors:

```typescript
const processNode = async (node, childSummaries) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const prose = await generateProse(node, generatorConfig, { childSummaries });
      // ... success handling
      return;
    } catch (error) {
      if (error.message.includes('JSON') && attempt < 3) {
        log(`  ⟳ Retry ${attempt}/3 for ${node.id} (JSON parse error)`);
        await sleep(2000 * attempt);
        continue;
      }
      // ... error handling
    }
  }
};
```

---

## Why These Are Bugs, Not Configuration Issues

1. **`--force` shouldn't be needed** - Failed generations should auto-retry
2. **Token limits should be smart** - Complex files should detect they need more tokens
3. **Errors should be retryable** - JSON parsing errors from truncated responses are transient
4. **Defaults should be reasonable** - 1024 tokens is too low for structured JSON output

The regression is **reproducible** and **fixable** with code changes.
