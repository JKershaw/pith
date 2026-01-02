# Progress Tracker

## Current Status

**Last completed phase**: Phase 7.3 (Overview-Based Navigation) - API Integration Complete ✅
**Current step**: Phase 7.4+ (Overview Content Iteration) - benchmarked, new gaps identified
**Date**: 2026-01-02

### Latest Benchmark: 2026-01-02 (Query Mode)

**Scores**:

- **Pith**: 16.4/20 (82.0%) - **up from 73.5%** on 2026-01-01
- **Control**: 19.1/20 (95.5%)
- **Gap**: 2.7 points (down from 4.3)
- **Win/Loss/Tie**: 0-12-3 (**3 ties achieved!**)

**Key Improvements**:
- +8.5% absolute improvement over previous Query Mode run
- 3 tasks now tie with Control: A2 (Data Flow), B1 (Cache Logic), B3 (Retry Logic)
- Line number references now consistently provided

**Worst Categories** (priority order):
| Category | Pith Avg | Control Avg | Gap |
|----------|----------|-------------|-----|
| Relationship (R1-R3) | 14.3/20 | 19.0/20 | -4.7 |
| Modification (M1-M3) | 15.3/20 | 18.7/20 | -3.4 |
| Debugging (D1-D3) | 16.7/20 | 19.0/20 | -2.3 |

**Worst Criteria**:
| Criterion | Pith Avg | Control Avg | Gap |
|-----------|----------|-------------|-----|
| Completeness | 3.9/5 | 5.0/5 | -1.1 |
| Specificity | 4.0/5 | 5.0/5 | -1.0 |
| Correctness | 4.4/5 | 5.0/5 | -0.6 |

**Persistent Gaps** (from benchmark analysis):
1. **Function-Level Consumer Tracking (R3)**: Pith lists "potential consumers" without line numbers; Control found 1 production + 47 test call sites
2. **Modification Enumeration (M1)**: Pith found 3-4 locations; Control found 13 specific locations
3. **Comparative Analysis (D2)**: Pith listed general causes; Control found key bottleneck (sequential vs batch)

See [2026-01-02 benchmark results](benchmark-results/2026-01-02-self-test.md) for full analysis.

---

## Benchmark History

| Run         | Date           | Mode    | Pith Score | Control | Gap      | Notes                            |
| ----------- | -------------- | ------- | ---------- | ------- | -------- | -------------------------------- |
| v7          | 2025-12-30     | Context | 65%        | 96%     | -7.6     | Baseline                         |
| v1          | 2025-12-31     | Context | 78%        | 92%     | -3.5     | Before fuzzy matching bug        |
| v3          | 2025-12-31     | Context | 65%        | 98%     | -8.2     | Fuzzy matching regression        |
| v4          | 2025-12-31     | Context | 71%        | 96%     | -6.2     | Post-fixes                       |
| Query v1    | 2026-01-01     | Query   | 73.5%      | 95%     | -4.3     | First Query Mode benchmark       |
| **Query v2**| **2026-01-02** | Query   | **82.0%**  | **95.5%**| **-2.7**| **3 ties, +8.5% improvement**   |

---

## Phase 7: Query Planner - COMPLETE ✅

**Goal**: Accept natural language queries and return relevant context automatically.

**Architecture**: Two-stage approach for token efficiency:

1. **Pre-filter** (deterministic): Keyword matching reduces 100+ files to ~25 candidates
2. **Planner LLM**: Selects 3-8 most relevant files from candidates
3. **Synthesizer LLM**: Generates complete answer from selected file prose

### 7.0 Prep Work - COMPLETE ✅

| Step  | What                                                | Status       |
| ----- | --------------------------------------------------- | ------------ |
| 7.0.1 | Keyword index from deterministic data               | **Complete** |
| 7.0.2 | Extend index with summary words (when prose exists) | **Complete** |
| 7.0.3 | Query tokenizer with stopword filtering             | **Complete** |
| 7.0.4 | Pre-filter: match tokens, score, add modules        | **Complete** |
| 7.0.5 | Candidate formatter with relationships              | **Complete** |

### 7.1 Query Endpoint - COMPLETE ✅

| Step  | What                                     | Status       |
| ----- | ---------------------------------------- | ------------ |
| 7.1.1 | `POST /query` endpoint                   | **Complete** |
| 7.1.2 | Integrate pre-filter: query → candidates | **Complete** |
| 7.1.3 | Build planner prompt from candidates     | **Complete** |
| 7.1.4 | Call LLM, parse file selection           | **Complete** |
| 7.1.5 | Fetch prose for selected files           | **Complete** |
| 7.1.6 | Build synthesis prompt                   | **Complete** |
| 7.1.7 | Call LLM, return synthesized answer      | **Complete** |

### 7.3 Overview-Based Navigation - COMPLETE ✅

| Step    | What                                                       | Status       |
| ------- | ---------------------------------------------------------- | ------------ |
| 7.3.1   | Generate project overview from module nodes + edges        | **Complete** |
| 7.3.2   | Include entry points explicitly (fanIn=0 files)            | **Complete** |
| 7.3.3   | Include key relationships ("CLI imports extractFile")      | **Complete** |
| 7.3.4   | Build navigator prompt with overview (~1000-2000 tokens)   | **Complete** |
| 7.3.5   | Parse navigation targets (file, grep, function, importers) | **Complete** |
| 7.3.6   | Validate targets exist, execute greps                      | **Complete** |
| 7.3.7   | Connect to existing synthesis step                         | **Complete** |
| 7.3.7.1 | `resolveAllTargets` orchestration                          | **Complete** |
| 7.3.7.2 | `buildNavigatorSynthesisPrompt` synthesis                  | **Complete** |

### Phase 7.3 Manual Testing Results (2026-01-02)

**Test Environment**: Ran Pith on itself (dogfooding)

**Extraction**: 49 TypeScript files extracted in 15.2s
**Build**: 49 file nodes, 118 function nodes, 11 module nodes

**Navigator Flow Validation**:

- Overview generation: 11 modules, 24 entry points, 29 relationships
- All target types working: file, grep, function, importers

**Test Queries and Results**:

| Query                                      | Mode      | Files Used | Targets                     | Quality                                             |
| ------------------------------------------ | --------- | ---------- | --------------------------- | --------------------------------------------------- |
| "How does the extractor work?"             | navigator | 4          | 4 file, 1 grep, 2 function  | Excellent - found core functions with code snippets |
| "Where is the /query endpoint defined?"    | navigator | 3          | 3 file, 1 grep              | Good - identified query module files                |
| "What are the main WikiNode types?"        | navigator | 15         | 1 file, 2 grep, 1 importers | Good - used importers to find all consumers         |
| "How does the navigator LLM select files?" | navigator | 1          | 1 file, 1 grep, 2 function  | Focused - correctly identified navigator.ts         |
| "Nonexistent feature xyz123?"              | navigator | 1          | Graceful fallback           | Good - found errors module as closest match         |
| "How does the extractor work?"             | planner   | 2          | Legacy flow                 | Good - simpler but still works                      |

**Logging Output** (confirmed working):

```
[query] Navigator flow starting for: "How does the extractor work?"
[query] Overview: 11 modules, 24 entry points, 29 relationships
[query] Navigator returned 7 targets: 4 file, 1 grep, 2 function
[query] Success: 4 files, 12 grep matches, 2 functions
```

**Key Observations**:

1. Navigator mode (default) provides richer context than planner mode
2. Multiple target types (file, grep, function, importers) work correctly
3. Fallback handling works for edge cases
4. Logging provides good visibility into the flow
5. Answer quality is comprehensive with file:line references

**Comparison: Navigator vs Planner**:

