# Query Mode Known Issues

**Document Version**: 1.0
**Date**: 2026-01-01
**Status**: Active Investigation

---

## Executive Summary

Query Mode (Phase 7) was designed to improve context retrieval by adding an LLM "research" step that intelligently selects files before synthesizing answers. However, benchmark results show **Query Mode performs identically to Context Mode** (73.5% vs 73%), not better as expected.

**Root Cause**: The LLM planner can only select from pre-filtered candidates, and the pre-filter has fundamental blind spots. The research LLM cannot discover files that weren't already found by keyword matching - it merely re-ranks them, sometimes incorrectly.

**Key Gaps Identified**:

1. No import/call tracking - cannot answer "who calls X?" questions
2. Entry points invisible - CLI and main files never appear as candidates
3. Planner non-determinism - LLM sometimes makes worse selections than score-based ranking

**Impact**: Query Mode adds latency and cost (2 LLM calls) without improving accuracy. The architecture needs fundamental changes to the pre-filter before the LLM research step can add value.

---

## Issue #1: KeywordIndex Does Not Track Imports or Call Sites

### Expected Behavior

When a user asks "What are all the consumers of the extractFile function?", Query Mode should find all files that **call** `extractFile`.

### Actual Behavior

Query Mode finds files that **export** functions with similar names ("extract", "file"), not files that import or call them.

### Root Cause

The `KeywordIndex` in `src/query/index.ts:13-20` only indexes:

```typescript
interface KeywordIndex {
  byExport: Map<string, string[]>; // What files EXPORT
  byPattern: Map<string, string[]>; // Detected patterns
  byKeyStatement: Map<string, string[]>; // Config values
  bySummaryWord: Map<string, string[]>; // Words in prose summaries
  byErrorType: Map<string, string[]>; // HTTP status codes
  byModule: Map<string, string[]>; // Module names
}
```

**Missing**:

- `byImport` - What files import a given symbol
- `byCall` - What files call a given function
- `byConsumer` - Reverse dependency lookup

### Evidence from Benchmark

Task R3: "What are all the consumers of the extractFile function?"

| Metric                | Pith Query Mode        | Control Agent          |
| --------------------- | ---------------------- | ---------------------- |
| Score                 | 9/20                   | 19/20                  |
| Files found           | 4 (none are consumers) | 4 files, 48 call sites |
| Actual consumer found | ❌ No                  | ✅ cli/index.ts:185    |

The pre-filter returned files containing "extract" in their exports, not files that call `extractFile`.

### Impact

- **Relationship queries (R-type)**: Cannot answer "who uses X?" questions
- **Refactoring guidance**: Cannot identify impact of changes
- **Dependency analysis**: Fundamentally broken

### Recommended Fix

Add import/call tracking to the keyword index:

```typescript
interface KeywordIndex {
  // ... existing fields ...
  byImport: Map<string, string[]>; // Symbol → files that import it
  byCall: Map<string, string[]>; // Function → files that call it
}
```

Populate from `node.raw.imports` and cross-file call data already collected by the builder.

---

## Issue #2: Entry Points Are Invisible to Pre-Filter

### Expected Behavior

Important files like `src/cli/index.ts` (the main entry point) should appear in candidates for architecture and orchestration queries.

### Actual Behavior

CLI never appears as a candidate because it has no characteristics the pre-filter looks for.

### Root Cause

The CLI node has:

```json
{
  "path": "src/cli/index.ts",
  "exports": [], // No exports - it's an entry point
  "fanIn": 0, // Nothing imports it
  "patterns": [], // No detected patterns
  "summary": "CLI entry point for the pith tool..."
}
```

Pre-filter scoring (`src/query/index.ts:348-356`):

| Criterion          | CLI Value        | Score     |
| ------------------ | ---------------- | --------- |
| Export match       | None             | 0         |
| Pattern match      | None             | 0         |
| High fanIn bonus   | fanIn=0          | 0         |
| Summary word match | Depends on query | Usually 0 |

Unless the query contains "cli" or "entry" or "command", CLI gets score 0 and is never included.

