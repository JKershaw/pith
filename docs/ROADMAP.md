# Roadmap

Phased build plan from zero to useful. Each phase follows TDD: write failing tests first, then implement.

## Phase 1: Foundation

**Goal**: Extract facts from a TypeScript codebase and store structured data.

See [EXTRACTION.md](EXTRACTION.md) for complete data definitions and types.

### 1.0 Project Setup

Complete these before any extraction work:

| Step | Test | Implementation |
|------|------|----------------|
| 1.0.1 | - | Initialize TypeScript project with ESM, strict mode |
| 1.0.2 | - | Add dependencies: ts-morph, simple-git, commander, @jkershaw/mangodb |
| 1.0.3 | `node --test` runs | Configure Node test runner |
| 1.0.4 | `npm run lint` passes | Set up ESLint + Prettier |
| 1.0.5 | CI passes on push | Set up GitHub Actions workflow |
| 1.0.6 | - | Create `test/fixtures/simple-project/` with sample .ts files |
| 1.0.7 | - | Initialize fixture as git repo with sample commits |
| 1.0.8 | CLI shows help | Scaffold CLI with `pith extract <path>` command |
| 1.0.9 | Can connect/query | Set up MangoDB connection helper |

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

| Step | Data | Test | Implementation |
|------|------|------|----------------|
| 1.1.1 | File discovery | `findFiles()` returns all .ts paths in fixture | Glob for .ts files |
| 1.1.2 | File path (A1) | `extractFile()` returns correct path | Store relative path |
| 1.1.3 | Line count (A2) | Returns correct line count | Count newlines |
| 1.1.4 | Imports (A3) | Returns import list with `from` and `names` | Parse ImportDeclaration |
| 1.1.5 | Exports (A4) | Returns export list with `name` and `kind` | Parse ExportDeclaration |
| 1.1.6 | Functions basic (A5) | Returns function name and signature | Parse FunctionDeclaration |
| 1.1.7 | Classes basic (A6) | Returns class name and method names | Parse ClassDeclaration |
| 1.1.8 | Interfaces (A7) | Returns interface names and properties | Parse InterfaceDeclaration |
| 1.1.9 | Function params (A8) | Returns parameter names and types | Extract from signature |
| 1.1.10 | Return types (A9) | Returns function return types | Extract from signature |
| 1.1.11 | Async markers (A10) | Correctly identifies async functions | Check async modifier |
| 1.1.12 | Store AST | Data persists in MangoDB | Insert to `extracted` collection |

**Checkpoint**: `pith extract ./fixture` stores all AST data. Can query functions, imports.

### 1.2 Git Extraction

| Step | Data | Test | Implementation |
|------|------|------|----------------|
| 1.2.1 | Commit count (G1) | Returns correct count for fixture file | `git log --follow` |
| 1.2.2 | Last modified (G2) | Returns correct date | Parse most recent commit |
| 1.2.3 | Created date (G3) | Returns date of first commit | `git log --diff-filter=A` |
| 1.2.4 | Authors (G4) | Returns unique author list | Collect from commits |
| 1.2.5 | Recent commits (G5) | Returns last 5 commit messages | `git log -n 5` |
| 1.2.6 | Primary author (G6) | Returns author with most commits | Count and sort |
| 1.2.7 | Store Git | Git data persists in MangoDB | Update `extracted` docs |

**Checkpoint**: Each extracted file has complete git metadata.

### 1.3 Documentation Extraction

| Step | Data | Test | Implementation |
|------|------|------|----------------|
| 1.3.1 | JSDoc (D1) | Extracts description, @param, @returns | Parse JSDoc comments |
| 1.3.2 | Inline comments (D2) | Extracts comments near functions | Find comment nodes |
| 1.3.3 | README (D3) | Extracts README.md per directory | Read file if exists |
| 1.3.4 | TODO comments (D4) | Finds TODO/FIXME with line numbers | Regex scan |
| 1.3.5 | Deprecations (D5) | Extracts @deprecated messages | Parse JSDoc tag |
| 1.3.6 | Store Docs | Doc data persists in MangoDB | Update `extracted` docs |

**Checkpoint**: Full extraction complete. All data queryable.

### 1.4 CLI Integration

| Step | Test | Implementation |
|------|------|----------------|
| 1.4.1 | `pith extract ./path` runs all extractors | Wire up CLI to extractors |
| 1.4.2 | Handles missing path gracefully | Error handling |
| 1.4.3 | Handles parse errors gracefully | Try/catch per file |
| 1.4.4 | Shows progress | Console output |

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

