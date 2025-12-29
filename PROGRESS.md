# Development Progress

Tracks completed steps and notes from implementation.

## Current Phase: 1.4 CLI Integration

### Status
- **Last completed step**: 1.3.6 - Store docs in MangoDB
- **Next step**: 1.4.1 - Wire up CLI to extractors

---

## Completed Steps

### Phase 1.0 - Project Setup (COMPLETE)

| Step | Description | Status |
|------|-------------|--------|
| 1.0.1 | Initialize TypeScript project with ESM, strict mode | Done |
| 1.0.2 | Add dependencies (ts-morph, simple-git, commander, @jkershaw/mangodb) | Done |
| 1.0.3 | Configure Node test runner | Done |
| 1.0.4 | Set up ESLint + Prettier | Done |
| 1.0.5 | Set up GitHub Actions workflow | Done |
| 1.0.6 | Create test fixtures with sample .ts files | Done |
| 1.0.7 | Initialize fixture as git repo with sample commits | Done |
| 1.0.8 | Scaffold CLI with `pith extract` command | Done |
| 1.0.9 | Set up MangoDB connection helper | Done |

### Phase 1.1 - AST Extraction (COMPLETE)

| Step | Description | Status |
|------|-------------|--------|
| 1.1.1 | `findFiles()` returns all .ts paths in fixture | Done |
| 1.1.2 | `extractFile()` returns correct path (A1) | Done |
| 1.1.3 | Returns correct line count (A2) | Done |
| 1.1.4 | Extracts imports with `from` and `names` (A3) | Done |
| 1.1.5 | Extracts exports with `name` and `kind` (A4) | Done |
| 1.1.6 | Extracts functions with signature (A5) | Done |
| 1.1.7 | Extracts classes with methods (A6) | Done |
| 1.1.8 | Extracts interfaces with properties (A7) | Done |
| 1.1.9 | Extracts function parameters (A8) | Done |
| 1.1.10 | Extracts return types (A9) | Done |
| 1.1.11 | Identifies async functions (A10) | Done |
| 1.1.12 | Stores AST data in MangoDB | Done |

### Phase 1.2 - Git Extraction (COMPLETE)

| Step | Description | Status |
|------|-------------|--------|
| 1.2.1 | Returns commit count (G1) | Done |
| 1.2.2 | Returns last modified date (G2) | Done |
| 1.2.3 | Returns created date (G3) | Done |
| 1.2.4 | Returns unique authors (G4) | Done |
| 1.2.5 | Returns recent commits (G5) | Done |
| 1.2.6 | Returns primary author (G6) | Done |
| 1.2.7 | Git data integrates with ExtractedFile | Done |

### Phase 1.3 - Documentation Extraction (COMPLETE)

| Step | Description | Status |
|------|-------------|--------|
| 1.3.1 | Extracts JSDoc (D1) - description, @param, @returns, @throws | Done |
| 1.3.2 | Extracts inline comments (D2) with line numbers | Done |
| 1.3.3 | Extracts README content (D3) per directory | Done |
| 1.3.4 | Extracts TODO/FIXME/HACK/XXX comments (D4) | Done |
| 1.3.5 | Extracts @deprecated markers (D5) with entity names | Done |
| 1.3.6 | DocsInfo integrates with ExtractedFile storage | Done |

---

## Notes

### 2025-12-29 - Phase 1.0 Complete

Project setup is complete. Key decisions:

- Using Node 22's built-in `--experimental-strip-types` for running TypeScript tests directly
- Test imports use `.ts` extension (required for strip-types mode)
- MangoDB exports `MangoDb` (not `Db`) - updated imports accordingly
- Test fixtures include a mini project with:
  - Type definitions (interfaces, type aliases)
  - Functions (async, with JSDoc)
  - Classes (with methods and deprecation markers)
  - Re-exports (index.ts)
  - 5 commits from 2 different authors for git history testing

All tests pass, linting passes. Ready to begin AST extraction in Phase 1.1.

### 2025-12-29 - Phase 1.1 Complete

AST extraction is complete. Implementation details:

- Created `createProject()` that returns a ProjectContext with ts-morph Project and rootDir
- Created `extractFile()` that extracts all AST data from a single file:
  - File path and line count
  - Imports (with from, names, isTypeOnly, defaultName, namespaceImport)
  - Exports (with name, kind, isReExport)
  - Functions (with signature, params, returnType, isAsync, isExported, line numbers)
  - Classes (with methods, properties, extends, implements)
  - Interfaces (with properties)
- Created `storeExtracted()` to persist data in MangoDB with upsert behavior
- All 16 tests pass, linting passes

Note: Type resolution in ts-morph produces fully-qualified type names (with import paths).
This is acceptable for now and could be simplified in post-processing if needed.

### 2025-12-29 - Phase 1.2 Complete

Git extraction is complete. Implementation details:

- Created `extractGitInfo()` using simple-git that returns:
  - Commit count
  - Last modified date
  - Created date
  - Unique authors list
  - Primary author (most commits)
  - Recent commits (last 5 with hash, message, author, date)
- Added optional `git` field to ExtractedFile interface for integration
- All 22 tests pass, linting passes

Ready to begin Documentation extraction in Phase 1.3.

### 2025-12-29 - Code Review (Pre-Phase 1.3)

Conducted thorough code review before proceeding. Findings:

**Passing:**
- All 22 tests pass, linting is clean
- Full extraction pipeline works end-to-end
- Good separation of concerns (ast, git, db modules)
- Functional style maintained (functions over classes)

**Issues Fixed:**
1. `export const/let/var` statements were not being extracted
2. `export * from './module'` star exports were not being extracted

Both issues fixed by adding handlers in `extractFile()` for:
- Variable statements with export keyword
- Namespace exports (star exports)

**Acceptable Trade-offs:**
- `Function` interface name shadows global type (acceptable, scoped to module)
- Type resolution produces fully-qualified paths (can simplify in post-processing)
- Test suite takes ~7s due to ts-morph Project creation per test (acceptable for now)

### 2025-12-29 - Phase 1.3 Complete

Documentation extraction is complete. Implementation in `src/extractor/docs.ts`:

**JSDoc Extraction (1.3.1):**
- Extracts description, @param, @returns, @throws, @deprecated, @example, @see tags
- Works on functions, classes, and methods
- Uses ts-morph's `getJsDocs()` and `getTags()` APIs
- Flexible @param parsing supporting both `@param {Type} name - desc` and `@param name - desc`

**Inline Comments (1.3.2):**
- Extracts single-line `//` comments (not JSDoc)
- Associates comments with containing functions via `nearFunction` field
- Line-by-line regex parsing with URL filtering to avoid matching `://`

**README Extraction (1.3.3):**
- Case-insensitive detection of README.md files
- Returns raw markdown content or null if not found
- Uses Node.js `fs/promises` for async file reading

**TODO Comments (1.3.4):**
- Detects TODO, FIXME, HACK, XXX markers in comments
- Supports both `//` and `/* */` comment styles
- Extracts type, text, and line number

**Deprecations (1.3.5):**
- Extracts @deprecated from classes, methods, and functions
- Returns entity name, message, and line number
- Integrates with existing JSDoc extraction

**Storage Integration (1.3.6):**
- Created `DocsInfo` interface bundling all doc types
- Added `extractDocs()` function combining all extractors
- JSDoc mapped by entity name for easy lookup
- Added `docs?: DocsInfo` field to ExtractedFile interface

All 69 tests pass, linting passes. Ready for Phase 1.4 CLI Integration.