- Navigator: Uses project overview → LLM selects targets → resolves context
- Planner: Uses keyword pre-filter → LLM selects files → synthesizes
- Navigator provides more targeted results with grep matches and function details

---

### Phase 7 Implementation Summary (2026-01-02)

**New files**:

- `src/query/index.ts` - Legacy query planner module (keyword pre-filter approach)
- `src/query/index.test.ts` - Tests for query planner
- `src/query/overview.ts` - Project overview generation (Phase 7.3.1-7.3.3)
- `src/query/overview.test.ts` - Tests for project overview
- `src/query/navigator.ts` - Navigator module (Phase 7.3.4-7.3.7)
- `src/query/navigator.test.ts` - Tests for navigator

**Key navigator functions** (Phase 7.3):

- `buildProjectOverview()`: Generates high-level project overview from nodes
- `isEntryPoint()`: Identifies entry points (fanIn=0, few exports)
- `extractRelationships()`: Extracts import relationships for navigator context
- `buildNavigatorPrompt()`: Builds navigator prompt with overview
- `parseNavigatorResponse()`: Parses LLM targets (file, grep, function, importers)
- `resolveAllTargets()`: Orchestrates resolution of all target types
- `buildNavigatorSynthesisPrompt()`: Builds synthesis prompt from resolved context

**API endpoint** (`POST /query`):

Default mode (navigator):

1. Builds project overview from all nodes
2. Calls navigator LLM to produce search targets
3. Resolves targets (files, greps, functions, importers)
4. Generates prose for resolved nodes if missing
5. Calls synthesis LLM to generate answer
6. Returns: answer, filesUsed, reasoning, targets, grepMatches

Legacy mode (`mode: 'planner'`):

- Uses keyword pre-filter → planner LLM → synthesis (Phase 7.1 flow)

**Graceful degradation**: Without LLM config, returns pre-filter results only

**Tests**: 616 total (1 new for navigator API integration)

### Phase 7 Design Analysis (2026-01-01)

**Prompt Review - Key Questions**:

1. What is the goal of each LLM call?
2. What would be perfect starting context?
3. How close can we get with our current plan?

See detailed analysis below.

---

## Phase 6.9: Response Optimization - COMPLETE ✅

**Goal**: Close efficiency and actionability gaps by returning targeted responses instead of full files.

**Context**: v4 benchmark shows Efficiency at 2.1/5 (worst criterion) and token usage 1.2x higher than Control on average.

### 6.9.1 Smarter Default Output - COMPLETE ✅

**Problem**: B2, D1, D2 return full files instead of specific functions. M1 uses 4.9x more tokens than Control.

**Approach**: Make defaults smarter instead of adding parameters. Pith should automatically decide what to include.

| Step    | What                                                      | Status   |
| ------- | --------------------------------------------------------- | -------- |
| 6.9.1.1 | Default to compact output (prose + key statements only)   | **Done** |
| 6.9.1.2 | Auto-expand for small files (<5 functions)                | **Done** |
| 6.9.1.3 | Prioritize by relevance (high fan-in → more detail)       | **Done** |
| 6.9.1.4 | Include full code only for functions with patterns/errors | **Done** |

**Implementation Summary (2026-01-01)**:

- Added `shouldExpandFunction()` helper to determine when to show full code
- **Compact format (default)**: Shows function signature + key statements only
- **Auto-expand conditions**:
  - Small files (<5 functions)
  - High fan-in files (fanIn > 5)
  - Functions with detected patterns (retry, cache, etc.)
  - Functions with error paths

**Expected impact**: ~50% reduction in token usage for typical context requests

### 6.9.2 Function-Level Consumer Tracking - COMPLETE ✅

**Problem**: R3 scored 13/25. importedBy shows 2 files but Control found 48 call sites with line numbers.

| Step    | What                                                 | Status   |
| ------- | ---------------------------------------------------- | -------- |
| 6.9.2.1 | Track call sites for exported functions across files | **Done** |
| 6.9.2.2 | Store function usage with file:line references       | **Done** |
| 6.9.2.3 | Add `/consumers/:file/:function` endpoint            | **Done** |
| 6.9.2.4 | Distinguish production vs test consumers             | **Done** |

**Implementation Summary (2026-01-01)**:

- Added `FunctionConsumer` and `FunctionConsumers` interfaces
- Implemented `buildFunctionConsumers()` to map all call sites across codebase
- Added `GET /consumers/:file/:function` API endpoint
- Separates production consumers from test consumers using `isTestFile()`

**Example API response**:

```json
{
  "functionName": "validateToken",
  "sourceFile": "src/auth.ts",
  "totalConsumers": 4,
  "productionConsumers": [{ "file": "src/controller.ts", "line": 39, "isTest": false }],
  "testConsumers": [{ "file": "src/auth.test.ts", "line": 10, "isTest": true }]
}
```

### Phase 6.9 Success Criteria

| Metric     | v4 Baseline | Target | Status      |
| ---------- | ----------- | ------ | ----------- |
| Efficiency | 2.1/5       | ≥4/5   | Implemented |
| R3         | 13/25       | ≥20/25 | Implemented |

**Total tests**: 474
**Note**: 6.9.3 (Debugging Prose) and 6.9.4 (Context Adaptation) removed - Phase 7 Query Planner handles these better by seeing the actual user question.

---

## Phase 6.6: Enhanced Deterministic Extraction - COMPLETE ✅

**Goal**: Close information gaps by extracting facts deterministically, reducing LLM to synthesis only.

**Benchmark progression**:

- Baseline (v1): 12.6/25
- After P0 (v5): 15.5/25
- With prose (v7): 16.3/25 (+13% from prose)
- Control: 23.9/25
- **Remaining gap: 7.6 points (30%)**

See `docs/benchmark-results/2025-12-30-self-test-v7.md` for comprehensive results.

### 6.6.1 Surface Existing Data (P0) - COMPLETE ✅

| Step    | What                                | Status   | Benchmark                   |
| ------- | ----------------------------------- | -------- | --------------------------- |
| 6.6.1.1 | Line numbers for functions          | **Done** | Task 2: +relevance          |
| 6.6.1.2 | Code snippets (first 15 lines)      | **Done** | Task 2: 14→18/25            |
| 6.6.1.3 | Key statements via AST              | **Done** | Task 2: 18→23/25 (expected) |
| 6.6.1.4 | Default param values + return types | **Done** | Already in FunctionData     |

**Implementation Summary**:

- `FunctionData` now includes: `startLine`, `endLine`, `codeSnippet`, `keyStatements`
- `Param` includes `defaultValue`
- `extractKeyStatements()` finds config, URLs, math, conditions, errors via AST
- `formatContextAsMarkdown()` now displays full function details in API output
- See `docs/benchmark-results/2025-12-30-p0-implementation.md` for full results

**Manual Validation (2025-12-30)**:
Ran Pith on itself and verified `/context` output for `src/generator/index.ts`:

- ✅ Function `callLLM` shows lines 469-565
- ✅ Key statements captured:
  - URL: `'https://openrouter.ai/api/v1/chat/completions'`
  - Config: `maxRetries = 3`, `timeout = config.timeout ?? 30000`
  - Condition: `if (response.status === 429)`
  - Math: `Math.pow(2, attempt) * 1000` (backoff formula)
  - Error: `catch (error)`
- All critical information gaps from benchmark are now closed

### 6.6.2 Pattern Detection (P1) - MOSTLY COVERED BY 6.6.1.3

**Assessment**: Key statements extraction (6.6.1.3) already provides most P1 value:

| Step    | Pattern                 | Status      | Notes                                            |
| ------- | ----------------------- | ----------- | ------------------------------------------------ |
| 6.6.2.1 | Retry logic detection   | **Covered** | Key statements find maxRetries, backoff formula  |
| 6.6.2.2 | Error handling summary  | **Covered** | Key statements find catch clauses, status checks |
| 6.6.2.3 | Timeout configuration   | **Covered** | Key statements find timeout values               |
| 6.6.2.4 | Config value extraction | **Covered** | Key statements find all config values            |

**Recommendation**: Skip structured pattern objects for now. Key statements provide raw facts; LLM can synthesize.

### 6.6.3 Enhanced Metadata (P2)

| Step    | Metric                | Status   | Notes                 |
| ------- | --------------------- | -------- | --------------------- |
| 6.6.3.1 | Cyclomatic complexity | Pending  | Nice-to-have          |
| 6.6.3.2 | Lines per function    | **Done** | Via startLine/endLine |
| 6.6.3.3 | Intra-file call graph | **Done** | Implemented in 6.6.7a |

### 6.6.4 Feed Facts to LLM - ALREADY IMPLEMENTED ✅

**Assessment**: LLM prompts already include deterministic facts via `formatFunctionForPrompt()`:

| Step    | Change                      | Status   | Notes                            |
| ------- | --------------------------- | -------- | -------------------------------- |
| 6.6.4.1 | Include patterns in prompt  | **Done** | Key statements included          |
| 6.6.4.2 | Include line numbers        | **Done** | `### funcName (lines X-Y)`       |
| 6.6.4.3 | Include config values       | **Done** | Key statements by category       |
| 6.6.4.4 | Update prompt to synthesize | **Done** | "Focus on WHAT and WHY, not HOW" |

**Example prompt output**:

```
### callLLM (lines 469-565)
  [config] line 475: `maxRetries = 3`
  [math] line 528: `backoffMs = Math.pow(2, attempt) * 1000`
```

### Success Criteria

| Metric        | Before  | After P0 | Target | Gap  |
| ------------- | ------- | -------- | ------ | ---- |
| Relevance     | 2.4/5   | 3.0/5    | ≥4/5   | -1.0 |
| Completeness  | 1.8/5   | 1.8/5    | ≥4/5   | -2.2 |
| Accuracy      | 3.6/5   | 4.0/5    | ≥4.5/5 | -0.5 |
| Actionability | 1.8/5   | 1.8/5    | ≥4/5   | -2.2 |
| Overall       | 12.6/25 | 15.5/25  | ≥20/25 | -4.5 |

**Finding**: P0 improved Relevance (+0.6) and Accuracy (+0.4) via line numbers and code snippets. Completeness/Actionability require deeper capabilities (6.6.5-6.6.8).

### 6.6.5 Change Impact Analysis - COMPLETE ✅

| Step    | What                                      | Status   |
| ------- | ----------------------------------------- | -------- |
| 6.6.5.1 | Traverse importedBy edges recursively     | **Done** |
| 6.6.5.2 | Identify affected functions per dependent | **Done** |
| 6.6.5.3 | Add "Change Impact" section to output     | **Done** |
| 6.6.5.4 | Include test file impact analysis         | **Done** |

**Implementation Summary (2025-12-30)**:

**Builder additions** (`src/builder/index.ts`):

- `ImpactTree` interface: sourceFile, directDependents, transitiveDependents, dependentsByDepth
- `buildImpactTree()`: BFS traversal of importedBy edges with depth tracking, handles cycles/diamonds
- `findAffectedFunctions()`: Scans function code snippets for usage of changed exports
- `getTestFilesForImpact()`: Collects test files covering affected source files

**API additions** (`src/api/index.ts`):

- `GET /impact/:path`: Returns change impact analysis as JSON or markdown
- `ChangeImpactResult` interface: Extends ImpactTree with affectedFunctions and testFiles
- `formatChangeImpactAsMarkdown()`: Human-readable impact report with:
  - Direct and transitive dependents by depth
  - Affected functions with line numbers and used symbols
  - Test commands to run

**Tests**: 307 total (8 new for Phase 6.6.5)

**Example output**:

````markdown
# Change Impact Analysis

**Source file:** `src/types/index.ts`
**Total affected files:** 5

## Direct Dependents

Files that directly import this file:

### src/utils/helper.ts

**Affected functions:**

- `validateUser` (lines 10-25)
  - Uses: User, Session

## Test Files to Run

```bash
npm test -- src/types/index.test.ts
npm test -- src/utils/helper.test.ts
```
````

````

### 6.6.7a Intra-File Call Graph - COMPLETE ✅

| Step | What | Status |
|------|------|--------|
| 6.6.7a.1 | Track function calls within same file | **Done** |
| 6.6.7a.2 | Identify call chains (A→B→C) within file | **Done** |
| 6.6.7a.3 | Add "Calls" field to function nodes | **Done** |
| 6.6.7a.4 | Add "Called by" field to function nodes | **Done** |

**Implementation Summary (2025-12-30)**:

**Extractor additions** (`src/extractor/ast.ts`):
- Added `calls` and `calledBy` fields to `FunctionData` interface
- Implemented `extractFunctionCalls()` to find direct function calls using AST analysis
- Filters to only include calls to functions defined in the same file
- Ignores method calls (obj.method()) and built-in functions

**Builder additions** (`src/builder/index.ts`):
- Added `calls` and `calledBy` fields to `FunctionDetails` interface
- Implemented reverse lookup to compute `calledBy` from `calls` data
- Handles multiple callers and call chains (A→B→C)

**Tests**: 317 total (10 new for Phase 6.6.7a)

**What this enables**:
- Phase 6.6.6: Design Pattern Recognition (detect retry patterns, caching, etc.)
- Phase 6.6.8: Error Path Analysis (trace error propagation through call chains)
- Phase 6.6.7b: Cross-File Call Graph (extend to track calls across files)

---

### 6.6.6 Design Pattern Recognition - COMPLETE ✅

| Step | What | Status |
|------|------|--------|
| 6.6.6.1 | Detect Retry pattern | **Done** |
| 6.6.6.2 | Detect Cache pattern | **Done** |
| 6.6.6.3 | Detect Builder pattern | **Done** |
| 6.6.6.4 | Detect Singleton pattern | **Done** |
| 6.6.6.5 | Validate detected patterns | **Done** |
| 6.6.6.6 | Add "Patterns" section to prose prompt | **Done** |

**Implementation Summary (2025-12-30)**:

**New files**:
- `src/extractor/patterns.ts` - Pattern detection functions
- `src/extractor/patterns.test.ts` - 11 tests for pattern detection

**Pattern detectors** (`src/extractor/patterns.ts`):
- `detectRetryPattern()`: Finds loops with try/catch + exponential backoff (Math.pow)
  - Uses keyStatements to find retry variables, error handling, backoff formulas
  - Detects retry patterns even when loop is outside code snippet
  - **High confidence**: Verified in `callLLM` function
- `detectCachePattern()`: Finds modules with cache-like structures
  - Detects cache types (interfaces with "cache" in name)
  - Finds cache operations (load, save, get, set, has)
  - **High confidence**: Verified in `cache.ts`
- `detectBuilderPattern()`: Finds classes with chainable methods
  - Detects methods returning `this` for chaining
  - **Medium confidence**: Requires 2+ chainable methods
- `detectSingletonPattern()`: Finds module-level instance management
  - Detects getInstance patterns and instance checks
  - **Medium confidence**: Requires instance variable + getter