### Evidence from Benchmark

Task D2: "Why might the generate command be slow?"

- **CLI contains**: The for-loop at line 602 that processes nodes sequentially (the actual bottleneck)
- **Candidates included CLI?**: No - query words ("generate", "command", "slow") don't match CLI's exports/summary
- **Result**: Pith missed the critical insight that Control found

Task A1: "What are the main components of this codebase?"

- **CLI is**: The orchestrator that ties all components together
- **Candidates included CLI?**: No
- **Result**: Incomplete architecture picture

### Impact

- **Architecture queries (A-type)**: Missing central orchestration
- **Debugging queries (D-type)**: Missing command implementation details
- **Modification queries (M-type)**: Missing entry point changes needed

### Recommended Fix

Option A: Include entry points (fanIn=0, no exports, type=file) as default candidates

```typescript
// In preFilter():
const entryPoints = nodes.filter(
  (n) =>
    n.type === 'file' && n.metadata.fanIn === 0 && (!n.raw.exports || n.raw.exports.length === 0)
);
// Always include top 2-3 entry points
```

Option B: Add special handling for "main" files

```typescript
const isEntryPoint = (node) =>
  node.path.includes('index.ts') || node.path.includes('cli') || node.path.includes('main');
```

---

## Issue #3: Planner LLM Non-Determinism

### Expected Behavior

The LLM planner should consistently select the most relevant files from candidates.

### Actual Behavior

The planner makes different selections on identical queries, sometimes choosing worse files than simple score-based ranking would.

### Root Cause

The planner prompt (`src/query/index.ts:593-652`) asks the LLM to select 3-8 files, but:

1. LLM outputs are inherently non-deterministic (temperature > 0)
2. The prompt doesn't strongly emphasize score ordering
3. No fallback to deterministic selection on uncertainty

### Evidence from Benchmark

Task B3: "What is the retry logic in the LLM client?"

**Candidates presented to planner** (in score order):

1. `src/generator/index.ts` - score 22, matched: `pattern:retry`, `export:llm`, `summary:llm`
2. `src/extractor/patterns.ts` - score 10, matched: `export:retry`
3. `src/config/index.ts` - score 10, matched: `export:llm`

**Benchmark run selection**: `[patterns.ts, errors.ts, ast.ts]` ❌

- Skipped #1 candidate (generator) which contains the actual retry logic
- Score: 10/20

**Re-run selection**: `[generator/index.ts, patterns.ts, errors.ts]` ✅

- Correctly included #1 candidate
- Would have scored ~18/20

Same query, same candidates, different (worse) result in benchmark.

### Impact

- **Inconsistent results**: Same query can produce different quality answers
- **Regression risk**: Hard to measure improvements when baseline varies
- **User trust**: Unreliable results undermine confidence

### Recommended Fix

Option A: Deterministic fallback

```typescript
// If planner confidence is low, use top-N by score
const plannerResult = await callPlanner(prompt);
if (plannerResult.confidence < 0.7) {
  return candidates.slice(0, 5).map((c) => c.path);
}
```

Option B: Ensemble approach

```typescript
// Run planner 3 times, take intersection
const selections = await Promise.all([
  callPlanner(prompt),
  callPlanner(prompt),
  callPlanner(prompt),
]);
return intersect(selections);
```

Option C: Temperature=0 for determinism

```typescript
// In callLLM for planner specifically
const response = await fetch(url, {
  body: JSON.stringify({
    ...config,
    temperature: 0, // Deterministic
  }),
});
```

---

## Issue #4: LLM Planner Cannot Discover New Files

### Expected Behavior

The "research LLM" should be able to reason about the codebase and identify files that keyword matching missed.

### Actual Behavior

The planner can only select from the pre-filtered candidate list. It cannot request additional files or expand the search.

### Root Cause

Architecture constraint in `src/api/index.ts:1258-1266`:

