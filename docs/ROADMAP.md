# Roadmap

## Current Status

| Phase       | Status          | Description                                                                                            |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5         | ✅ Complete     | MVP: Extraction, Build, Generate, API, Polish                                                          |
| 6.1-6.5     | ✅ Complete     | On-demand generation, test files, modification impact, patterns, gotcha validation                     |
| 6.6.1-6.6.8 | ✅ Complete     | Line numbers, code snippets, key statements, change impact, patterns, call graphs, error paths         |
| 6.7.1-6.7.5 | ✅ Complete     | Enhanced output: consumer locations, modification guides, call flow, debugging hints, pattern evidence |
| 6.8.0       | ✅ Complete     | Fixed fuzzy matching regression                                                                        |
| 6.8.1-6.8.4 | ✅ Complete     | Deterministic Gap Closure: symbol tracking, content preservation, config extraction, debugging output  |
| **6.9**     | **⬅️ CURRENT**  | **Response Optimization: targeting, function consumers, debugging prose, query routing**               |
| 7           | Planned         | Query Planner: LLM-driven file selection with codebase context                                         |
| 10          | Planned         | MCP Server integration                                                                                 |
| 8-9, 11     | Planned         | Advanced relationships, intelligence, scale                                                            |

**Latest benchmark** (2025-12-31 v4, 15 tasks): Pith 17.8/25 (71%) vs Control 24.0/25 (96%). Gap: 6.2 points.

- Win rate: 0 wins, 14 losses, **1 tie** (R1: WikiNode Impact)
- Improvement from v3: +6% overall, gap narrowed by 2 points
- See [2025-12-31-self-test-v4.md](benchmark-results/2025-12-31-self-test-v4.md) for full results.

**Remaining gaps** (from v4 analysis):
- **Efficiency**: 2.1/5 (worst criterion) - returns full files instead of targeted sections
- **Debugging (D1-D3)**: 16.3/25 - prose lacks debugging-specific insights
- **Modification (M1-M3)**: 16.7/25 - missing step-by-step implementation guides
- **R3 (extractFile consumers)**: 13/25 - file-level tracking, not function-level

**Benchmark History**:
| Run | Pith Score | Gap | Notes |
|-----|------------|-----|-------|
| v7 (2025-12-30) | 65% | -7.6 | Baseline |
| v1 (2025-12-31) | 78% | -3.5 | Before fuzzy matching bug |
| v3 (2025-12-31) | 65% | -8.2 | Fuzzy matching regression |
| **v4 (2025-12-31)** | **71%** | **-6.2** | **Current - post-fixes** |

---

## Completed Phases (1-5)

Phased build plan from zero to useful. Each phase follows TDD: write failing tests first, then implement.

## Phase 1: Foundation

**Goal**: Extract facts from a TypeScript codebase and store structured data.

See [EXTRACTION.md](EXTRACTION.md) for complete data definitions and types.

### 1.0 Project Setup

Complete these before any extraction work:

| Step  | Test                  | Implementation                                                       |
| ----- | --------------------- | -------------------------------------------------------------------- |
| 1.0.1 | -                     | Initialize TypeScript project with ESM, strict mode                  |
| 1.0.2 | -                     | Add dependencies: ts-morph, simple-git, commander, @jkershaw/mangodb |
| 1.0.3 | `node --test` runs    | Configure Node test runner                                           |
| 1.0.4 | `npm run lint` passes | Set up ESLint + Prettier                                             |
| 1.0.5 | CI passes on push     | Set up GitHub Actions workflow                                       |
| 1.0.6 | -                     | Create `test/fixtures/simple-project/` with sample .ts files         |
| 1.0.7 | -                     | Initialize fixture as git repo with sample commits                   |
| 1.0.8 | CLI shows help        | Scaffold CLI with `pith extract <path>` command                      |
| 1.0.9 | Can connect/query     | Set up MangoDB connection helper                                     |