**Data structure**:
```typescript
interface DetectedPattern {
  name: 'retry' | 'cache' | 'builder' | 'singleton';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];  // Line numbers and code snippets
  location: string;    // file:function or file path
}
````

**Integration**:

- Added `patterns` field to `ExtractedFile` interface
- Added `patterns` to `WikiNode.raw` interface
- Pattern detection runs during extraction via `addPatternsToExtractedFile()`
- Patterns included in LLM prompts with evidence

**Prose prompt changes** (`src/generator/index.ts`):

- Added "DETECTED PATTERNS" section showing found patterns with evidence
- Updated output format instructions to confirm/refine detected patterns
- LLM now sees pattern hints and can elaborate with implementation details

**Tests**: 328 total (11 new for Phase 6.6.6)

**Patterns detected in Pith itself**:

- `src/generator/index.ts:callLLM` - RETRY pattern (maxRetries=3, exponential backoff)
- `src/extractor/cache.ts` - CACHE pattern (ExtractionCache interface + load/save/get operations)

**What this enables**:

- Benchmark A3 (Design Patterns): Expected improvement from 13/25 to 18+/25
- Provides concrete evidence for pattern usage in gotchas and documentation
- Foundation for 6.6.6b (advanced patterns requiring cross-file analysis)

---

### 6.6.8 Error Path Analysis - COMPLETE ✅

| Step    | What                                    | Status   |
| ------- | --------------------------------------- | -------- |
| 6.6.8.1 | Find all early return/throw statements  | **Done** |
| 6.6.8.2 | Trace error propagation in catch blocks | **Done** |
| 6.6.8.3 | Identify validation guards              | **Done** |
| 6.6.8.4 | Add "Error Paths" section for functions | **Done** |

**Implementation Summary (2025-12-30)**:

**New files**:

- `src/extractor/errors.ts` - Error path detection functions
- `src/extractor/errors.test.ts` - 14 tests for error path detection

**Detection functions** (`src/extractor/errors.ts`):

- `extractEarlyReturns()`: Finds return statements inside conditionals that exit early
- `extractThrowStatements()`: Detects all throw statements with their conditions
- `extractCatchBlocks()`: Classifies error handling as re-throw, transform, log, or swallow
- `extractValidationGuards()`: Identifies input validation in first 5 statements
- `extractErrorPaths()`: Main function combining all detectors

**Data structure**:

```typescript
interface ErrorPath {
  type: 'early-return' | 'throw' | 'catch' | 'guard';
  line: number;
  condition?: string; // The condition that triggers this path
  action: string; // What happens (return value, error thrown, etc.)
}
```

**Integration**:

- Added `errorPaths` field to `FunctionData` interface
- Propagated error paths from extraction to `WikiNode.raw.functions[].errorPaths`

**Tests**: 342 total (14 new for Phase 6.6.8)

**Error paths detected in key Pith functions**:

- `src/generator/index.ts:callLLM` - 5 error paths (throws, catches, transforms)
- `src/extractor/ast.ts:extractFile` - 2 error paths (catch + transform)

**What this enables**:

- Benchmark D1-D3 (Debugging tasks): Expected improvement from 15/25 to 20+/25
- Specific error causes with line numbers for debugging questions
- Foundation for error flow tracing in Phase 6.6.7b

---

### 6.6.7b Cross-File Call Graph - COMPLETE ✅

| Step     | What                                     | Status   |
| -------- | ---------------------------------------- | -------- |
| 6.6.7b.1 | Resolve imported symbols to source files | **Done** |
| 6.6.7b.2 | Handle re-exports                        | **Done** |
| 6.6.7b.3 | Build cross-file call graph              | **Done** |
| 6.6.7b.4 | Add "Call Flow" section for functions    | **Done** |

**Implementation Summary (2025-12-30)**:

**New files**:

- `src/builder/cross-file-calls.ts` - Cross-file call graph logic
- `src/builder/cross-file-calls.test.ts` - 10 tests for cross-file calls
- Test fixtures: `utils.ts`, `service.ts`, `controller.ts`

**Core functions** (`src/builder/cross-file-calls.ts`):

- `resolveImportedSymbol()`: Maps imported symbols to source files
  - Handles named imports: `import { X } from './y'` → `y.ts:X`
  - Handles default imports: `import X from './y'` → `y.ts:default`
  - Skips type-only imports and node_modules
- `followReExportChain()`: Follows re-export chains with max depth of 5
- `buildCrossFileCallGraph()`: Creates complete map of cross-file function calls
- `updateCrossFileCalls()`: Populates WikiNodes with cross-file call data

**Data structure**:

```typescript
interface CrossFileCall {
  caller: string; // 'file.ts:functionName'
  callee: string; // 'other.ts:functionName'
}
```

**Integration**:

- Added `crossFileCalls` and `crossFileCalledBy` to `FunctionDetails`
- Integrated into build process via CLI
- Added "Call Flow" section to API markdown output (for functions with >3 cross-file calls)

**Tests**: 352 total (10 new for Phase 6.6.7b)

**Example cross-file calls detected**:

- `controller.ts:handleRegister` → `service.ts:registerUser`
- `service.ts:registerUser` → `utils.ts:formatUserName`, `validateEmail`, `hashPassword`

**What this enables**:

- Benchmark B1-B3 (Behavior tasks): Expected improvement from 16/25 to 20+/25
- Complete call flow tracing across module boundaries
- Foundation for advanced pattern recognition across files

---

### Phase 6.6 Summary - ALL COMPLETE ✅

| Phase  | Description                | Status                |
| ------ | -------------------------- | --------------------- |
| 6.6.1  | Surface Existing Data (P0) | ✅ Complete           |
| 6.6.2  | Pattern Detection (P1)     | ✅ Covered by 6.6.1.3 |
| 6.6.3  | Enhanced Metadata (P2)     | ✅ Complete           |
| 6.6.4  | Feed Facts to LLM          | ✅ Complete           |
| 6.6.5  | Change Impact Analysis     | ✅ Complete           |
| 6.6.6  | Design Pattern Recognition | ✅ Complete           |
| 6.6.7a | Intra-File Call Graph      | ✅ Complete           |
| 6.6.7b | Cross-File Call Graph      | ✅ Complete           |
| 6.6.8  | Error Path Analysis        | ✅ Complete           |

**Total tests**: 352
**Total new capabilities added**:

- Line numbers and code snippets for functions
- Key statements extraction (config, URLs, math, conditions, errors)
- Change impact analysis with transitive dependents
- Design pattern recognition (Retry, Cache, Builder, Singleton)
- Intra-file and cross-file call graphs
- Error path analysis (early returns, throws, catches, guards)

---

### 6.6.9 Implementation Hints (P2 - DEFERRED)

Per ROADMAP.md, implementation hints are deferred until pattern recognition and change impact are proven effective in benchmarks.

---

### v7 Gap Analysis (Post 6.6 Completion)

Phase 6.6 is complete, but v7 benchmark shows gaps remain. Analysis of why:

| Capability                   | Status         | v7 Score     | Issue                                           |
| ---------------------------- | -------------- | ------------ | ----------------------------------------------- |
| Change impact (6.6.5)        | ✅ Implemented | M1-M3: 14/25 | Shows file counts, not specific usage locations |
| Pattern recognition (6.6.6)  | ✅ Implemented | A3: 16/25    | Control found 24 patterns; Pith shows "partial" |
| Cross-file calls (6.6.7b)    | ✅ Implemented | B1-B3: 17/25 | Edges exist but call flow not surfaced in prose |
| Error paths (6.6.8)          | ✅ Implemented | D1-D3: 16/25 | Root causes not detailed enough                 |
| Implementation hints (6.6.9) | ⏸️ Deferred    | M1-M3: 14/25 | Critical gap - no modification guides           |

**Root Cause**: Features are extracted but not fully surfaced in API output/prose. Need better integration.

---

## Phase 6.7: Enhanced Output Integration - COMPLETE ✅

**Goal**: Surface extracted data more effectively in API output to close actionability and completeness gaps.

**Target**: Overall score 16.3/25 → ≥20/25

### 6.7.1 Consumer Location Specificity

| Step    | What                                                 | Status  |
| ------- | ---------------------------------------------------- | ------- |
| 6.7.1.1 | Show usage line numbers per dependent in `/impact`   | Pending |
| 6.7.1.2 | Group usages by type (import, property access, call) | Pending |
| 6.7.1.3 | Find property access sites for interfaces/types      | Pending |

### 6.7.2 Modification Guides - COMPLETE ✅

| Step    | What                                                  | Status   |
| ------- | ----------------------------------------------------- | -------- |
| 6.7.2.1 | Include "Modification Checklist" for high-fanIn types | **Done** |
| 6.7.2.2 | Identify insertion points for middleware patterns     | **Done** |
| 6.7.2.3 | Include test update requirements in guides            | **Done** |
| 6.7.2.4 | Add "Similar Changes" section from git history        | **Done** |

**Implementation Summary (2025-12-31)**:

**API additions** (`src/api/index.ts`):
For high fan-in files (>5 dependents), the `/context` markdown now includes:

1. **Modification Checklist** (6.7.2.1):
   - Step 1: Update this file - shows file path and exported types
   - Step 2: Update consumers - lists dependent files (up to 10)
   - Step 3: Run tests - links to test file if available

2. **Test Update Requirements** (6.7.2.3):
   - Shows test file path from testFile edges
   - Shows test command from metadata or generates default

3. **Middleware Insertion Points** (6.7.2.2):
   - Detects Express-style middleware patterns (app.use, router.use)
   - Shows line numbers for existing middleware calls
   - Guides where to add new middleware

4. **Recent Changes** (6.7.2.4):
   - Shows last 5 commits from git history
   - Includes hash, message, author, date

**Example output for high-fanIn file**:

```markdown
**Modification Checklist:**

