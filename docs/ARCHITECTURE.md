# Architecture

Pith has four main stages: extraction, node building, prose generation, and serving.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Codebase                                │
│                     (TypeScript repo)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     1. EXTRACTION                               │
│                    (deterministic)                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   AST        │  │   Git        │  │   Docs       │          │
│  │   Parser     │  │   Analyzer   │  │   Extractor  │          │
│  │              │  │              │  │              │          │
│  │ • files      │  │ • commits    │  │ • JSDoc      │          │
│  │ • functions  │  │ • authors    │  │ • comments   │          │
│  │ • classes    │  │ • history    │  │ • READMEs    │          │
│  │ • imports    │  │ • churn      │  │              │          │
│  │ • exports    │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     2. NODE BUILDER                             │
│                      (heuristic)                                │
│                                                                 │
│  • Creates nodes for files, functions, modules                  │
│  • Creates edges (contains, imports, calls)                     │
│  • Decides what deserves its own node                           │
│  • Outputs: nodes.json                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   3. PROSE GENERATOR                            │
│                    (LLM, on-demand)                             │
│                                                                 │
│  • Synthesizes summary, purpose, gotchas                        │
│  • Builds fractally: file → module → domain                     │
│  • Caches prose on node, flags staleness                        │
│  • Outputs: nodes.json (enriched with prose)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         4. API                                  │
│                                                                 │
│  GET  /node/:path      → Single node with prose                 │
│  GET  /context?files=  → Bundled context for task injection     │
│  POST /refresh         → Trigger re-extraction                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Extractor (`pith extract`)

Runs deterministically over the codebase. No LLM calls. Produces raw facts.

**AST Parser** (ts-morph):
- Parses every `.ts` file
- Extracts: file paths, function/class declarations, signatures, imports, exports
- Captures source locations for later reference

**Git Analyzer** (simple-git):
- Reads commit history
- Extracts: commit messages, authors, dates, files changed
- Computes per-file metrics: commit count, last modified, contributors

**Docs Extractor**:
- Extracts JSDoc comments from functions/classes
- Captures inline comments near complex logic
- Reads README files in each directory

Output: `extracted/` directory with JSON files for AST data, git data, and docs.

### Node Builder (`pith build`)

Transforms raw extraction into a navigable graph.

**Node creation rules**:
- Every `.ts` file gets a `file` node
- Exported functions get `function` nodes if complex or widely imported
- Directories with `index.ts` or 3+ files get `module` nodes

**Edge creation**:
- `contains`: module → files, file → functions
- `imports`: file → file (based on import statements)

Output: `nodes.json` with all nodes and edges, no prose yet.

### Prose Generator (`pith generate`)

Calls LLM to synthesize human-readable prose from raw facts.

**For each node**, sends to LLM:
- Signature/structure
- JSDoc and comments
- Recent commit messages
- Import/export relationships
- README content (for modules)

**LLM produces**:
- `summary`: One-line description
- `purpose`: Why this exists
- `gotchas`: Non-obvious behavior, past breakages, coupling warnings

**Fractal generation**:
- File nodes generated first
- Module summaries synthesized from child file summaries
- This enables coherent high-level understanding

Output: `nodes.json` updated with `prose` field on each node.

### API Server (`pith serve`)

Express server exposing the node graph.

**`GET /node/:path`**
Returns single node with all metadata and prose.

**`GET /context?files=a,b,c`**
Returns bundled context for multiple files. Useful for injecting into LLM task prompts. Includes:
- Requested nodes
- Immediate dependencies
- Parent modules
- Formatted for LLM consumption

**`POST /refresh`**
Triggers re-extraction and rebuild. Marks affected prose as stale.

## Data Flow Example

1. User runs `pith extract ./my-project`
2. Extractor parses all `.ts` files, reads git history, extracts comments
3. Raw data saved to `extracted/`
4. User runs `pith build`
5. Node builder creates graph from raw data
6. Graph saved to `nodes.json`
7. User runs `pith generate`
8. Prose generator calls LLM for each node
9. `nodes.json` updated with prose
10. User runs `pith serve`
11. API serves nodes to LLM agents via HTTP

## File Structure

```
pith/
├── src/
│   ├── cli/              # CLI commands
│   │   ├── extract.ts
│   │   ├── build.ts
│   │   ├── generate.ts
│   │   └── serve.ts
│   ├── extractor/        # Deterministic extraction
│   │   ├── ast.ts
│   │   ├── git.ts
│   │   └── docs.ts
│   ├── builder/          # Node graph construction
│   │   └── index.ts
│   ├── generator/        # LLM prose synthesis
│   │   └── index.ts
│   ├── api/              # Express routes
│   │   └── index.ts
│   └── types/            # Shared TypeScript types
│       └── index.ts
├── extracted/            # Raw extraction output (gitignored)
├── nodes.json            # Built node graph (gitignored)
└── pith.config.json      # Project configuration
```

## Configuration

`pith.config.json`:
```json
{
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```
