# Development Progress

Tracks completed steps and notes from implementation.

## Current Phase: 1.1 AST Extraction

### Status
- **Last completed step**: 1.0.9 - Set up MangoDB connection helper
- **Next step**: 1.1.1 - File discovery

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
