# Concepts

## The Core Idea

LLMs can read code, but reading isn't understanding. When you read `auth.ts`, you see what it does. You don't see:

- Why it's structured this way (it used to be three files, consolidated after a bug)
- What patterns it follows (same approach as `billing.ts`, intentionally)
- What breaks when you touch it (the session handler is tightly coupled)
- What the author intended (see commit message from 6 months ago)

This context exists in the codebase—in git history, comments, commit messages, code structure—but it's scattered and implicit.

Pith makes it explicit.

## Nodes

A **node** is a unit of understanding. Each node represents something in the codebase that deserves its own explanation.

### Node Types

| Type | Represents | Example |
|------|------------|---------|
| `file` | Single source file | `src/auth/login.ts` |
| `function` | Exported function | `validateToken()` |
| `module` | Directory/package | `src/auth/` |

Future types (post-MVP):
| Type | Represents | Example |
|------|------------|---------|
| `domain` | Logical grouping | "Authentication" (spans auth/, session/, tokens/) |
| `concept` | Cross-cutting pattern | "Error handling" (same pattern across domains) |
| `collection` | Group of similar nodes | "All API handlers" |

### What Gets a Node?

Not everything deserves a node. Heuristics:

**Files**: Every `.ts` file gets a node. Files are the atomic unit.

**Functions**: Only exported functions that are either:
- Complex (cyclomatic complexity > threshold)
- Widely used (imported by 3+ files)
- Important (explicitly marked or in critical path)

**Modules**: Directories that either:
- Have an `index.ts` (explicit module boundary)
- Contain 3+ related files (implicit module)

The goal is signal, not completeness. A 10-line utility function doesn't need its own node.

## Edges

**Edges** are relationships between nodes. They answer: "What connects to what?"

### Edge Types

| Type | Meaning | Example |
|------|---------|---------|
| `contains` | Parent has child | module → file, file → function |
| `imports` | A depends on B | `login.ts` imports `session.ts` |
| `calls` | A invokes B | `login()` calls `validateToken()` |

Future types (post-MVP):
| Type | Meaning | Example |
|------|---------|---------|
| `co-changes` | Often modified together | `api.ts` and `types.ts` change in same commits |

Edges have optional **weight** (0-1) indicating strength. An import used once vs. used everywhere.

## Raw vs. Prose

Each node has two kinds of content:

### Raw

Deterministic facts extracted from the codebase:
- Function signature
- JSDoc comments
- Inline comments
- Import/export list
- Recent commit messages
- Metrics (lines, complexity, churn)

Raw extraction is fast, reproducible, and doesn't require an LLM.

### Prose

LLM-synthesized understanding:
- **Summary**: One-line description of what this is
- **Purpose**: Why it exists, what problem it solves
- **Gotchas**: Non-obvious behavior, historical context, coupling warnings

Prose is generated on-demand and cached. It becomes stale when the underlying code changes.

## Fractal Structure

Understanding is fractal. You can zoom in or out:

```
Domain: "Authentication"
  └── Module: src/auth/
        ├── File: login.ts
        │     ├── Function: login()
        │     └── Function: validateCredentials()
        └── File: session.ts
              └── Function: createSession()
```

Prose generates bottom-up:
1. Functions get summaries from their signatures + comments
2. Files get summaries from their functions + structure
3. Modules get summaries from their files + README
4. Domains get summaries from their modules + patterns

This enables both detailed and high-level understanding from the same source.

## Staleness

Prose can become stale when code changes. Pith tracks this:

```typescript
prose: {
  summary: "Handles user login flow",
  generatedAt: "2024-01-15T10:00:00Z",
  stale: true  // Code changed since generation
}
```

Staleness is detected by comparing:
- File modification time vs. `generatedAt`
- Git commit history since generation
- Changes to dependencies (if imports change, prose may be stale)

Stale prose is still returned (better than nothing) but flagged. Re-run `pith generate` to refresh.

## Context Bundling

The real value is context for tasks. When an LLM needs to work on `login.ts`, it helps to know:

- What `login.ts` does (the node itself)
- What it depends on (`session.ts`, `crypto.ts`)
- What depends on it (reverse imports)
- The parent module context (`src/auth/`)
- Any relevant gotchas

The `/context` API bundles this automatically:

```bash
GET /context?files=src/auth/login.ts
```

Returns formatted context ready for injection into a prompt.

## Extraction vs. Synthesis

A key design principle: **separate deterministic extraction from LLM synthesis**.

**Extraction** is:
- Fast (seconds)
- Reproducible (same input → same output)
- Free (no API costs)
- Run frequently (on every change)

**Synthesis** is:
- Slow (minutes for large codebases)
- Variable (LLM output differs between runs)
- Costly (API calls)
- Run selectively (only stale nodes)

This separation means you can extract constantly and synthesize on-demand.

## Node Schema

Full TypeScript interface for reference:

```typescript
interface WikiNode {
  id: string
  type: 'file' | 'function' | 'module' | 'domain' | 'concept' | 'collection'
  path: string
  name: string

  metadata: {
    lines?: number
    complexity?: number
    commits: number
    lastModified: Date
    authors: string[]
    churn?: number      // How often this changes
    fanIn?: number      // How many things depend on this
    fanOut?: number     // How many things this depends on
  }

  edges: {
    type: 'contains' | 'imports' | 'calls' | 'co-changes' | 'parent'
    target: string      // ID of target node
    weight?: number     // Strength of relationship (0-1)
  }[]

  raw: {
    signature?: string
    jsdoc?: string
    inlineComments?: string[]
    imports?: string[]
    exports?: string[]
    recentCommits?: { message: string; date: Date; author: string }[]
    readme?: string
  }

  prose?: {
    summary: string
    purpose: string
    gotchas: string[]
    generatedAt: Date
    stale: boolean
  }
}
```