**GitHub Actions workflow** (`.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

### 1.1 AST Extraction

One data point at a time. Each row = one test + one implementation.

| Step   | Data                 | Test                                           | Implementation                   |
| ------ | -------------------- | ---------------------------------------------- | -------------------------------- |
| 1.1.1  | File discovery       | `findFiles()` returns all .ts paths in fixture | Glob for .ts files               |
| 1.1.2  | File path (A1)       | `extractFile()` returns correct path           | Store relative path              |
| 1.1.3  | Line count (A2)      | Returns correct line count                     | Count newlines                   |
| 1.1.4  | Imports (A3)         | Returns import list with `from` and `names`    | Parse ImportDeclaration          |
| 1.1.5  | Exports (A4)         | Returns export list with `name` and `kind`     | Parse ExportDeclaration          |
| 1.1.6  | Functions basic (A5) | Returns function name and signature            | Parse FunctionDeclaration        |
| 1.1.7  | Classes basic (A6)   | Returns class name and method names            | Parse ClassDeclaration           |
| 1.1.8  | Interfaces (A7)      | Returns interface names and properties         | Parse InterfaceDeclaration       |
| 1.1.9  | Function params (A8) | Returns parameter names and types              | Extract from signature           |
| 1.1.10 | Return types (A9)    | Returns function return types                  | Extract from signature           |
| 1.1.11 | Async markers (A10)  | Correctly identifies async functions           | Check async modifier             |
| 1.1.12 | Store AST            | Data persists in MangoDB                       | Insert to `extracted` collection |

**Checkpoint**: `pith extract ./fixture` stores all AST data. Can query functions, imports.

### 1.2 Git Extraction

| Step  | Data                | Test                                   | Implementation            |
| ----- | ------------------- | -------------------------------------- | ------------------------- |
| 1.2.1 | Commit count (G1)   | Returns correct count for fixture file | `git log --follow`        |
| 1.2.2 | Last modified (G2)  | Returns correct date                   | Parse most recent commit  |
| 1.2.3 | Created date (G3)   | Returns date of first commit           | `git log --diff-filter=A` |
| 1.2.4 | Authors (G4)        | Returns unique author list             | Collect from commits      |
| 1.2.5 | Recent commits (G5) | Returns last 5 commit messages         | `git log -n 5`            |
| 1.2.6 | Primary author (G6) | Returns author with most commits       | Count and sort            |
| 1.2.7 | Store Git           | Git data persists in MangoDB           | Update `extracted` docs   |

**Checkpoint**: Each extracted file has complete git metadata.

### 1.3 Documentation Extraction

| Step  | Data                 | Test                                   | Implementation          |
| ----- | -------------------- | -------------------------------------- | ----------------------- |
| 1.3.1 | JSDoc (D1)           | Extracts description, @param, @returns | Parse JSDoc comments    |
| 1.3.2 | Inline comments (D2) | Extracts comments near functions       | Find comment nodes      |
| 1.3.3 | README (D3)          | Extracts README.md per directory       | Read file if exists     |
| 1.3.4 | TODO comments (D4)   | Finds TODO/FIXME with line numbers     | Regex scan              |
| 1.3.5 | Deprecations (D5)    | Extracts @deprecated messages          | Parse JSDoc tag         |
| 1.3.6 | Store Docs           | Doc data persists in MangoDB           | Update `extracted` docs |

**Checkpoint**: Full extraction complete. All data queryable.

### 1.4 CLI Integration

| Step  | Test                                      | Implementation            |
| ----- | ----------------------------------------- | ------------------------- |
| 1.4.1 | `pith extract ./path` runs all extractors | Wire up CLI to extractors |
| 1.4.2 | Handles missing path gracefully           | Error handling            |
| 1.4.3 | Handles parse errors gracefully           | Try/catch per file        |
| 1.4.4 | Shows progress                            | Console output            |

### Phase 1 Exit Criteria

- [ ] All 30+ extraction tests pass
- [ ] `pith extract ./project` populates MangoDB
- [ ] Can query: `db.collection('extracted').find({ 'functions.name': 'login' })`
- [ ] Fixture project fully extracted with all data points

### Phase 1 Manual Validation

Run extraction on a real public TypeScript repo and review:

- [ ] Are all .ts files discovered?
- [ ] Are imports correctly parsed (named, default, type-only)?
- [ ] Is git history complete (check a file with known commit count)?
- [ ] Are JSDoc comments captured accurately?
- [ ] Any parse failures? Why?

---

## Phase 2: Node Graph

**Goal**: Transform raw extraction into navigable nodes with edges.

### 2.1 File Nodes

| Step   | Test                                        | Implementation                             |
| ------ | ------------------------------------------- | ------------------------------------------ |
| 2.1.1  | `buildFileNode()` returns correct structure | Create basic file node from extracted data |
| 2.1.2  | Node has correct `id` (path-based)          | Generate deterministic ID                  |
| 2.1.3  | Node has correct `name` (basename)          | Extract filename                           |
| 2.1.4  | Node has `metadata.lines`                   | Copy from extracted                        |
| 2.1.5  | Node has `metadata.commits`                 | Copy from git data                         |
| 2.1.6  | Node has `metadata.lastModified`            | Copy from git data                         |
| 2.1.7  | Node has `metadata.authors`                 | Copy from git data                         |
| 2.1.8  | Node has `raw.signature`                    | Copy function signatures                   |
| 2.1.9  | Node has `raw.jsdoc`                        | Copy JSDoc                                 |
| 2.1.10 | Node has `raw.imports`                      | Copy import list                           |
| 2.1.11 | Node has `raw.exports`                      | Copy export list                           |
| 2.1.12 | Node has `raw.recentCommits`                | Copy recent commits                        |
| 2.1.13 | Store file nodes                            | Insert to `nodes` collection               |

**Checkpoint**: All files have nodes with complete metadata and raw data.

### 2.2 Function Nodes

| Step  | Test                                                             | Implementation               |
| ----- | ---------------------------------------------------------------- | ---------------------------- |
| 2.2.1 | `shouldCreateFunctionNode()` returns true for exported functions | Heuristic check              |
| 2.2.2 | `buildFunctionNode()` returns correct structure                  | Create function node         |
| 2.2.3 | Node has correct `id` (file:function)                            | Generate ID                  |
| 2.2.4 | Node has `raw.signature`                                         | Copy signature               |
| 2.2.5 | Node has `raw.jsdoc`                                             | Copy function's JSDoc        |
| 2.2.6 | Store function nodes                                             | Insert to `nodes` collection |

### 2.3 Module Nodes

| Step  | Test                                                   | Implementation               |
| ----- | ------------------------------------------------------ | ---------------------------- |
| 2.3.1 | `shouldCreateModuleNode()` true for dirs with index.ts | Heuristic check              |
| 2.3.2 | `shouldCreateModuleNode()` true for dirs with 3+ files | Heuristic check              |
| 2.3.3 | `buildModuleNode()` returns correct structure          | Create module node           |
| 2.3.4 | Node has `raw.readme`                                  | Copy README if exists        |
| 2.3.5 | Store module nodes                                     | Insert to `nodes` collection |

### 2.4 Edges

| Step  | Test                             | Implementation                      |
| ----- | -------------------------------- | ----------------------------------- |
| 2.4.1 | `contains` edge: module → file   | Create edge for each file in module |
| 2.4.2 | `contains` edge: file → function | Create edge for each function node  |
| 2.4.3 | `imports` edge: file → file      | Create edge for each import         |
| 2.4.4 | `parent` edge: file → module     | Reverse of contains                 |
| 2.4.5 | Edges stored on nodes            | Add to `edges` array                |

### 2.5 Computed Metadata

| Step  | Data         | Test                              | Implementation                       |
| ----- | ------------ | --------------------------------- | ------------------------------------ |
| 2.5.1 | Fan-in (C1)  | Correct count of incoming imports | Count `imports` edges targeting node |
| 2.5.2 | Fan-out (C2) | Correct count of outgoing imports | Count node's import edges            |
| 2.5.3 | Age (C3)     | Correct days since creation       | Calculate from createdAt             |
| 2.5.4 | Recency (C4) | Correct days since last change    | Calculate from lastModified          |
| 2.5.5 | Update nodes | Computed data persists            | Update nodes in collection           |

### 2.6 CLI Integration

| Step  | Test                           | Implementation              |
| ----- | ------------------------------ | --------------------------- |
| 2.6.1 | `pith build` creates all nodes | Wire up CLI                 |
| 2.6.2 | Build requires extract first   | Check extracted data exists |
| 2.6.3 | Shows progress                 | Console output              |

### Phase 2 Exit Criteria

- [ ] All 25+ builder tests pass
- [ ] `pith build` populates MangoDB `nodes` collection
- [ ] Can traverse: module → files → functions
- [ ] Can query by fan-in: `nodes.find({ 'metadata.fanIn': { $gt: 5 } })`

### Phase 2 Manual Validation

Run build on the same real repo and review:

- [ ] Do module boundaries match intuition? (e.g., src/auth/ is one module)
- [ ] Are high fan-in files actually important? (utilities, shared types)
- [ ] Are edges correct? (spot-check a few import relationships)
- [ ] Do function nodes exist for the right functions?

---

## Phase 3: Prose Generation

**Goal**: Generate human-readable prose using an LLM.

### Deliverables

1. **LLM integration**
   - Tests first: `buildPrompt()` creates correct prompt from node data
   - Tests first: `parseLLMResponse()` extracts structured prose
   - Anthropic Claude API client
   - Prompt templates for summary/purpose/gotchas
   - Rate limiting and error handling

2. **Prose generator** (`pith generate`)
   - Tests first: `generateProse()` updates node with prose (mock LLM)
   - Iterate through nodes without prose
   - Send context (signature, comments, commits) to LLM
   - Parse and store prose on nodes
   - Track generation timestamp

3. **Fractal generation**
   - Tests first: module prose includes child summaries
   - Generate file prose first
   - Use file summaries to generate module prose
   - Handle missing/partial data gracefully

4. **Staleness detection**
   - Tests first: `isStale()` correctly compares timestamps
   - Compare file mtime to prose generation time
   - Flag stale prose
   - Support `--force` to regenerate all

### Phase 3 Exit Criteria

- [ ] All generator tests pass (with mocked LLM for unit tests)
- [ ] Running `pith generate` updates nodes in MangoDB with prose
- [ ] Each node has summary, purpose, and gotchas

### Phase 3 Manual Validation

Generate prose for the real repo and review quality:

- [ ] Are summaries accurate and concise?
- [ ] Does "purpose" explain _why_, not just _what_?
- [ ] Are gotchas actionable? (Not generic warnings)
- [ ] Do module summaries coherently describe their children?
- [ ] Is anything misleading or wrong?

---

## Phase 4: API

**Goal**: Serve nodes via HTTP for LLM consumption.

### Deliverables

1. **Express server** (`pith serve`)
   - Tests first: API routes return correct responses
   - Query nodes from MangoDB
   - Serve on configurable port

2. **Endpoints**
   - Tests first: each endpoint with fixture data
   - `GET /node/:path` - Single node with all data
   - `GET /context?files=a,b,c` - Bundled context
   - `POST /refresh` - Re-run extract + build

3. **Context bundling**
   - Tests first: `bundleContext()` includes correct related nodes
   - Include requested nodes
   - Include immediate imports/exports
   - Include parent module
   - Format for LLM consumption (markdown)

4. **Refresh flow**
   - Re-extract on demand
   - Rebuild node graph
   - Mark affected prose as stale

### Phase 4 Exit Criteria

- [ ] All API tests pass
- [ ] Can fetch node data via HTTP
- [ ] Context endpoint returns useful bundled information

### Phase 4 Manual Validation

Use the API in a real LLM workflow:

- [ ] Inject `/context` output into Claude Code task description
- [ ] Does the context actually help the LLM understand the code?
- [ ] Is the bundled context the right size? (Not too much, not too little)
- [ ] Is the markdown format readable?

---

## Phase 5: Polish

**Goal**: Make it actually usable on real codebases.

### Deliverables

1. **Configuration**
   - `pith.config.json` for includes/excludes
   - LLM provider/model selection
   - Custom complexity thresholds

2. **Performance**
   - Incremental extraction (only changed files)
   - Parallel file parsing
   - Efficient JSON streaming for large codebases

3. **CLI improvements**
   - Progress indicators
   - Dry-run mode
   - Verbose/quiet modes
   - Cost estimation for prose generation

4. **Error handling**
   - Graceful handling of parse errors
   - LLM timeout/retry logic
   - Clear error messages

### Exit Criteria

Works smoothly on a 100+ file codebase. Clear feedback during operations.

---

## Current & Future Phases

### Phase 6: On-Demand Generation & Task-Oriented Context ✅ COMPLETE

**Goal**: Make output more useful for LLM task context, reduce upfront costs.

Based on testing (see `docs/testing-plan.md`), the current output scores 3.3-4/5 vs control agent's 5/5. Key gaps:

- Lacks specificity (function names, line numbers)
- Gotchas can contain factual errors (LLM hallucination)
- Missing task-oriented context (test files, patterns, modification impact)

| Feature                              | Impact | Effort | Priority |
| ------------------------------------ | ------ | ------ | -------- |
| **On-demand prose generation**       | HIGH   | Medium | 1        |
| **Test file mapping**                | HIGH   | Low    | 2        |
| **Modification impact**              | HIGH   | Low    | 3        |
| **Pattern examples (code snippets)** | HIGH   | Medium | 4        |
| **Gotcha validation**                | HIGH   | High   | 5        |

#### 6.1 On-Demand Prose Generation

Current: `extract → build → generate ALL → serve` (slow, expensive upfront)
Target: `extract → build → serve` (instant), generate prose on first API request

| Step  | Implementation                                                 |
| ----- | -------------------------------------------------------------- |
| 6.1.1 | Modify `/node/:path` to check for prose, generate if missing   |
| 6.1.2 | Add `generateProseForNode()` function (single node, not batch) |
| 6.1.3 | Cache generated prose in DB (already exists)                   |
| 6.1.4 | Add `--lazy` flag to `pith serve` (default behavior)           |
| 6.1.5 | Keep `pith generate` for batch pre-generation                  |
| 6.1.6 | Add `/node/:path?prose=false` option to skip generation        |

#### 6.2 Test File Mapping

Add relationship between source files and their tests.

| Step  | Implementation                                                        |
| ----- | --------------------------------------------------------------------- |
| 6.2.1 | Detect test files by pattern (`*.test.ts`, `*.spec.ts`, `__tests__/`) |
| 6.2.2 | Add `testFile` edge type: `src/foo.ts → src/foo.test.ts`              |
| 6.2.3 | Include test file in `/context` bundle                                |
| 6.2.4 | Add `testCommand` to node metadata (infer from package.json)          |

#### 6.3 Modification Impact

Show "what breaks if I change this".

| Step  | Implementation                                                   |
| ----- | ---------------------------------------------------------------- |
| 6.3.1 | Add `dependents` field (reverse of imports) - already have fanIn |
| 6.3.2 | List dependent file paths in context output                      |
| 6.3.3 | Add warning if fanIn > 5 ("widely used, be careful")             |

#### 6.4 Pattern Examples

Include actual code snippets showing patterns.

| Step  | Implementation                                                |
| ----- | ------------------------------------------------------------- |
| 6.4.1 | In module prose, include "Quick Start" section                |
| 6.4.2 | LLM prompt asks for example pattern from actual code          |
| 6.4.3 | Include similar file references ("follows same pattern as X") |

#### 6.5 Gotcha Validation

Cross-check LLM claims against code to reduce hallucinations.

| Step  | Implementation                                   |
| ----- | ------------------------------------------------ |
| 6.5.1 | After LLM generates gotchas, validate claims     |
| 6.5.2 | Check if mentioned function/variable names exist |
| 6.5.3 | Flag unverifiable claims with low confidence     |
| 6.5.4 | Re-prompt if critical claims don't validate      |

---

#### Phase 6.6: Enhanced Deterministic Extraction ⬅️ IN PROGRESS

**Goal**: Close information gaps identified in benchmarking by extracting more facts deterministically, reducing LLM's role to synthesis only.

**Context**: Benchmark run (2025-12-30) showed Pith scoring 12.6/25 vs Control's 24.2/25. Key gaps:

- Missing line numbers (Critical)
- Missing code snippets (Critical)
- Missing implementation details like retry counts, timeout values (High)
- Vague gotchas without specifics (High)

See `docs/benchmark-results/2025-12-30-self-test.md` for benchmark results and `docs/benchmark-results/2025-12-30-deterministic-analysis.md` for technical analysis.

**Principle**: Extract facts with code, synthesize with LLM.

##### 6.6.1 Surface Existing Data (P0)

Data already in ts-morph but not included in output.

| Step    | What                 | Implementation                                     | Benchmark After |
| ------- | -------------------- | -------------------------------------------------- | --------------- |
| 6.6.1.1 | Line numbers         | Add `startLine`, `endLine` to function/class nodes | ✓               |
| 6.6.1.2 | Code snippets        | Add `sourceCode` field (first 20 lines) to nodes   | ✓               |
| 6.6.1.3 | Default param values | Extract from `param.getInitializer()`              |                 |
| 6.6.1.4 | Return types         | Add explicit return type to signatures             |                 |

**Benchmark checkpoint**: Re-run benchmark, expect Completeness to improve.

##### 6.6.2 Pattern Detection (P1)

Detect common patterns via AST analysis.

| Step    | Pattern        | Detection Method                              | Output                                        |
| ------- | -------------- | --------------------------------------------- | --------------------------------------------- |
| 6.6.2.1 | Retry logic    | Find loops containing try/catch + sleep       | `{ maxRetries, backoffType, backoffFormula }` |
| 6.6.2.2 | Error handling | Parse catch clauses, find status checks       | `{ catches, throws, statusCodes }`            |
| 6.6.2.3 | Timeout config | Find AbortController, setTimeout patterns     | `{ timeout, configurable }`                   |
| 6.6.2.4 | Config values  | Find const declarations with numeric literals | `{ name, value, line }`                       |

**Benchmark checkpoint**: Re-run Task 2 (error handling), expect score to improve significantly.

##### 6.6.3 Enhanced Metadata (P2)

Additional computed metrics.

| Step    | Metric                     | Implementation                      |
| ------- | -------------------------- | ----------------------------------- |
| 6.6.3.1 | Cyclomatic complexity      | Count branches, loops, conditionals |
| 6.6.3.2 | Lines of code per function | From AST line numbers               |
| 6.6.3.3 | Call graph (intra-file)    | Track function calls within file    |

##### 6.6.4 Feed Facts to LLM ✅ COMPLETE

Update prose prompts to include deterministic facts, so LLM synthesizes rather than discovers.

| Step    | Change                                      | Status |
| ------- | ------------------------------------------- | ------ |
| 6.6.4.1 | Include detected patterns in prompt         | Done   |
| 6.6.4.2 | Include line numbers for key functions      | Done   |
| 6.6.4.3 | Include config values found                 | Done   |
| 6.6.4.4 | Ask LLM to explain/synthesize, not discover | Done   |

---

##### 6.6.5 Change Impact Analysis ⬅️ PRIORITY

**Problem**: Modification tasks (M1-M3) average 13/25. Control maps all affected files with line references.

**Benchmark Evidence**:

- M1 (Add complexity field): Control listed 8 files, 60+ test fixtures, specific lines
- Pith showed only interface location

| Step    | What                                                               | Test                                            |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| 6.6.5.1 | Traverse `importedBy` edges recursively to build full impact tree  | Impact tree includes transitive dependents      |
| 6.6.5.2 | For each affected file, identify functions that use changed entity | List specific function names using the entity   |
| 6.6.5.3 | Add "Change Impact" section to `/context` markdown output          | Shows N files, N functions, test files affected |
| 6.6.5.4 | Include test file impact (which tests touch this code)             | Test files listed with relevant test names      |

**Benchmark checkpoint**: Re-run M1 task, expect Actionability to improve 1→4.

##### 6.6.6 Design Pattern Recognition

**Problem**: A3 (Design Patterns) scored 13/25. Control identified 18 patterns, Pith identified 0.

**Benchmark Evidence**:

- Control found: Pipeline, Singleton, Factory, Strategy, Builder, Retry+Backoff, Cache, etc.
- Pith mentioned no patterns by name

**Depends on**: 6.6.7a (intra-file call graph) for accurate pattern detection

**Approach**: Start conservatively with high-confidence patterns, add validation to reduce false positives.

| Step    | What                                   | Detection Method                                         | Confidence |
| ------- | -------------------------------------- | -------------------------------------------------------- | ---------- |
| 6.6.6.1 | Detect Retry pattern                   | Loop containing try/catch + exponential delay (Math.pow) | High       |
| 6.6.6.2 | Detect Cache pattern                   | Module with Map/Object + get/set/has functions           | High       |
| 6.6.6.3 | Detect Builder pattern                 | Class/functions with chained methods returning `this`    | Medium     |
| 6.6.6.4 | Detect Singleton pattern               | Module-level `let x = null` + getter checking null       | Medium     |
| 6.6.6.5 | Validate detected patterns             | Cross-check with AST evidence before reporting           | Required   |
| 6.6.6.6 | Add "Patterns" section to prose prompt | LLM confirms/refines detected patterns with evidence     | -          |

**Note**: Pipeline, Factory, Strategy, Command patterns require call graph (6.6.7) - defer to 6.6.6b.

**Benchmark checkpoint**: Re-run A3 task, expect Completeness to improve 1→3 (conservative start).

##### 6.6.7 Cross-File Tracing

**Problem**: Behavior tasks (B1-B3) average 16/25. Control traces complete call chains across files.

**Benchmark Evidence**:

- B2 (buildPrompt): Control traced dispatcher→buildFilePrompt→formatFunctionForPrompt→formatKeyStatements
- Pith only listed function names without showing flow

**Complexity note**: Full cross-file tracing requires symbol resolution, handling re-exports, and dynamic calls. Decompose into phases.

###### 6.6.7a Intra-File Call Graph (Simpler)

| Step     | What                                     | Output                               |
| -------- | ---------------------------------------- | ------------------------------------ |
| 6.6.7a.1 | Track function calls within same file    | Map: `function → [called functions]` |
| 6.6.7a.2 | Identify call chains (A→B→C) within file | Ordered call sequences               |
| 6.6.7a.3 | Add "Calls" field to function nodes      | List of functions called             |
| 6.6.7a.4 | Add "Called by" field to function nodes  | Reverse lookup within file           |

**Enables**: 6.6.6 (pattern detection), 6.6.8 (error path tracing)

###### 6.6.7b Cross-File Call Graph (Complex)

**Depends on**: 6.6.7a complete

| Step     | What                                                           | Output                                      |
| -------- | -------------------------------------------------------------- | ------------------------------------------- |
| 6.6.7b.1 | Resolve imported symbols to source files                       | Map: `import X from './y'` → `y.ts:X`       |
| 6.6.7b.2 | Handle re-exports (`export { X } from './y'`)                  | Follow re-export chains                     |
| 6.6.7b.3 | Build cross-file call graph                                    | Map: `file:function → [file:function, ...]` |
| 6.6.7b.4 | Add "Call Flow" section for functions with >3 cross-file calls | Show traced path                            |

**Benchmark checkpoint**: After 6.6.7a, re-run B1 task, expect partial improvement. After 6.6.7b, expect Completeness 2→4.

##### 6.6.8 Error Path Analysis

**Problem**: Debugging tasks (D1-D3) average 15.3/25. Control identifies specific causes and paths.

**Benchmark Evidence**:

- D3 (404 debugging): Control found 13 distinct causes with line numbers
- Pith was generic: "API module handles requests"

**Depends on**: 6.6.7a (intra-file call graph) to trace error propagation through function calls

| Step    | What                                                     | Output                                          |
| ------- | -------------------------------------------------------- | ----------------------------------------------- |
| 6.6.8.1 | Find all early return/throw statements                   | Map: condition → exit location                  |
| 6.6.8.2 | Trace error propagation in catch blocks                  | Which errors are caught, re-thrown, transformed |
| 6.6.8.3 | Identify validation guards (if checks before main logic) | List conditions that reject input               |
| 6.6.8.4 | Add "Error Paths" section for functions with try/catch   | Show caught errors and their handling           |

**Benchmark checkpoint**: Re-run D3 task, expect Actionability to improve 1→4.

##### 6.6.9 Implementation Hints (P2 - Deferred)

**Problem**: M2 (Rate limiting), M3 (Python support) scored 13/25. Control provided step-by-step guides.

**Note**: This requires significant prompt engineering for each modification type. Defer until pattern recognition (6.6.6) is complete.

| Step    | What                                                          | When                 |
| ------- | ------------------------------------------------------------- | -------------------- |
| 6.6.9.1 | For "add middleware" modifications, identify insertion points | After 6.6.6 patterns |
| 6.6.9.2 | For "add field" modifications, list all type references       | After 6.6.5 impact   |
| 6.6.9.3 | Include similar modifications from git history                | After git analysis   |

---

##### Phase 6.6 Success Criteria (Updated)

| Metric        | Baseline | After P0 | Target | Gap  |
| ------------- | -------- | -------- | ------ | ---- |
| Relevance     | 2.4/5    | 3.0/5    | ≥4/5   | -1.0 |
| Completeness  | 1.8/5    | 1.8/5    | ≥4/5   | -2.2 |
| Accuracy      | 3.6/5    | 4.0/5    | ≥4.5/5 | -0.5 |
| Actionability | 1.8/5    | 1.8/5    | ≥4/5   | -2.2 |
| Overall score | 12.6/25  | 15.5/25  | ≥20/25 | -4.5 |

**P0 Impact Analysis**: Line numbers and code snippets improved Relevance (+0.6) and Accuracy (+0.4), but Completeness/Actionability require capabilities delivered by 6.6.5-6.6.8 (change impact, pattern recognition, cross-file tracing, error paths).

**Execution Order** (accounting for dependencies):

```text
6.6.5 Change Impact ─────────────────────────────────► Independent, start first

6.6.7a Intra-File Call Graph ──┬──► 6.6.6 Pattern Recognition
                               │
                               ├──► 6.6.8 Error Path Analysis
                               │
                               └──► 6.6.7b Cross-File Call Graph ──► 6.6.6b Advanced Patterns
```

| Phase | Task                       | Depends On   | Benchmark Target |
| ----- | -------------------------- | ------------ | ---------------- |
| 1     | 6.6.5 Change Impact        | None         | M1-M3: 13→18     |
| 2     | 6.6.7a Intra-File Calls    | None         | Enables 3-5      |
| 3     | 6.6.6 Pattern Recognition  | 6.6.7a       | A3: 13→18        |
| 4     | 6.6.8 Error Paths          | 6.6.7a       | D1-D3: 15→20     |
| 5     | 6.6.7b Cross-File Calls    | 6.6.7a       | B1-B3: 16→20     |
| 6     | 6.6.9 Implementation Hints | 6.6.5, 6.6.6 | M2-M3: 13→18     |

**Note**: Gaps overlap across tasks. Closing these 4-5 capabilities should move overall score from 15.5→20+.

---

#### Phase 6.7: Enhanced Output Integration ⬅️ PRIORITY

**Goal**: Surface extracted data more effectively in API output to close actionability and completeness gaps.

**Context**: v7 benchmark (2025-12-30) shows Phase 6.6 features are implemented but not fully utilized:

- Pith: 16.3/25 (65%) vs Control: 23.9/25 (96%)
- Worst gaps: Actionability (2.1/5), Completeness (2.3/5)
- Worst category: Modification tasks (14/25)

See `docs/benchmark-results/2025-12-30-self-test-v7.md` for full analysis.

##### 6.7.1 Consumer Location Specificity

**Problem**: M3 (Add complexity field) scored 16/25. Pith shows "10 files depend on this" but Control mapped 62+ specific usage locations with line numbers.

**Benchmark Evidence**:

- R1 (WikiNode impact): Control found "62+ property access locations"
- R3 (extractFile consumers): Control found "1 production consumer (cli:181) and 42 test consumers with specific line numbers"

| Step    | What                                                          | Test                                                          |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 6.7.1.1 | In `/impact` output, show usage line numbers per dependent    | Impact shows `src/api/index.ts:45 - uses WikiNode.metadata`   |
| 6.7.1.2 | Group usages by type (import, property access, function call) | Output groups: "Imports: 3, Property accesses: 42, Calls: 17" |
| 6.7.1.3 | For interfaces/types, find all property access sites          | Detects `node.metadata.fanIn` patterns in dependents          |

**Benchmark target**: R1, R3, M3 Actionability: 2/5 → 4/5

##### 6.7.2 Modification Guides

**Problem**: M1 (JS support), M2 (Rate limiting) scored 13/25. Control provided step-by-step implementation plans; Pith only showed file locations.

**Benchmark Evidence**:

- M1: Control "identified 7 specific locations requiring changes with implementation plan"
- M2: Control "provided complete implementation: middleware insertion point, route protection levels, code examples"

| Step    | What                                                                 | Test                                                                                             |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 6.7.2.1 | For high-fanIn types, include "Modification Checklist" in `/context` | Shows "To modify WikiNode: 1. Update interface at builder/index.ts:45, 2. Update consumers: ..." |
| 6.7.2.2 | Identify insertion points for middleware patterns                    | For Express apps, shows `app.use()` location for new middleware                                  |
| 6.7.2.3 | Include test update requirements in modification guides              | Shows "Tests to update: src/builder/index.test.ts (12 assertions reference WikiNode)"            |
| 6.7.2.4 | Add "Similar Changes" section from git history                       | If git shows prior interface changes, link to those commits                                      |

**Benchmark target**: M1-M3 Actionability: 1/5 → 4/5

##### 6.7.3 Enhanced Call Flow Presentation

**Problem**: B2 (buildPrompt) scored 16/25. Control traced "dispatcher→buildFilePrompt→formatFunctionForPrompt→formatKeyStatements"; Pith only listed function names.

**Benchmark Evidence**:

- B1: Control "explained complete SHA-256 logic with all line references"
- B3: Control provided "maxRetries=3, timeout=30000ms, exponential backoff formula, and all retryable error conditions with line references"

| Step    | What                                                           | Test                                                                      |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 6.7.3.1 | Add "Call Flow" section to function prose showing traced paths | Shows: `callLLM (469) → buildPrompt (120) → formatFunctionForPrompt (89)` |
| 6.7.3.2 | Include key variable values along call paths                   | Shows: `maxRetries=3 at line 475, timeout=30000 at line 476`              |
| 6.7.3.3 | For cross-file calls, show full path with file:line references | Shows: `src/cli/index.ts:181 → src/extractor/ast.ts:45 (extractFile)`     |

**Benchmark target**: B1-B3 Completeness: 2/5 → 4/5

##### 6.7.4 Root Cause Debugging Hints

**Problem**: D3 (404 debugging) scored 16/25. Control found "4 specific causes: Windows path separators, import path resolution, missing normalization, with code evidence."

**Benchmark Evidence**:

- D1: Control "identified 6 specific root causes with line references"
- D2: Control "identified 8 specific bottlenecks: sequential processing, 30s timeout, exponential backoff, sequential DB updates"

| Step    | What                                                 | Test                                                                   |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 6.7.4.1 | In error path output, group by symptom category      | Groups errors: "404 causes: [path normalization, missing node, ...]"   |
| 6.7.4.2 | Include specific values that trigger each error path | Shows: "Returns 404 when: path contains backslash, path starts with /" |
| 6.7.4.3 | Add "Debug Checklist" for common symptoms            | For debugging questions, provides step-by-step investigation guide     |
| 6.7.4.4 | Link error paths to test files that exercise them    | Shows: "Test coverage: src/api/index.test.ts:78 tests 404 path"        |

**Benchmark target**: D1-D3 Actionability: 2/5 → 4/5

##### 6.7.5 Pattern Evidence Enhancement

**Problem**: A3 (Design Patterns) scored 16/25. Control identified 24 patterns with file:line references; Pith detected patterns but showed "partial" evidence.

**Benchmark Evidence**:

- A3: Control found "Pipeline, Singleton, Factory, Strategy, Builder, Retry+Backoff, Cache, etc."
- Pith shows patterns exist but not with specific instantiation locations

| Step    | What                                                 | Test                                                                                  |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 6.7.5.1 | Include all instances of detected patterns in output | Shows: "Retry pattern found in: callLLM (469), fetchWithRetry (would show if exists)" |
| 6.7.5.2 | For each pattern, show key lines that confirm it     | Shows: "Retry evidence: maxRetries=3 (475), catch block (520), backoff formula (528)" |
| 6.7.5.3 | Add pattern-specific usage guidance                  | For Retry pattern: "To customize: modify maxRetries at line 475, backoff at line 528" |

**Benchmark target**: A3 Completeness: 2/5 → 4/5

---

##### Phase 6.7 Success Criteria

| Metric               | v7 Baseline | Target     | Test                       |
| -------------------- | ----------- | ---------- | -------------------------- |
| Modification (M1-M3) | 14.0/25     | ≥20/25     | Re-run M tasks after 6.7.2 |
| Debugging (D1-D3)    | 16.0/25     | ≥20/25     | Re-run D tasks after 6.7.4 |
| Behavior (B1-B3)     | 17.0/25     | ≥21/25     | Re-run B tasks after 6.7.3 |
| Architecture (A1-A3) | 18.0/25     | ≥22/25     | Re-run A tasks after 6.7.5 |
| **Overall**          | **16.3/25** | **≥20/25** | Full 15-task benchmark     |
| Actionability        | 2.1/5       | ≥4/5       | Score all tasks            |
| Completeness         | 2.3/5       | ≥4/5       | Score all tasks            |

**Execution Order** (by gap severity):

1. 6.7.2 Modification Guides (M gap: -9.7 points)
2. 6.7.4 Root Cause Debugging (D gap: -8.0 points)
3. 6.7.3 Call Flow Presentation (B gap: -7.0 points)
4. 6.7.1 Consumer Location Specificity (R gap: -6.4 points)
5. 6.7.5 Pattern Evidence Enhancement (A gap: -6.0 points)

---

#### Phase 6.8.0: Fix Fuzzy Matching Regression ⬅️ CRITICAL

**Goal**: Fix the fuzzy matching feature that is causing benchmark regression.

**Problem**: The fuzzy matching feature (commit 1bb81d9) causes the API to return **wrong files** with high confidence, leading to completely irrelevant context being returned.

**Root Cause Analysis**:

When querying `src/extractor/index.ts`:

1. Exact match fails (path may not exist in DB with exact spelling)
2. Fuzzy matching finds `src/generator/index.ts` as best match
3. Scoring gives **79% confidence** because:
   - Same filename (`index.ts`): +50 points
   - Same parent dir (`src`): +10 points
   - `extractor` vs `generator`: only -5 point penalty (Levenshtein distance)
4. Since 79% >= 70% threshold, the **wrong file is auto-returned**

**Impact**:

- A1, A2, B1, M1 all returned wrong module content
- Benchmark dropped from 78% (v1, before fuzzy) to 65% (v3, after fuzzy)
- Win rate dropped from 5 to 0

##### 6.8.0.1 Fix Options (Choose One)

| Option                         | Description                            | Pros                         | Cons                      |
| ------------------------------ | -------------------------------------- | ---------------------------- | ------------------------- |
| **A. Raise threshold**         | Increase AUTO_MATCH from 0.7 to 0.9+   | Simple change                | May still fail edge cases |
| **B. Require exact directory** | Only fuzzy match within same directory | Prevents cross-module errors | Less helpful for typos    |
| **C. Disable auto-resolve**    | Always return 404 with suggestions     | Safest, no false positives   | Requires user action      |
| **D. Semantic validation**     | Check module names aren't different    | Catches the specific failure | More complex logic        |

**Recommended**: Option C (disable auto-resolve) for now, then consider Option B.

##### 6.8.0.2 Implementation Steps

| Step      | Task                                                              | Test                                                     |
| --------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 6.8.0.2.1 | Change API to never auto-resolve fuzzy matches                    | Requests for wrong paths return 404 with suggestions     |
| 6.8.0.2.2 | Update `/context` to skip missing files instead of fuzzy matching | Context bundle only includes exact matches               |
| 6.8.0.2.3 | Add integration test for cross-module fuzzy matches               | `src/extractor/index.ts` query does NOT return generator |
| 6.8.0.2.4 | Re-run benchmark to verify fix                                    | Pith score returns to 75%+                               |

##### 6.8.0.3 Success Criteria

- [ ] No fuzzy matches return files from different modules
- [ ] Benchmark v4 shows improvement over v3
- [ ] Win rate returns to 3+ tasks
- [ ] Gap narrows to <5 points

---

#### Phase 6.8: Deterministic Gap Closure (Blocked by 6.8.0)

**Goal**: Close remaining gaps identified in 2025-12-31 benchmark through deterministic improvements before adding MCP delivery layer.

**Rationale**: MCP server is a delivery mechanism, not a quality improvement. Gap should be closed with deterministic extraction/output enhancements.

**Status**: Blocked until 6.8.0 (fuzzy matching fix) is complete. Current benchmark numbers are unreliable due to fuzzy matching returning wrong files.

**Benchmark Evidence** (2025-12-31 v3, after fixing fuzzy matching):

- R3 (extractFile consumers): 69% false positives due to import-level (not symbol-level) tracking
- B2 (buildPrompt): Content truncation loses important details
- D1-D3 (Debugging): Average 15/25 - need more specific root cause information

##### 6.8.1 Symbol-Level Import Tracking

**Problem**: R3 scored lowest (11/25). Pith reports "file A imports file B" but Control reports "file A uses function X from file B at line N".

| Step    | What                                                      | Test                                                                  |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| 6.8.1.1 | Track which specific symbols are used from imports        | `getUsedSymbols('src/cli')` returns `['extract']`                     |
| 6.8.1.2 | Filter impact analysis to only files using changed symbol | Impact for `extractFile` excludes files that only import `extractGit` |
| 6.8.1.3 | Show symbol usage in dependent file context               | "Uses: extractFile at lines 45, 78"                                   |

**Benchmark target**: R3: 11/25 → 18/25

##### 6.8.2 Full Content Preservation

**Problem**: B2 (buildPrompt) scored 17/25. Code snippets truncate at 15 lines, losing critical details.

| Step    | What                                                  | Test                                               |
| ------- | ----------------------------------------------------- | -------------------------------------------------- |
| 6.8.2.1 | Increase code snippet limit for complex functions     | Functions with >5 key statements get 30 lines      |
| 6.8.2.2 | Smart truncation that preserves key statement context | Truncation keeps 3 lines around each key statement |
| 6.8.2.3 | Add "full source available" indicator when truncated  | Shows "... (45 more lines, 3 more key statements)" |

**Benchmark target**: B2: 17/25 → 21/25

##### 6.8.3 Config File Extraction

**Problem**: Configuration values in `.json`, `.yaml` files are not extracted, missing important context.

| Step    | What                                          | Test                                            |
| ------- | --------------------------------------------- | ----------------------------------------------- |
| 6.8.3.1 | Extract package.json scripts and dependencies | Node with `scripts.test`, `dependencies` fields |
| 6.8.3.2 | Extract tsconfig.json compiler options        | Node with `compilerOptions.strict` etc.         |
| 6.8.3.3 | Extract pith.config.json if present           | Node with include/exclude patterns              |

**Benchmark target**: Improves context for all task categories

##### 6.8.4 Enhanced Debugging Output

**Problem**: D1-D3 average 16/25. Error paths extracted but not surfaced with enough specificity.

| Step    | What                                                         | Test                                                 |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 6.8.4.1 | For each error path, show the full condition chain           | "404 when: !node && path.includes('/')"              |
| 6.8.4.2 | Group error causes by HTTP status code                       | "Causes of 404: [3 paths], Causes of 500: [2 paths]" |
| 6.8.4.3 | Include stack trace hints (which functions propagate errors) | "Error propagates: api→builder→extractor"            |

**Benchmark target**: D1-D3: 16/25 → 20/25

---

##### Phase 6.8 Success Criteria

| Metric         | Current (v4)  | Target       |
| -------------- | ------------- | ------------ |
| Overall        | 17.8/25 (71%) | ≥21/25 (84%) |
| Gap to Control | 6.2 points    | ≤3 points    |
| R3 (worst)     | 13/25         | ≥20/25       |
| D1-D3 avg      | 16.3/25       | ≥20/25       |

---

#### Phase 6.9: Response Optimization ⬅️ CURRENT

**Goal**: Close efficiency and actionability gaps by returning targeted responses instead of full files.

**Context**: v4 benchmark (2025-12-31) shows Efficiency at 2.1/5 (worst criterion). Pith uses 1.2x more tokens than Control on average, with worst case 4.9x (M1).

**Key Issues from v4**:
- B2, D1, D2: Returns full files instead of specific functions
- R3: File-level import tracking misses 46 of 48 call sites
- D1-D3: Prose lacks debugging-specific insights
- M1-M3: Missing step-by-step implementation guides

##### 6.9.1 Smarter Default Output

**Problem**: API returns full file context when targeted excerpts would suffice. M1 uses 27,055 tokens vs Control's 5,500.

**Approach**: Make defaults smarter instead of adding parameters. Pith should automatically decide what to include.

| Step    | What                                                          | Test                                                    |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 6.9.1.1 | Default to compact output (prose + key statements only)       | `/context` returns ~50% fewer tokens than current       |
| 6.9.1.2 | Auto-expand for small files (<5 functions)                    | Small utility files show full content                   |
| 6.9.1.3 | Prioritize by relevance (high fan-in → more detail)           | Widely-used types get full signatures, others get summary |
| 6.9.1.4 | Include full code only for functions with patterns/errors     | `callLLM` shows retry logic, simple getters show signature only |

**Benchmark target**: Efficiency 2.1/5 → 4/5, token usage ≤ Control average

**Rationale**: Shifting complexity to the caller (via parameters) contradicts Pith's goal of providing ready-to-use context. Pith should be smart about what to return.

##### 6.9.2 Function-Level Consumer Tracking

**Problem**: R3 scored 13/25. importedBy edges show 2 files but Control found 48 call sites with line numbers.

| Step    | What                                                          | Test                                                    |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 6.9.2.1 | Track call sites for exported functions across files          | `extractFile` shows 48 call sites, not 2 files          |
| 6.9.2.2 | Store function usage with file:line references                | Each call site has file path and line number            |
| 6.9.2.3 | Add `/consumers/:file/:function` endpoint                     | Returns all consumers of specific function              |
| 6.9.2.4 | Distinguish production vs test consumers                      | "1 production consumer, 47 test consumers"              |

**Benchmark target**: R3: 13/25 → 20/25

##### 6.9.3 Debugging-Specific Prose

**Problem**: D1-D3 average 16.3/25. Prose doesn't highlight debugging-relevant information.

| Step    | What                                                          | Test                                                    |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 6.9.3.1 | Add "Common Issues" section to prose for error-prone functions| `callLLM` prose includes: "Empty response: check API key" |
| 6.9.3.2 | Include specific failure scenarios with conditions            | "Returns 404 when: path not normalized, node not built" |
| 6.9.3.3 | Add "Investigation Checklist" for files with error handling   | Step-by-step debugging guide for API files              |
| 6.9.3.4 | Link error paths to likely user-facing symptoms               | "Slow generation: check retry logic at line 475"        |

**Benchmark target**: D1-D3: 16.3/25 → 20/25

##### 6.9.4 Automatic Context Adaptation

**Problem**: Same context bundle strategy used for all query types, but different queries need different information.

**Approach**: Detect file characteristics and automatically adjust output - no query parameters needed.

| Step    | What                                                          | Test                                                    |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| 6.9.4.1 | Detect file type from characteristics                         | API files → include error paths; types → include consumers |
| 6.9.4.2 | Module requests: return summaries, skip function details      | `/context?files=src/extractor` returns module overview  |
| 6.9.4.3 | High fan-in files: auto-include impact tree + tests           | WikiNode context includes 9 dependents + test commands  |
| 6.9.4.4 | Files with error handling: auto-include debugging hints       | API file context shows 404/500 causes automatically     |

**Benchmark target**: Relevance 3.7/5 → 4.5/5

**Rationale**: The requested files themselves indicate what the user needs. API files → likely debugging. Types → likely modification. Modules → likely architecture.

---

##### Phase 6.9 Success Criteria

| Metric         | v4 Baseline   | Target       |
| -------------- | ------------- | ------------ |
| Overall        | 17.8/25 (71%) | ≥21/25 (84%) |
| Gap to Control | 6.2 points    | ≤3 points    |
| Efficiency     | 2.1/5         | ≥4/5         |
| Actionability  | 3.5/5         | ≥4/5         |
| D1-D3 avg      | 16.3/25       | ≥20/25       |
| R3             | 13/25         | ≥20/25       |

**Execution Order** (by gap severity):

1. 6.9.1 Response Targeting (Efficiency gap: -2.2 points)
2. 6.9.2 Function-Level Consumer Tracking (R3 gap: -12 points)
3. 6.9.3 Debugging Prose (D1-D3 gap: -7.7 points)
4. 6.9.4 Query-Type Routing (Relevance gap: -1.3 points)

---

### Phase 7: Query Planner

**Goal**: Accept natural language queries and return relevant context automatically.

**Rationale**: Currently, callers guess which files to request. The Query Planner brings file selection INTO Pith, where the codebase index enables informed decisions.

**Flow**:
```
POST /query { query: "How does retry work?" }
         ↓
   Planner LLM sees: query + codebase index (summaries, relationships)
         ↓
   Planner outputs: prioritized file list
         ↓
   Fetch existing prose for selected files (no additional LLM call)
         ↓
   Return assembled context
```

**Key design decisions**:
- One LLM call (planning), then deterministic assembly
- Uses existing pre-generated prose - no query-specific generation
- Intent detection is implicit in planner reasoning, not a separate step

#### 7.1 Query Endpoint

| Step  | What                                                              | Test                                                    |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| 7.1.1 | New `POST /query` endpoint accepting `{ query: "..." }`           | Endpoint accepts natural language query                 |
| 7.1.2 | Build planner prompt: query + file summaries + relationship graph | Prompt includes codebase structure                      |
| 7.1.3 | Planner returns file list with relevance scores                   | Response is `{ files: [path, ...], reasoning: "..." }`  |
| 7.1.4 | Fetch and assemble context from selected files' existing prose    | Returns bundled markdown context                        |
| 7.1.5 | End-to-end response: query in → context out                       | Single request returns complete answer context          |

**Benchmark target**: File selection matches Control's accuracy; overall 71% → 80%+

---

##### Phase 7 Success Criteria

| Metric         | v4 Baseline   | Target       |
| -------------- | ------------- | ------------ |
| Overall        | 17.8/25 (71%) | ≥20/25 (80%) |
| Gap to Control | 6.2 points    | ≤3 points    |
| Win rate       | 0/15          | ≥3/15        |

**Why this works**: The planner sees both the user's question AND the codebase index. This bridges the information asymmetry - callers have questions but not structure, Pith has structure but not questions.

**Future extensions** (not in MVP):
- Query-specific prose synthesis (additional LLM call per request)
- Caching common query patterns
- Lightweight planning model for cost optimization

---

### Phase 8: Advanced Relationships

**Lower priority** - nice to have but not critical for task context.

| Feature            | Priority | Notes                                                |
| ------------------ | -------- | ---------------------------------------------------- |
| Co-change analysis | MEDIUM   | "Files that change together" - useful                |
| Domain nodes       | LOW      | High-level grouping - less actionable                |
| Concept nodes      | LOW      | Cross-cutting patterns - hard to generate accurately |
| Collection nodes   | LOW      | "All handlers" - rarely needed                       |

### Phase 9: Intelligence (DEPRIORITIZED)

These provide interesting metrics but don't directly improve task context.

| Feature            | Priority | Notes                                    |
| ------------------ | -------- | ---------------------------------------- |
| Complexity scoring | LOW      | Interesting but not actionable for tasks |
| Churn analysis     | MEDIUM   | Identifies hotspots                      |
| Hotspot detection  | MEDIUM   | Useful for code review, not task context |
| Coupling analysis  | MEDIUM   | Already have via import edges            |

### Phase 10: Integration

| Feature        | Priority | Notes                          |
| -------------- | -------- | ------------------------------ |
| MCP server     | HIGH     | Enables direct LLM tool use    |
| Git webhooks   | LOW      | Automation, not output quality |
| IDE extensions | LOW      | Delivery mechanism             |
| GitHub Actions | LOW      | CI integration                 |

### Phase 11: Scale (DEPRIORITIZED)

Only needed for very large codebases.

| Feature               | Priority | Notes                              |
| --------------------- | -------- | ---------------------------------- |
| MongoDB backend       | LOW      | MangoDB works fine for 100k+ lines |
| Background generation | LOW      | On-demand solves this              |
| Multi-repo            | LOW      | Scope expansion                    |
| Incremental prose     | MEDIUM   | Handled by staleness detection     |

---

## Priority Summary

Based on v4 benchmark (2025-12-31), focus on:

1. **Smarter defaults** (Phase 6.9.1) - Reduce token usage via intelligent output sizing
2. **Function-level consumer tracking** (Phase 6.9.2) - Close R3's 12-point gap
3. **Debugging-specific prose** (Phase 6.9.3) - Improve D1-D3 scores by 4+ points
4. **Automatic context adaptation** (Phase 6.9.4) - Detect file type and adjust output automatically
5. **Query Planner** (Phase 7) - One LLM call to select files, then assemble existing prose
6. **MCP server** (Phase 10) - LLM tool integration after quality gaps closed

**Design principle**: Pith should be a smart context provider that "just works". The Query Planner is the logical evolution - accept questions, not file paths.

Skip for now:

- Advanced node types (domain, concept, collection)
- Intelligence features (complexity, churn)
- Scale features (already works on 100+ files)

---

## Development Workflow

Each feature follows this cycle:

```
1. Write failing test
       │
       ▼
2. Implement minimal code to pass
       │
       ▼
3. Refactor if needed
       │
       ▼
4. Commit (tests + implementation together)
```

**Test commands**:

```bash
node --test                              # Run all tests
node --test src/extractor/ast.test.ts    # Run specific test
node --test --experimental-test-coverage # With coverage
```

---

## Manual Validation

Unit tests verify correctness. Manual validation verifies usefulness.

### Why Manual Validation?

- Unit tests can't judge "Is this summary helpful?"
- Real codebases have edge cases fixtures don't cover
- Only human review catches misleading or useless output
- Validates that the whole system works together

### Validation Repo

Choose a real public TypeScript repository for validation:

**Criteria**:

- 20-50 source files (enough complexity, not overwhelming)
- Active git history (multiple authors, meaningful commits)
- Has JSDoc comments and README files
- Well-structured (clear module boundaries)

**Good candidates**:

- A small CLI tool
- A focused library
- A simple Express/Fastify app

Use the **same repo** across all phases to track improvement.

### Validation Process

After each phase:

1. Run Pith commands on the validation repo
2. Manually inspect output (extracted data, nodes, prose, API responses)
3. Check items in the phase's validation checklist
4. Note any issues or surprises
5. Fix critical issues before moving to next phase

---

## Emergent Decisions

Some decisions should be made during implementation, not upfront:

**Shared types (`types/` directory)**:

- Don't create upfront
- Extract when 2+ modules need the same type
- Refactor during natural code evolution

**File structure within `src/`**:

- Start flat, add directories when a clear grouping emerges
- Let the code tell you what belongs together

**Error handling granularity**:

- Start with basic try/catch per file
- Add more nuanced severity levels if needed during testing

**Function node thresholds**:

- Start with "exported functions only"
- Adjust based on what proves useful in validation

The atomic steps in this roadmap specify _what_ to implement, not _how_ to structure the code. Let implementation experience guide organization.

---

## Dependencies Between Phases

```
Phase 1 (Extraction)
    │
    ▼
Phase 2 (Node Graph)
    │
    ▼
Phase 3 (Prose) ──────┐
    │                 │
    ▼                 │
Phase 4 (API) ◄───────┘
    │
    ▼
Phase 5 (Polish)
```

Phases 1-4 are sequential. Phase 5 can happen in parallel with Phase 4.