```typescript
// Step 7.1.3: Build planner prompt (candidates already fixed)
const plannerPrompt = buildPlannerPrompt(query, candidates, allNodes);

// Step 7.1.4: Call planner LLM (can only choose from candidates)
const plannerRawResponse = await callLLM(plannerPrompt, generatorConfig);

// Parse response - validates against candidatePaths
const candidatePaths = new Set(candidates.map((c) => c.path));
const plannerResult = parsePlannerResponse(plannerRawResponse, candidatePaths);
```

The planner prompt only shows pre-filtered candidates. If a relevant file wasn't found by keyword matching, the LLM has no way to know it exists.

### Evidence

Task M1: "How would I add JavaScript support?"

- **Files with hardcoded `.ts`**: 20 locations across 8 files
- **Pre-filter found**: 3 files (patterns.ts, config.ts, ast.ts)
- **Planner selected**: Same 3 files (cannot select what it doesn't see)
- **Missing files**: builder/index.ts (test patterns), cli/index.ts, tsconfig.json, package.json, eslint.config.js

The planner couldn't find builder/index.ts because:

1. Query words: "javascript", "js", "files", "typescript", "support", "add"
2. builder/index.ts exports: "build", "wiki", "node", "file", "function"
3. No overlap → not in candidates → planner can't select it

### Impact

- **Modification queries (M-type)**: Incomplete change lists
- **False sense of completeness**: User thinks they have full answer
- **Architectural limitations**: LLM research step is just re-ranking, not discovering

### Recommended Fix

Option A: Two-phase planner with expansion requests

```typescript
interface PlannerResponse {
  selectedFiles: string[];
  reasoning: string;
  requestAdditionalSearch?: {
    keywords: string[];
    patterns: string[];
  };
}

// If planner requests expansion, run additional pre-filter
if (plannerResult.requestAdditionalSearch) {
  const additionalCandidates = preFilter(
    plannerResult.requestAdditionalSearch.keywords.join(' '),
    index,
    nodes
  );
  // Re-run planner with expanded candidates
}
```

Option B: Give planner full file list (expensive but complete)

```typescript
// Include all file paths in prompt (not just candidates)
const allFilePaths = nodes
  .filter((n) => n.type === 'file')
  .map((n) => `${n.path}: ${n.prose?.summary || '(no summary)'}`);
```

---

## Summary: Why LLM Research Doesn't Help

| What We Expected                                  | What Actually Happens                           |
| ------------------------------------------------- | ----------------------------------------------- |
| LLM intelligently discovers relevant files        | LLM can only re-rank pre-filtered candidates    |
| Research step finds files keyword matching missed | If keyword matching misses it, it's invisible   |
| Better results than Context Mode                  | Same results (73.5% vs 73%)                     |
| LLM compensates for pre-filter gaps               | LLM inherits all pre-filter limitations         |
| Consistent, reliable file selection               | Non-deterministic, sometimes worse than scoring |

**The fundamental issue**: We're asking the LLM to be intelligent, but we've already constrained its choices to a limited candidate set. The LLM planner is a sophisticated solution to a problem that doesn't exist (ranking 25 candidates) while ignoring the real problem (finding the right candidates in the first place).

---

## Recommended Priority Fixes

| Priority | Issue                   | Fix                                  | Expected Impact                             |
| -------- | ----------------------- | ------------------------------------ | ------------------------------------------- |
| **P0**   | No import/call tracking | Add byImport, byCall to KeywordIndex | Fixes R-type queries (+10-15% score)        |
| **P0**   | Entry points invisible  | Auto-include CLI/main files          | Fixes A-type, D-type queries (+5-10% score) |
| **P1**   | Planner non-determinism | Temperature=0 or ensemble            | Consistent results, easier benchmarking     |
| **P2**   | Planner can't discover  | Two-phase expansion                  | Better M-type queries (+5% score)           |

---

## Proposed Solution: Overview-Based Navigation

### The Core Problem

The current architecture puts intelligence in the wrong place:

```
Current: Query → Deterministic pre-filter → LLM selects from filtered list → Fetch
                  (blind spots here)         (can't recover)
```

The LLM planner is a sophisticated solution to a problem that doesn't exist (ranking 25 candidates) while ignoring the real problem (finding the right candidates in the first place).

### Proposed Architecture

Instead of constraining the LLM to pre-filtered candidates, give it a high-level project overview and let it reason about where to look:

```
Proposed: Query → LLM reasons with project overview → Produces search targets → Fetch/validate
                   (sees full structure)              (can discover anything)
```

### How It Works

**Step 1: Generate Project Overview (~200-300 tokens)**

Auto-generate from existing module prose and metadata:

```markdown
## Project Structure

- src/cli/index.ts - Main entry point, orchestrates extract→build→generate→serve
- src/extractor/ - Deterministic fact extraction from TypeScript
- src/builder/ - Transforms extracted data into node graph
- src/generator/ - LLM prose synthesis, includes retry/timeout logic
- src/api/ - Express server, serves /node and /context endpoints
- src/db/ - MangoDB wrapper, singleton pattern
- src/query/ - Query planning and keyword indexing

## Key Relationships

- CLI imports and calls: extractFile, buildNodes, generateProse, createApp
- WikiNode interface defined in builder/index.ts, used by: generator, api, query
- generator/index.ts contains callLLM with retry logic (maxRetries=3, backoff)

## Entry Points (fanIn=0)

- src/cli/index.ts - CLI commands
- src/index.ts - Package exports
```

**Step 2: LLM Produces Search Targets**

Instead of selecting from a list, the LLM reasons and outputs actionable targets:

```typescript
interface NavigationResponse {
  reasoning: string;
  targets: Array<
    | { type: 'file'; path: string }
    | { type: 'grep'; pattern: string; scope?: string }
    | { type: 'function'; name: string; in: string }
    | { type: 'importers'; of: string }
  >;
}
```

Example for "What is the retry logic in the LLM client?":

```json
{
  "reasoning": "User asks about retry logic in LLM client. From overview, generator module handles LLM calls including retry/timeout logic.",
  "targets": [
    { "type": "file", "path": "src/generator/index.ts" },
    { "type": "grep", "pattern": "retry|maxRetries", "scope": "src/generator/" },
    { "type": "function", "name": "callLLM", "in": "src/generator/index.ts" }
  ]
}
```

**Step 3: Validate and Fetch**

- Verify file paths exist
- Execute grep patterns
- Fetch actual content for valid targets

### Why This Solves Each Issue

| Issue                      | Current Failure                 | How Overview Solves It                               |
| -------------------------- | ------------------------------- | ---------------------------------------------------- |
| #1: No import tracking     | Pre-filter can't find consumers | Overview lists "CLI imports extractFile" explicitly  |
| #2: Entry points invisible | CLI has no exports/fanIn        | Overview explicitly lists entry points section       |
| #3: Non-determinism        | LLM picks randomly from 25      | LLM reasons from structure, more constrained choices |
| #4: Can't discover files   | Planner limited to candidates   | LLM sees full project, can suggest any file          |

### Example: R3 "Who calls extractFile?"

**Current behavior**:

1. Pre-filter tokenizes: "extract", "file", "consumers", "function"
2. Matches files that export "extract\*" functions
3. Returns ast.ts, builder/index.ts (wrong files)
4. Planner selects from wrong candidates
5. Answer is incorrect

**With overview**:

1. LLM sees: "CLI imports and calls: extractFile, buildNodes..."
2. LLM reasons: "extractFile consumers are listed - CLI calls it"
3. Outputs: `{ type: "file", path: "src/cli/index.ts" }`, `{ type: "grep", pattern: "extractFile", scope: "src/" }`
4. Fetches correct file, finds line 185
5. Answer is correct

### Trade-offs

| Aspect      | Current                           | Proposed                          |
| ----------- | --------------------------------- | --------------------------------- |
| Token cost  | ~1000 (25 candidates × 40 tokens) | ~300 (compact overview)           |
| Accuracy    | Limited by pre-filter blind spots | Limited by overview completeness  |
| Flexibility | Only keyword-matchable queries    | Semantic/structural queries work  |
| Validation  | Paths guaranteed valid            | Must verify LLM suggestions exist |
| Latency     | 1 LLM call (planner)              | 1 LLM call (navigator) - same     |

### Implementation Path

1. **Generate overview automatically** from module nodes (prose summaries + edges)
2. **Replace planner prompt** with navigator prompt that includes overview
3. **Add target validation** layer to verify paths and execute greps
4. **Keep synthesis step** unchanged - it already works well

### Expected Impact

| Query Type       | Current Score | Expected with Overview |
| ---------------- | ------------- | ---------------------- |
| Architecture (A) | 15.7/20       | 18-19/20 (+15%)        |
| Behavior (B)     | 15.7/20       | 18-19/20 (+15%)        |
| Relationship (R) | 14.0/20       | 17-18/20 (+20%)        |
| Debugging (D)    | 15.3/20       | 17-18/20 (+12%)        |
| Modification (M) | 14.3/20       | 16-17/20 (+12%)        |
| **Overall**      | **73.5%**     | **~85-90%**            |

The biggest gains expected in Relationship queries (R-type) where the overview explicitly captures "who imports/calls what" information that the current keyword index completely misses.

### Remaining Considerations

The proposed solution introduces new considerations that will be addressed through benchmarking and iteration:

| Consideration             | Initial Approach                                              | Refine Later                                              |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| **Overview completeness** | Include README + full file/folder tree + all module summaries | Trim based on what LLM actually uses                      |
| **Overview staleness**    | Regenerate on each `pith build`                               | Add incremental updates if perf matters                   |
| **Non-determinism**       | Accept variance, measure across benchmark runs                | Add temperature=0 or ensemble if variance is high         |
| **Invalid targets**       | Validate paths, return graceful errors                        | Add retry with "file not found, did you mean..." feedback |
| **Grep pattern quality**  | Let synthesis handle gaps if grep returns nothing             | Improve prompt if failure rate is high                    |

### Implementation Strategy: Start Broad, Refine Narrow

Rather than prematurely optimizing the overview format, the implementation should:

1. **Start generous with context** (~1000-2000 tokens)
   - Include full README.md
   - Include complete file/folder tree (truncate smartly if needed)
   - Include all module summaries with key relationships

2. **Measure with benchmarks**
   - Run same queries multiple times to measure variance
   - Track which context the LLM actually references in its reasoning
   - Identify which queries still fail despite full context

3. **Refine based on data**
   - Remove context that's never used
   - Add context for query types that still fail
   - Tune non-determinism mitigations if variance is unacceptable

This approach ensures we don't sacrifice accuracy for token efficiency before we have data showing what's actually needed.

---

## Appendix: Query Mode Architecture (Current)

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Pre-Filter (Deterministic)                              │
│ - Tokenize query                                        │
│ - Match against KeywordIndex                            │
│ - Score and rank candidates                             │
│ - Return top 25                                         │
│                                                         │
│ LIMITATIONS:                                            │
│ - Only matches exports, not imports/calls               │
│ - Entry points (fanIn=0, no exports) invisible          │
│ - Keyword-based, misses semantic relevance              │
└─────────────────────────────────────────────────────────┘
    │
    │ (candidates already fixed here)
    ▼
┌─────────────────────────────────────────────────────────┐
│ LLM Planner                                             │
│ - Receives pre-filtered candidates only                 │
│ - Selects 3-8 files from candidates                     │
│ - Cannot request files outside candidate set            │
│                                                         │
│ LIMITATIONS:                                            │
│ - Can't discover files pre-filter missed                │
│ - Non-deterministic selection                           │
│ - Sometimes worse than score-based ranking              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ LLM Synthesizer                                         │
│ - Receives selected file context                        │
│ - Generates natural language answer                     │
│                                                         │
│ WORKS WELL:                                             │
│ - Good at synthesizing from provided context            │
│ - Accurate when given right files                       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Answer (quality limited by file selection, not synthesis)
```

---

## Revision History

| Date       | Version | Change                                    | Author |
| ---------- | ------- | ----------------------------------------- | ------ |
| 2026-01-01 | 1.0     | Initial document after benchmark analysis | Claude |