1. **Update this file** - Make changes to `src/types/index.ts`
   - Exported types: WikiNode, Edge
2. **Update consumers** - 8 files depend on this:
   - `src/api/index.ts`
   - `src/builder/index.ts`
   - ... and 6 more files
3. **Run tests** - Verify changes don't break consumers
   - Test file: `src/types/index.test.ts`
   - Run: `npm test -- src/types/index.test.ts`

**Recent Changes:**
Prior changes to this file (for reference):

- `abc1234` feat: add metadata field to WikiNode (alice, 2024-12-01)
- `def5678` refactor: update Edge type definition (bob, 2024-11-15)
```

**Tests**: 357 total (4 new for Phase 6.7.2)

**What this enables**:

- Benchmark M1-M3 (Modification tasks): Expected improvement via actionable checklists
- Shows developers exactly what needs updating when modifying widely-used types
- Includes historical context and test requirements

### 6.7.3 Enhanced Call Flow Presentation - COMPLETE ✅

| Step    | What                                               | Status   |
| ------- | -------------------------------------------------- | -------- |
| 6.7.3.1 | Add "Call Flow" section with traced paths          | **Done** |
| 6.7.3.2 | Include key variable values along call paths       | **Done** |
| 6.7.3.3 | Show full path with file:line for cross-file calls | **Done** |

**Implementation Summary (2025-12-31)**:

- Shows call flow for all functions with cross-file calls
- Format: `src/file.ts` → `functionName()` for calls
- Format: `src/file.ts` ← `callerName()` for callers
- Removed >3 threshold to show for more functions

### 6.7.4 Root Cause Debugging Hints - COMPLETE ✅

| Step    | What                                                 | Status   |
| ------- | ---------------------------------------------------- | -------- |
| 6.7.4.1 | Group errors by symptom category                     | **Done** |
| 6.7.4.2 | Include specific values that trigger each error path | **Done** |
| 6.7.4.3 | Add "Debug Checklist" for common symptoms            | **Done** |
| 6.7.4.4 | Link error paths to test files                       | **Done** |

**Implementation Summary (2025-12-31)**:

- Error paths grouped by type: validation guards, early returns, throws, catch handlers
- Each shows: line number, condition, action
- Links to test files with test commands
- Example: `*Validation guards:* - Line 11: \`!req.path\` → returns 400 (Bad Request)`

### 6.7.5 Pattern Evidence Enhancement - COMPLETE ✅

| Step    | What                                       | Status   |
| ------- | ------------------------------------------ | -------- |
| 6.7.5.1 | Include all instances of detected patterns | **Done** |
| 6.7.5.2 | Show key lines that confirm each pattern   | **Done** |
| 6.7.5.3 | Add pattern-specific usage guidance        | **Done** |

**Implementation Summary (2025-12-31)**:

- Shows detected patterns with confidence level
- Lists evidence lines for each pattern
- Provides pattern-specific usage guidance (retry: modify maxRetries; cache: use get/set/has; etc.)

### 6.7.1 Consumer Location Specificity - COMPLETE ✅

| Step    | What                                                 | Status   |
| ------- | ---------------------------------------------------- | -------- |
| 6.7.1.1 | Show usage line numbers per dependent in `/impact`   | **Done** |
| 6.7.1.2 | Group usages by type (import, property access, call) | **Done** |
| 6.7.1.3 | Find property access sites for interfaces/types      | **Done** |

**Implementation Summary (2025-12-31)**:

- Existing `findAffectedFunctions` already provides this capability
- Shows which functions in dependent files use changed exports
- Verified with new test case

---

## Phase 6.7 Summary - ALL COMPLETE ✅

| Phase | Description                     | Status      |
| ----- | ------------------------------- | ----------- |
| 6.7.1 | Consumer Location Specificity   | ✅ Complete |
| 6.7.2 | Modification Guides             | ✅ Complete |
| 6.7.3 | Enhanced Call Flow Presentation | ✅ Complete |
| 6.7.4 | Root Cause Debugging Hints      | ✅ Complete |
| 6.7.5 | Pattern Evidence Enhancement    | ✅ Complete |

**Total tests**: 363
**New capabilities added**:

- Modification checklists for high fan-in files
- Middleware insertion point detection
- Error paths grouped by symptom with test links
- Enhanced call flow with file:function format
- Detected patterns with evidence and usage guidance

---

## Phase 6.8: Deterministic Gap Closure ✅ COMPLETE

**Goal**: Close remaining gaps identified in 2025-12-31 benchmark through deterministic improvements before adding MCP delivery layer.

**Rationale**: MCP server is a delivery mechanism, not a quality improvement. Prioritize closing the 3.5-point gap through extraction/output enhancements.

### 6.8.1 Symbol-Level Import Tracking - COMPLETE ✅

| Step    | What                                                      | Status   |
| ------- | --------------------------------------------------------- | -------- |
| 6.8.1.1 | Track which specific symbols are used from imports        | **Done** |
| 6.8.1.2 | Filter impact analysis to only files using changed symbol | **Done** |
| 6.8.1.3 | Show symbol usage in dependent file context               | **Done** |

**Implementation Summary (2025-12-31)**:

- Added `SymbolUsage` interface to track imported symbol usages with line numbers
- Implemented `extractSymbolUsages()` in AST extractor to find all usages of imported symbols
- Added `symbolUsages` field to `ExtractedFile` and `WikiNode.raw`
- Added `getUsedSymbolsFromFile()` and `dependentUsesExports()` for symbol-level filtering
- Updated `/impact` API to show symbol-level usage with line numbers

**Benchmark target**: R3: 11/25 → 18/25 (fixes 69% false positives)

### 6.8.2 Full Content Preservation - COMPLETE ✅

