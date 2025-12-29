# Development Progress

Tracks completed steps and notes from implementation.

## Current Phase: 1.3 Documentation Extraction

### Status
- **Last completed step**: 1.2.7 - Store git data in MangoDB
- **Next step**: 1.3.1 - JSDoc extraction

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
