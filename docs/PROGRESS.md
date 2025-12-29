# Progress Tracker

## Current Status

**Last completed phase**: Phase 6.4 - Pattern Examples
**Current step**: Phase 6.5 - Gotcha Validation
**Date**: 2025-12-29

### Phase 6 - On-Demand Generation & Task-Oriented Context

Based on testing validation (see `docs/testing-plan.md`), prioritized improvements:

| Priority | Feature | Status |
|----------|---------|--------|
| 1 | On-demand prose generation | **DONE** |
| 2 | Test file mapping | **DONE** |
| 3 | Modification impact in context | **DONE** |
| 4 | Pattern examples | **DONE** |
| 5 | Gotcha validation | TODO |

---

## Phase 6.4: Pattern Examples - COMPLETE

### Implementation Summary
| Step | Description | Status |
|------|-------------|--------|
| 6.4.1 | Quick Start section in module prose | Done |
| 6.4.2 | LLM prompts request code patterns | Done |
| 6.4.3 | Similar file references | Done |

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
| Step | Description | Status |
|------|-------------|--------|
| 6.3.1 | Add `importedBy` edges (reverse of imports) | Done |
| 6.3.2 | Show dependents in context markdown | Done |
| 6.3.3 | Add warning for high fan-in (> 5) | Done |

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
| Step | Description | Status |
|------|-------------|--------|
| 6.2.1 | Detect test files by pattern | Done |
| 6.2.2 | Add `testFile` edge type | Done |
| 6.2.3 | Include test file in /context bundle | Done |
| 6.2.4 | Add `testCommand` to metadata | Done |

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
| Step | Description | Status |
|------|-------------|--------|
| 6.1.1 | Modify `/node/:path` to check for prose | Done |
| 6.1.2 | Add `generateProseForNode()` function | Done |
| 6.1.3 | Cache generated prose in DB | Done (existing) |
| 6.1.4 | Add `--lazy` flag to `pith serve` | Done |
| 6.1.5 | Keep `pith generate` for batch pre-generation | Done (unchanged) |
| 6.1.6 | Add `?prose=false` query param | Done |

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
| Step | Description | Status |
|------|-------------|--------|
| 1.0.1 | Initialize TypeScript project with ESM, strict mode | Done |
| 1.0.2 | Add dependencies: ts-morph, simple-git, commander, @jkershaw/mangodb | Done |
| 1.0.3 | Configure Node test runner | Done |
| 1.0.4 | Set up ESLint + Prettier | Done |
| 1.0.5 | Set up GitHub Actions workflow | Done |
| 1.0.6 | Create test/fixtures/simple-project/ with sample .ts files | Done |
| 1.0.7 | Initialize fixture as git repo with sample commits | Done |
| 1.0.8 | Scaffold CLI with `pith extract <path>` command | Done |
| 1.0.9 | Set up MangoDB connection helper | Done |

### 1.1 AST Extraction - COMPLETE
| Step | Data | Status |
|------|------|--------|
| 1.1.1 | File discovery | Done |
| 1.1.2 | File path (A1) | Done |
| 1.1.3 | Line count (A2) | Done |
| 1.1.4 | Imports (A3) | Done |
| 1.1.5 | Exports (A4) | Done |
| 1.1.6 | Functions basic (A5) | Done |
| 1.1.7 | Classes basic (A6) | Done |
| 1.1.8 | Interfaces (A7) | Done |
| 1.1.9 | Function params (A8) | Done |
| 1.1.10 | Return types (A9) | Done |
| 1.1.11 | Async markers (A10) | Done |
| 1.1.12 | Store AST in MangoDB | Done |

### 1.2 Git Extraction - COMPLETE
| Step | Data | Status |
|------|------|--------|
| 1.2.1 | Commit count (G1) | Done |
| 1.2.2 | Last modified (G2) | Done |
| 1.2.3 | Created date (G3) | Done |
| 1.2.4 | Authors (G4) | Done |
| 1.2.5 | Recent commits (G5) | Done |
| 1.2.6 | Primary author (G6) | Done |
| 1.2.7 | Store Git data | Done |

### 1.3 Documentation Extraction - COMPLETE
| Step | Data | Status |
|------|------|--------|
| 1.3.1 | JSDoc (D1) | Done |
| 1.3.2 | Inline comments (D2) | Done |
| 1.3.3 | README (D3) | Done |
| 1.3.4 | TODO comments (D4) | Done |
| 1.3.5 | Deprecations (D5) | Done |
| 1.3.6 | Store Docs | Done |

### 1.4 CLI Integration - COMPLETE
| Step | Status |
|------|--------|
| 1.4.1 | `pith extract ./path` runs all extractors | Done |
| 1.4.2 | Handles missing path gracefully | Done |
| 1.4.3 | Handles parse errors gracefully | Done |
| 1.4.4 | Shows progress | Done |

**Phase 1 Exit Criteria**: All met
- [x] All extraction tests pass
- [x] `pith extract ./project` populates MangoDB
- [x] Can query functions, imports from extracted collection