| Step    | What                                                  | Status   |
| ------- | ----------------------------------------------------- | -------- |
| 6.8.2.1 | Increase code snippet limit for complex functions     | **Done** |
| 6.8.2.2 | Smart truncation that preserves key statement context | **Done** |
| 6.8.2.3 | Add "full source available" indicator when truncated  | **Done** |

**Implementation Summary (2025-12-31)**:

- Complex functions (>5 key statements) now get 30 lines instead of 15
- Smart truncation preserves 3 lines of context around each key statement
- Truncation indicator now shows remaining lines AND remaining key statements
- Key statements extracted before code snippet generation for informed truncation

**Benchmark target**: B2: 17/25 → 21/25

### 6.8.3 Config File Extraction - COMPLETE ✅

| Step    | What                                          | Status   |
| ------- | --------------------------------------------- | -------- |
| 6.8.3.1 | Extract package.json scripts and dependencies | **Done** |
| 6.8.3.2 | Extract tsconfig.json compiler options        | **Done** |
| 6.8.3.3 | Extract pith.config.json if present           | **Done** |

**Implementation Summary (2025-12-31)**:

- Created new `src/extractor/config.ts` with extraction functions
- `extractPackageJson()`: Extracts scripts, dependencies, name, version
- `extractTsConfig()`: Extracts compilerOptions, include, exclude
- `extractPithConfig()`: Extracts pith-specific configuration
- `extractConfigFiles()`: Combines all config file extraction

**Benchmark target**: Improves context for all task categories

### 6.8.4 Enhanced Debugging Output - COMPLETE ✅

| Step    | What                                               | Status   |
| ------- | -------------------------------------------------- | -------- |
| 6.8.4.1 | Show full condition chain for each error path      | **Done** |
| 6.8.4.2 | Group error causes by HTTP status code             | **Done** |
| 6.8.4.3 | Include stack trace hints (error propagation path) | **Done** |

**Implementation Summary (2025-12-31)**:

- Added `conditionChain` and `httpStatus` fields to `ErrorPath` interface
- Implemented `detectHttpStatus()` to extract HTTP status codes from error messages
- Added `groupErrorsByStatus()` to group error paths by HTTP status
- Added `formatConditionChain()` for readable condition chain display
- Added `formatErrorPathsForDebugging()` for enhanced markdown output

**Benchmark target**: D1-D3: 16/25 → 20/25

### Phase 6.8 Summary - ALL COMPLETE ✅

| Phase | Description                  | Status      |
| ----- | ---------------------------- | ----------- |
| 6.8.1 | Symbol-Level Import Tracking | ✅ Complete |
| 6.8.2 | Full Content Preservation    | ✅ Complete |
| 6.8.3 | Config File Extraction       | ✅ Complete |
| 6.8.4 | Enhanced Debugging Output    | ✅ Complete |

**Total tests**: 399
**New capabilities added**:

- Symbol-level import tracking with line numbers
- Smart code snippet truncation for complex functions
- Config file extraction (package.json, tsconfig.json, pith.config.json)
- HTTP status code grouping for error paths
- Enhanced condition chain display for debugging

### Phase 6.8 Success Criteria

| Metric         | Current (v8)  | Target       |
| -------------- | ------------- | ------------ |
| Overall        | 19.4/25 (78%) | ≥21/25 (84%) |
| Gap to Control | 3.5 points    | ≤2 points    |
| R3 (worst)     | 11/25         | ≥18/25       |
| D1-D3 avg      | 16/25         | ≥20/25       |

---

### Phase 6 - On-Demand Generation & Task-Oriented Context - COMPLETE ✅

All Phase 6 priorities implemented:

| Priority | Feature                        | Status   |
| -------- | ------------------------------ | -------- |
| 1        | On-demand prose generation     | **DONE** |
| 2        | Test file mapping              | **DONE** |
| 3        | Modification impact in context | **DONE** |
| 4        | Pattern examples               | **DONE** |
| 5        | Gotcha validation              | **DONE** |

---

## Phase 6 Manual Validation - COMPLETE

### Validation Performed (2025-12-30)

**Test Environment**: Ran Pith on itself (dogfooding)

**Extraction Results**:

- Default config: 17 TypeScript files (test files excluded)
- With test files: 29 files extracted
- All files processed successfully

**Build Results**:

- 29 file nodes, 57 function nodes, 10 module nodes
- Edges correctly established (imports, contains, parent, testFile, importedBy)

**Phase 6.2 - Test File Mapping** ✅ VERIFIED:

- `testFile` edges created when test files are included in extraction
- Example: `src/api/index.ts` → `src/api/index.test.ts`
- Context bundling automatically includes test files
- Note: Test files excluded by default in config; include with custom `exclude` pattern

**Phase 6.3 - Modification Impact** ✅ VERIFIED:

- `importedBy` edges correctly created for all imports
- Example: `src/extractor/ast.ts` has 7 dependents
- Fan-in warning displays: `> **Warning:** Widely used (7 files depend on this)`
- "Dependents" section shows in markdown output:
  ```
  **Dependents:**
  - src/builder/index.ts
  - src/cli/index.ts
  - src/extractor/docs.ts
  ...
  ```

**API Validation**:

- `GET /node/:path` returns complete node data with all edge types
- `GET /context?files=...` bundles requested files, imports, parents, and test files
- Markdown format clean and readable with fan-in warnings

**Issues Found**: None blocking

---

## Phase 6.5: Gotcha Validation - COMPLETE

### Implementation Summary

| Step  | Description                              | Status |
| ----- | ---------------------------------------- | ------ |
| 6.5.1 | Validate gotchas after LLM generation    | Done   |
| 6.5.2 | Check function/variable names exist      | Done   |
| 6.5.3 | Flag unverifiable with confidence levels | Done   |
| 6.5.4 | Integration with generateProse()         | Done   |

### Key Changes

- **Generator**: `extractIdentifiers()` finds code identifiers in text
- **Generator**: `validateGotcha()` checks against exports, signatures, imports
- **Generator**: `validateGotchas()` for batch validation
- **ProseData**: New `gotchaConfidence` array (high/medium/low)
- **Tests**: 16 new tests added (286 total, all passing)

### Confidence Levels

- **High**: All mentioned identifiers verified in raw data
- **Medium**: Some identifiers verified
- **Low**: No identifiers could be verified (possible hallucination)

---

## Phase 6.4: Pattern Examples - COMPLETE

### Implementation Summary

| Step  | Description                         | Status |
| ----- | ----------------------------------- | ------ |
| 6.4.1 | Quick Start section in module prose | Done   |
| 6.4.2 | LLM prompts request code patterns   | Done   |
| 6.4.3 | Similar file references             | Done   |

### Key Changes

- **ProseData**: New fields `quickStart`, `patterns`, `similarFiles`
- **File Prompt**: Requests usage patterns and similar files
- **Module Prompt**: Requests Quick Start code example
- **API**: Displays patterns and Quick Start in markdown output
- **Tests**: 8 new tests added (270 total, all passing)

### Example Output

```markdown
## src/auth

**Type:** module

**Quick Start:**
\`\`\`typescript
import { login, logout } from './auth';
await login(username, password);
\`\`\`
```

---

## Phase 6.3: Modification Impact - COMPLETE

### Implementation Summary

| Step  | Description                                 | Status |
| ----- | ------------------------------------------- | ------ |
| 6.3.1 | Add `importedBy` edges (reverse of imports) | Done   |
| 6.3.2 | Show dependents in context markdown         | Done   |
| 6.3.3 | Add warning for high fan-in (> 5)           | Done   |

### Key Changes