| Step | Test | Implementation |
|------|------|----------------|
| 2.1.1 | `buildFileNode()` returns correct structure | Create basic file node from extracted data |
| 2.1.2 | Node has correct `id` (path-based) | Generate deterministic ID |
| 2.1.3 | Node has correct `name` (basename) | Extract filename |
| 2.1.4 | Node has `metadata.lines` | Copy from extracted |
| 2.1.5 | Node has `metadata.commits` | Copy from git data |
| 2.1.6 | Node has `metadata.lastModified` | Copy from git data |
| 2.1.7 | Node has `metadata.authors` | Copy from git data |
| 2.1.8 | Node has `raw.signature` | Copy function signatures |
| 2.1.9 | Node has `raw.jsdoc` | Copy JSDoc |
| 2.1.10 | Node has `raw.imports` | Copy import list |
| 2.1.11 | Node has `raw.exports` | Copy export list |
| 2.1.12 | Node has `raw.recentCommits` | Copy recent commits |
| 2.1.13 | Store file nodes | Insert to `nodes` collection |

**Checkpoint**: All files have nodes with complete metadata and raw data.

### 2.2 Function Nodes

| Step | Test | Implementation |
|------|------|----------------|
| 2.2.1 | `shouldCreateFunctionNode()` returns true for exported functions | Heuristic check |
| 2.2.2 | `buildFunctionNode()` returns correct structure | Create function node |
| 2.2.3 | Node has correct `id` (file:function) | Generate ID |
| 2.2.4 | Node has `raw.signature` | Copy signature |
| 2.2.5 | Node has `raw.jsdoc` | Copy function's JSDoc |
| 2.2.6 | Store function nodes | Insert to `nodes` collection |

### 2.3 Module Nodes

| Step | Test | Implementation |
|------|------|----------------|
| 2.3.1 | `shouldCreateModuleNode()` true for dirs with index.ts | Heuristic check |
| 2.3.2 | `shouldCreateModuleNode()` true for dirs with 3+ files | Heuristic check |
| 2.3.3 | `buildModuleNode()` returns correct structure | Create module node |
| 2.3.4 | Node has `raw.readme` | Copy README if exists |
| 2.3.5 | Store module nodes | Insert to `nodes` collection |

### 2.4 Edges

| Step | Test | Implementation |
|------|------|----------------|
| 2.4.1 | `contains` edge: module → file | Create edge for each file in module |
| 2.4.2 | `contains` edge: file → function | Create edge for each function node |
| 2.4.3 | `imports` edge: file → file | Create edge for each import |
| 2.4.4 | `parent` edge: file → module | Reverse of contains |
| 2.4.5 | Edges stored on nodes | Add to `edges` array |

### 2.5 Computed Metadata

| Step | Data | Test | Implementation |
|------|------|------|----------------|
| 2.5.1 | Fan-in (C1) | Correct count of incoming imports | Count `imports` edges targeting node |
| 2.5.2 | Fan-out (C2) | Correct count of outgoing imports | Count node's import edges |
| 2.5.3 | Age (C3) | Correct days since creation | Calculate from createdAt |
| 2.5.4 | Recency (C4) | Correct days since last change | Calculate from lastModified |
| 2.5.5 | Update nodes | Computed data persists | Update nodes in collection |

### 2.6 CLI Integration

| Step | Test | Implementation |
|------|------|----------------|
| 2.6.1 | `pith build` creates all nodes | Wire up CLI |
| 2.6.2 | Build requires extract first | Check extracted data exists |
| 2.6.3 | Shows progress | Console output |

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
- [ ] Does "purpose" explain *why*, not just *what*?
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

## Future Phases (Post-MVP)

### Phase 6: Advanced Nodes
- Domain nodes (logical groupings)
- Concept nodes (cross-cutting patterns)
- Collection nodes ("all handlers", "all models")
- Co-change analysis from git history

### Phase 7: Intelligence
- Complexity scoring (cyclomatic, cognitive)
- Churn analysis (change frequency)
- Hotspot detection (high churn + high complexity)
- Coupling analysis

### Phase 8: Integration
- Git webhooks for automatic refresh
- IDE extensions
- GitHub Actions for CI
- MCP server for direct LLM tool use

### Phase 9: Scale
- MongoDB for persistent storage
- Background prose generation
- Multi-repo support
- Incremental prose updates

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