---

## Phase 2: Node Graph - COMPLETE

### 2.1 File Nodes - COMPLETE
| Step | Status |
|------|--------|
| 2.1.1-2.1.13 | All file node tests passing | Done |

### 2.2 Function Nodes - COMPLETE
| Step | Status |
|------|--------|
| 2.2.1-2.2.6 | All function node tests passing | Done |

### 2.3 Module Nodes - COMPLETE
| Step | Status |
|------|--------|
| 2.3.1-2.3.5 | All module node tests passing | Done |

### 2.4 Edges - COMPLETE
| Step | Status |
|------|--------|
| 2.4.1-2.4.5 | All edge tests passing | Done |

### 2.5 Computed Metadata - COMPLETE
| Step | Data | Status |
|------|------|--------|
| 2.5.1 | Fan-in (C1) | Done |
| 2.5.2 | Fan-out (C2) | Done |
| 2.5.3 | Age (C3) | Done |
| 2.5.4 | Recency (C4) | Done |
| 2.5.5 | Update nodes | Done |

### 2.6 CLI Integration - COMPLETE
| Step | Status |
|------|--------|
| 2.6.1 | `pith build` creates all nodes | Done |
| 2.6.2 | Build requires extract first | Done |
| 2.6.3 | Shows progress | Done |

**Phase 2 Exit Criteria**: All met
- [x] All builder tests pass
- [x] `pith build` populates MangoDB `nodes` collection
- [x] Can traverse: module -> files -> functions
- [x] Can query by fan-in

---

## Phase 3: Prose Generation - COMPLETE

### Implementation - COMPLETE
| Component | Status |
|-----------|--------|
| LLM integration (OpenRouter) | Done |
| `buildPrompt()` creates correct prompt | Done |
| `parseLLMResponse()` extracts structured prose | Done |
| Rate limiting and error handling | Done |
| Staleness detection | Done |

### CLI Integration - COMPLETE
| Step | Status |
|------|--------|
| `pith generate` command | Done |
| Iterates through nodes without prose | Done |
| Stores prose on nodes | Done |
| --model option support | Done |

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
| Component | Status |
|-----------|--------|
| Express server (`pith serve`) | Done |
| `GET /node/:path` endpoint | Done |
| `GET /context?files=` endpoint | Done |
| `POST /refresh` endpoint | Done |
| Context bundling | Done |
| Markdown formatting | Done |

### Tests - COMPLETE
| Test | Status |
|------|--------|
| GET /node/:path returns node data | Done |
| GET /node/:path returns 404 for missing | Done |
| GET /context returns bundled markdown | Done |
| GET /context supports multiple files | Done |
| GET /context?format=json returns JSON | Done |
| GET /context returns 400 when no files | Done |
| POST /refresh requires projectPath | Done |
| POST /refresh validates path | Done |

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
| Feature | Status |
|---------|--------|
| `pith.config.json` support | Done |
| Include/exclude patterns | Done |
| LLM provider/model selection | Done |
| Environment variable fallbacks | Done |

**New files**: `src/config/index.ts`, `src/config/index.test.ts`

### 5.2 Performance - COMPLETE
| Feature | Status |
|---------|--------|
| Incremental extraction (file hashing) | Done |
| Parallel file parsing (batch of 4) | Done |
| Extraction cache (`.pith/extraction-cache.json`) | Done |
| `--force` flag to bypass cache | Done |

**New files**: `src/extractor/cache.ts`, `src/extractor/cache.test.ts`

### 5.3 CLI Improvements - COMPLETE
| Feature | Status |
|---------|--------|
| `--verbose, -v` flag | Done |
| `--quiet, -q` flag | Done |
| `--dry-run` mode | Done |
| Elapsed time display | Done |
| Cost estimation (`--estimate`) | Done |

### 5.4 Error Handling - COMPLETE
| Feature | Status |
|---------|--------|
| PithError class with severity levels | Done |
| Error codes (PARSE_ERROR, LLM_ERROR, etc.) | Done |
| LLM retry with exponential backoff | Done |
| Clear error messages with suggestions | Done |
| Error grouping in summaries | Done |

**New files**: `src/errors/index.ts`, `src/errors/index.test.ts`

**Phase 5 Exit Criteria**: All met
- [x] Configuration file support works
- [x] Incremental extraction skips unchanged files
- [x] CLI has verbose/quiet/dry-run modes
- [x] Errors are handled gracefully with retries

---

## Test Summary

As of 2025-12-29 (Phase 6.4):
- **Total tests**: 270
- **All passing**: Yes
- **Lint**: Clean
- **Test suites**: 66

Commands:
```bash
npm test      # 270 tests pass
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
- `POST /refresh` - Re-extract and rebuild

### Key Features
- TypeScript AST extraction (functions, classes, interfaces, imports, exports)
- Git history extraction (commits, authors, dates)
- Documentation extraction (JSDoc, comments, TODOs, deprecations)
- Node graph with edges (imports, contains, parent)
- Computed metadata (fan-in, fan-out, age, recency)
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