- **Builder**: `buildDependentEdges()` creates 'importedBy' edges
- **API**: `formatContextAsMarkdown()` shows "Dependents" section
- **API**: Warning for widely-used files: "Widely used (N files depend on this)"
- **CLI**: Build command creates importedBy edges
- **Tests**: 8 new tests added (262 total, all passing)

### Example Output

```markdown
## src/config.ts

**Type:** file

> **Warning:** Widely used (8 files depend on this)

**Dependents:**

- src/auth/login.ts
- src/api/routes.ts
```

---

## Phase 6.2: Test File Mapping - COMPLETE

### Implementation Summary

| Step  | Description                          | Status |
| ----- | ------------------------------------ | ------ |
| 6.2.1 | Detect test files by pattern         | Done   |
| 6.2.2 | Add `testFile` edge type             | Done   |
| 6.2.3 | Include test file in /context bundle | Done   |
| 6.2.4 | Add `testCommand` to metadata        | Done   |

### Key Changes

- **Builder**: `isTestFile()` detects `*.test.ts`, `*.spec.ts`, `__tests__/` patterns
- **Builder**: `buildTestFileEdges()` creates edges from source to test files
- **API**: `bundleContext()` automatically includes test files
- **Metadata**: Test files have `testCommand: "npm test -- <path>"`
- **Tests**: 13 new tests added (254 total, all passing)

### Usage

```bash
# Context now includes test files automatically
curl http://localhost:3000/context?files=src/builder/index.ts
# Returns: src/builder/index.ts + src/builder/index.test.ts
```

---

## Phase 6.1: On-Demand Prose Generation - COMPLETE

### Implementation Summary

| Step  | Description                                   | Status           |
| ----- | --------------------------------------------- | ---------------- |
| 6.1.1 | Modify `/node/:path` to check for prose       | Done             |
| 6.1.2 | Add `generateProseForNode()` function         | Done             |
| 6.1.3 | Cache generated prose in DB                   | Done (existing)  |
| 6.1.4 | Add `--lazy` flag to `pith serve`             | Done             |
| 6.1.5 | Keep `pith generate` for batch pre-generation | Done (unchanged) |
| 6.1.6 | Add `?prose=false` query param                | Done             |

### Key Changes

- **Generator**: New `generateProseForNode()` function for single-node generation
- **API**: `/node/:path` auto-generates prose when missing (unless `?prose=false`)
- **CLI**: `pith serve --lazy` (default) enables on-demand generation
- **Tests**: 7 new tests added (241 total, all passing)

### Usage

```bash
# Start server with lazy generation (default)
export OPENROUTER_API_KEY=your-key
pith serve

# Start server without lazy generation
pith serve --no-lazy

# Get node (auto-generates prose if missing)
curl http://localhost:3000/node/src/auth/login.ts

# Skip prose generation
curl http://localhost:3000/node/src/auth/login.ts?prose=false
```

---

## Phase 1: Foundation - COMPLETE

### 1.0 Project Setup - COMPLETE

| Step  | Description                                                          | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 1.0.1 | Initialize TypeScript project with ESM, strict mode                  | Done   |
| 1.0.2 | Add dependencies: ts-morph, simple-git, commander, @jkershaw/mangodb | Done   |
| 1.0.3 | Configure Node test runner                                           | Done   |
| 1.0.4 | Set up ESLint + Prettier                                             | Done   |
| 1.0.5 | Set up GitHub Actions workflow                                       | Done   |
| 1.0.6 | Create test/fixtures/simple-project/ with sample .ts files           | Done   |
| 1.0.7 | Initialize fixture as git repo with sample commits                   | Done   |
| 1.0.8 | Scaffold CLI with `pith extract <path>` command                      | Done   |
| 1.0.9 | Set up MangoDB connection helper                                     | Done   |

### 1.1 AST Extraction - COMPLETE

| Step   | Data                 | Status |
| ------ | -------------------- | ------ |
| 1.1.1  | File discovery       | Done   |
| 1.1.2  | File path (A1)       | Done   |
| 1.1.3  | Line count (A2)      | Done   |
| 1.1.4  | Imports (A3)         | Done   |
| 1.1.5  | Exports (A4)         | Done   |
| 1.1.6  | Functions basic (A5) | Done   |
| 1.1.7  | Classes basic (A6)   | Done   |
| 1.1.8  | Interfaces (A7)      | Done   |
| 1.1.9  | Function params (A8) | Done   |
| 1.1.10 | Return types (A9)    | Done   |
| 1.1.11 | Async markers (A10)  | Done   |
| 1.1.12 | Store AST in MangoDB | Done   |

### 1.2 Git Extraction - COMPLETE

| Step  | Data                | Status |
| ----- | ------------------- | ------ |
| 1.2.1 | Commit count (G1)   | Done   |
| 1.2.2 | Last modified (G2)  | Done   |
| 1.2.3 | Created date (G3)   | Done   |
| 1.2.4 | Authors (G4)        | Done   |
| 1.2.5 | Recent commits (G5) | Done   |
| 1.2.6 | Primary author (G6) | Done   |
| 1.2.7 | Store Git data      | Done   |

### 1.3 Documentation Extraction - COMPLETE

| Step  | Data                 | Status |
| ----- | -------------------- | ------ |
| 1.3.1 | JSDoc (D1)           | Done   |
| 1.3.2 | Inline comments (D2) | Done   |
| 1.3.3 | README (D3)          | Done   |
| 1.3.4 | TODO comments (D4)   | Done   |
| 1.3.5 | Deprecations (D5)    | Done   |
| 1.3.6 | Store Docs           | Done   |

### 1.4 CLI Integration - COMPLETE

| Step  | Status                                    |
| ----- | ----------------------------------------- | ---- |
| 1.4.1 | `pith extract ./path` runs all extractors | Done |
| 1.4.2 | Handles missing path gracefully           | Done |
| 1.4.3 | Handles parse errors gracefully           | Done |
| 1.4.4 | Shows progress                            | Done |

**Phase 1 Exit Criteria**: All met

- [x] All extraction tests pass
- [x] `pith extract ./project` populates MangoDB
- [x] Can query functions, imports from extracted collection

---

## Phase 2: Node Graph - COMPLETE

### 2.1 File Nodes - COMPLETE

| Step         | Status                      |
| ------------ | --------------------------- | ---- |
| 2.1.1-2.1.13 | All file node tests passing | Done |

### 2.2 Function Nodes - COMPLETE

| Step        | Status                          |
| ----------- | ------------------------------- | ---- |
| 2.2.1-2.2.6 | All function node tests passing | Done |

### 2.3 Module Nodes - COMPLETE

| Step        | Status                        |
| ----------- | ----------------------------- | ---- |
| 2.3.1-2.3.5 | All module node tests passing | Done |

### 2.4 Edges - COMPLETE

| Step        | Status                 |
| ----------- | ---------------------- | ---- |
| 2.4.1-2.4.5 | All edge tests passing | Done |

### 2.5 Computed Metadata - COMPLETE

| Step  | Data         | Status |
| ----- | ------------ | ------ |
| 2.5.1 | Fan-in (C1)  | Done   |
| 2.5.2 | Fan-out (C2) | Done   |
| 2.5.3 | Age (C3)     | Done   |
| 2.5.4 | Recency (C4) | Done   |
| 2.5.5 | Update nodes | Done   |

### 2.6 CLI Integration - COMPLETE

| Step  | Status                         |
| ----- | ------------------------------ | ---- |
| 2.6.1 | `pith build` creates all nodes | Done |
| 2.6.2 | Build requires extract first   | Done |
| 2.6.3 | Shows progress                 | Done |

**Phase 2 Exit Criteria**: All met

