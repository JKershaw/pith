# Roadmap

Phased build plan from zero to useful.

## Phase 1: Foundation

**Goal**: Extract facts from a TypeScript codebase and output structured JSON.

### Deliverables

1. **Project setup**
   - TypeScript project with ESM
   - CLI scaffold with commander
   - Basic configuration loading

2. **AST extractor** (`pith extract`)
   - Parse `.ts` files with ts-morph
   - Extract: files, functions, classes, imports, exports
   - Output to `extracted/ast.json`

3. **Git extractor**
   - Read commit history with simple-git
   - Extract: commits per file, authors, last modified dates
   - Output to `extracted/git.json`

4. **Docs extractor**
   - Extract JSDoc from functions/classes
   - Extract README.md content per directory
   - Output to `extracted/docs.json`

### Exit Criteria

Running `pith extract ./project` produces three JSON files with complete extraction data.

---

## Phase 2: Node Graph

**Goal**: Transform raw extraction into navigable nodes with edges.

### Deliverables

1. **Node builder** (`pith build`)
   - Create `file` nodes from AST data
   - Create `function` nodes for exported functions
   - Create `module` nodes for directories with index.ts

2. **Edge creation**
   - `contains` edges: module → files, file → functions
   - `imports` edges: file → file based on import statements

3. **Metadata computation**
   - Lines of code per file
   - Commit count, last modified, authors from git data
   - Fan-in/fan-out from import graph

### Exit Criteria

Running `pith build` produces `nodes.json` with properly linked nodes. Can traverse from module to file to function and back.

---

## Phase 3: Prose Generation

**Goal**: Generate human-readable prose using an LLM.

### Deliverables

1. **LLM integration**
   - Anthropic Claude API client
   - Prompt templates for summary/purpose/gotchas
   - Rate limiting and error handling

2. **Prose generator** (`pith generate`)
   - Iterate through nodes
   - Send context (signature, comments, commits) to LLM
   - Parse and store prose on nodes
   - Track generation timestamp

3. **Fractal generation**
   - Generate file prose first
   - Use file summaries to generate module prose
   - Handle missing/partial data gracefully

4. **Staleness detection**
   - Compare file mtime to prose generation time
   - Flag stale prose
   - Support `--force` to regenerate all

### Exit Criteria

Running `pith generate` enriches `nodes.json` with prose. Each node has summary, purpose, and gotchas.

---

## Phase 4: API

**Goal**: Serve nodes via HTTP for LLM consumption.

### Deliverables

1. **Express server** (`pith serve`)
   - Load `nodes.json` into memory
   - Serve on configurable port

2. **Endpoints**
   - `GET /node/:path` - Single node with all data
   - `GET /context?files=a,b,c` - Bundled context
   - `POST /refresh` - Re-run extract + build

3. **Context bundling**
   - Include requested nodes
   - Include immediate imports/exports
   - Include parent module
   - Format for LLM consumption (markdown)

4. **Refresh flow**
   - Re-extract on demand
   - Rebuild node graph
   - Mark affected prose as stale

### Exit Criteria

Can fetch node data via HTTP. Context endpoint returns useful bundled information.

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
