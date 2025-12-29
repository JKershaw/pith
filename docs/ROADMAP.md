# Roadmap

Phased build plan from zero to useful. Each phase follows TDD: write failing tests first, then implement.

## Phase 1: Foundation

**Goal**: Extract facts from a TypeScript codebase and store structured data.

### Deliverables

1. **Project setup**
   - TypeScript project with ESM
   - CLI scaffold with commander
   - Node test runner configured (`node --test`)
   - Test fixture: small TypeScript project in `test/fixtures/simple-project/`

2. **AST extractor** (`pith extract`)
   - Tests first: `extractFile()` returns expected structure for fixture files
   - Parse `.ts` files with ts-morph
   - Extract: files, functions, classes, imports, exports
   - Store to MangoDB `extracted` collection

3. **Git extractor**
   - Tests first: `extractGitInfo()` returns commits, authors for fixture repo
   - Read commit history with simple-git
   - Extract: commits per file, authors, last modified dates
   - Store to MangoDB `extracted` collection

4. **Docs extractor**
   - Tests first: `extractDocs()` returns JSDoc and README content
   - Extract JSDoc from functions/classes
   - Extract README.md content per directory
   - Store to MangoDB `extracted` collection

### Exit Criteria

- All extractor tests pass
- Running `pith extract ./project` populates MangoDB with extraction data
- Can query extracted data: `db.collection('extracted').find({ type: 'file' })`

---

## Phase 2: Node Graph

**Goal**: Transform raw extraction into navigable nodes with edges.

### Deliverables

1. **Node builder** (`pith build`)
   - Tests first: `buildFileNode()` creates correct node structure
   - Tests first: `buildModuleNode()` aggregates child files
   - Create `file` nodes from AST data
   - Create `function` nodes for exported functions
   - Create `module` nodes for directories with index.ts
   - Store to MangoDB `nodes` collection

2. **Edge creation**
   - Tests first: `computeEdges()` creates correct relationships
   - `contains` edges: module → files, file → functions
   - `imports` edges: file → file based on import statements

3. **Metadata computation**
   - Tests first: `computeMetadata()` calculates correct values
   - Lines of code per file
   - Commit count, last modified, authors from git data
   - Fan-in/fan-out from import graph

### Exit Criteria

- All builder tests pass
- Running `pith build` populates MangoDB `nodes` collection
- Can traverse: `nodes.findOne({ type: 'module' })` → get children → get their imports

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

### Exit Criteria

- All generator tests pass (with mocked LLM for unit tests)
- Running `pith generate` updates nodes in MangoDB with prose
- Each node has summary, purpose, and gotchas

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

### Exit Criteria

- All API tests pass
- Can fetch node data via HTTP
- Context endpoint returns useful bundled information

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