- [x] All builder tests pass
- [x] `pith build` populates MangoDB `nodes` collection
- [x] Can traverse: module -> files -> functions
- [x] Can query by fan-in

---

## Phase 3: Prose Generation - COMPLETE

### Implementation - COMPLETE

| Component                                      | Status |
| ---------------------------------------------- | ------ |
| LLM integration (OpenRouter)                   | Done   |
| `buildPrompt()` creates correct prompt         | Done   |
| `parseLLMResponse()` extracts structured prose | Done   |
| Rate limiting and error handling               | Done   |
| Staleness detection                            | Done   |

### CLI Integration - COMPLETE

| Step                                 | Status |
| ------------------------------------ | ------ |
| `pith generate` command              | Done   |
| Iterates through nodes without prose | Done   |
| Stores prose on nodes                | Done   |
| --model option support               | Done   |

**Phase 3 Exit Criteria**: All met

- [x] All generator tests pass (with mocked LLM)
- [x] `pith generate` updates nodes with prose
- [x] Each node has summary, purpose, and gotchas

### Phase 3 Validation Notes

- Cannot fully validate LLM output quality in sandbox environment
- Mock tests verify prompt structure and response parsing
- Real LLM integration requires API key (now configured in .env)

---

## Phase 4: API Server - COMPLETE

### Implementation - COMPLETE

| Component                      | Status |
| ------------------------------ | ------ |
| Express server (`pith serve`)  | Done   |
| `GET /node/:path` endpoint     | Done   |
| `GET /context?files=` endpoint | Done   |
| `POST /refresh` endpoint       | Done   |
| Context bundling               | Done   |
| Markdown formatting            | Done   |

### Tests - COMPLETE

| Test                                    | Status |
| --------------------------------------- | ------ |
| GET /node/:path returns node data       | Done   |
| GET /node/:path returns 404 for missing | Done   |
| GET /context returns bundled markdown   | Done   |
| GET /context supports multiple files    | Done   |
| GET /context?format=json returns JSON   | Done   |
| GET /context returns 400 when no files  | Done   |
| POST /refresh requires projectPath      | Done   |
| POST /refresh validates path            | Done   |

**Phase 4 Exit Criteria**: All met

- [x] All API tests pass
- [x] Can fetch node data via HTTP
- [x] Context endpoint returns useful bundled information

---

## Phase 4 Manual Validation - COMPLETE

### Validation Checklist

- [x] Inject `/context` output into Claude Code task description
- [x] Does the context actually help the LLM understand the code?
- [x] Is the bundled context the right size? (Not too much, not too little)
- [x] Is the markdown format readable?

### Validation Results (2025-12-29)

**Tested by dogfooding**: Ran Pith on itself (22 TypeScript files)

**Extraction validation**:

- `pith extract .` successfully extracted 22 files
- All .ts files discovered correctly
- Git history complete for all files

**Build validation**:

- `pith build` created 22 file nodes, 42 function nodes, 8 module nodes
- Edges correctly established between files and modules

**API validation**:

- `GET /node/src/extractor/ast.ts` returns comprehensive node data:
  - Full metadata (lines, commits, lastModified, createdAt, authors)
  - Computed metadata (fanIn: 7, fanOut: 2, ageInDays, recencyInDays)
  - All edges (contains, imports, parent relationships)
  - Raw data (signatures, jsdoc, imports, exports, recentCommits)

- `GET /context?files=src/extractor/ast.ts,src/builder/index.ts` returns:
  - 7 bundled nodes (requested + imports + parent modules)
  - Well-formatted markdown with headers and code blocks
  - Full function signatures included
  - Import relationships clearly shown
  - Depth tracking works correctly

**Context quality assessment**:

- Markdown format is clean and readable
- Function signatures provide quick understanding
- Import relationships help understand dependencies
- Parent modules provide context hierarchy
- Output size is appropriate (not overwhelming)

**Issues found**: None blocking. The system works as designed.

---

## Phase 5: Polish - COMPLETE

### 5.1 Configuration - COMPLETE

| Feature                        | Status |
| ------------------------------ | ------ |
| `pith.config.json` support     | Done   |
| Include/exclude patterns       | Done   |
| LLM provider/model selection   | Done   |
| Environment variable fallbacks | Done   |

**New files**: `src/config/index.ts`, `src/config/index.test.ts`

### 5.2 Performance - COMPLETE

| Feature                                          | Status |
| ------------------------------------------------ | ------ |
| Incremental extraction (file hashing)            | Done   |
| Parallel file parsing (batch of 4)               | Done   |
| Extraction cache (`.pith/extraction-cache.json`) | Done   |
| `--force` flag to bypass cache                   | Done   |

**New files**: `src/extractor/cache.ts`, `src/extractor/cache.test.ts`

### 5.3 CLI Improvements - COMPLETE

| Feature                        | Status |
| ------------------------------ | ------ |
| `--verbose, -v` flag           | Done   |
| `--quiet, -q` flag             | Done   |
| `--dry-run` mode               | Done   |
| Elapsed time display           | Done   |
| Cost estimation (`--estimate`) | Done   |

### 5.4 Error Handling - COMPLETE

| Feature                                    | Status |
| ------------------------------------------ | ------ |
| PithError class with severity levels       | Done   |
| Error codes (PARSE_ERROR, LLM_ERROR, etc.) | Done   |
| LLM retry with exponential backoff         | Done   |
| Clear error messages with suggestions      | Done   |
| Error grouping in summaries                | Done   |

**New files**: `src/errors/index.ts`, `src/errors/index.test.ts`

**Phase 5 Exit Criteria**: All met

- [x] Configuration file support works
- [x] Incremental extraction skips unchanged files
- [x] CLI has verbose/quiet/dry-run modes
- [x] Errors are handled gracefully with retries

---

## Test Summary

As of 2026-01-02 (Phase 7.3 Complete):

- **Total tests**: 616
- **All passing**: Yes
- **Lint**: Clean
- **Test suites**: 155

Commands:

```bash
npm test      # 616 tests pass
npm run lint  # No errors
```

---

## MVP Feature Summary

### CLI Commands

```bash
pith extract <path> [--force] [--verbose] [--quiet] [--dry-run]
pith build [--verbose] [--quiet] [--dry-run]
pith generate [--model <model>] [--estimate] [--verbose] [--quiet] [--dry-run]
pith serve [--port <port>]
```

### API Endpoints

- `GET /node/:path` - Fetch single node
- `GET /context?files=a,b,c` - Bundled context for LLM injection
- `GET /impact/:path` - Change impact analysis (Phase 6.6.5)
- `GET /consumers/:file/:function` - Function consumer tracking (Phase 6.9.2)
- `POST /query` - Natural language query endpoint (Phase 7)
- `POST /refresh` - Re-extract and rebuild

### Key Features

- TypeScript AST extraction (functions, classes, interfaces, imports, exports)
- Git history extraction (commits, authors, dates)
- Documentation extraction (JSDoc, comments, TODOs, deprecations)
- Node graph with edges (imports, contains, parent, importedBy, testFile)
- Computed metadata (fan-in, fan-out, age, recency)
- Change impact analysis with transitive dependents (Phase 6.6.5)
- LLM prose generation with OpenRouter
- Incremental extraction with file hashing
- Parallel processing for performance
- Configuration via `pith.config.json`
- Comprehensive error handling with retries

---

## Notes

### Environment Setup

- `.env` file with OPENROUTER_API_KEY and OPENROUTER_MODEL
- Using `qwen/qwen-turbo` as default model

### Dependencies

- All npm dependencies installed
- Node.js v22.x required for experimental-strip-types

### Architecture

See `docs/ARCHITECTURE.md` for system design and data flow.
