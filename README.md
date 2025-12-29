# Pith

A codebase wiki optimized for LLM consumption.

## The Problem

LLM coding agents can read code but lack understanding. They don't know why code is shaped the way it is, what patterns exist, what broke last time, or what the original authors intended.

This context exists—scattered across code structure, git history, comments, and commit messages—but isn't accessible in a useful form.

## What Pith Does

Pith extracts facts from your codebase and synthesizes them into prose that LLMs can consume effectively.

```
Codebase → Extract (deterministic) → Build nodes → Generate prose (LLM) → Serve via API
```

The key insight: documentation, comments, and commit messages aren't stored separately—they're ingredients the LLM synthesizes into coherent explanations. The wiki doesn't mirror what exists; it compresses and clarifies it.

## Quick Start

```bash
# Install
npm install -g pith

# Extract facts from a TypeScript codebase
pith extract ./my-project

# Build the node graph
pith build

# Generate prose for nodes (uses LLM)
pith generate

# Start the API server
pith serve
```

## API

```bash
# Get context for a specific file
curl http://localhost:3000/node/src/auth/login.ts

# Get bundled context for multiple files (useful for task injection)
curl "http://localhost:3000/context?files=src/auth/login.ts,src/auth/session.ts"

# Trigger re-extraction after code changes
curl -X POST http://localhost:3000/refresh
```

## What You Get

For each node (file, function, module), Pith provides:

- **Summary**: One-line description
- **Purpose**: Why this exists, what problem it solves
- **Gotchas**: Things that have broken before, non-obvious behavior, coupling

Plus structured metadata: complexity, churn, authors, dependencies.

## Use Cases

- **Task context injection**: Include relevant Pith context in LLM prompts
- **Onboarding**: New developers (human or AI) can understand unfamiliar code
- **Code review**: Understand the history and intent behind code you're reviewing
- **Refactoring**: Know what depends on what before making changes

## Status

This is an early-stage project validating an idea. Currently supports TypeScript codebases only.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the build plan.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — How the system works
- [Concepts](docs/CONCEPTS.md) — Nodes, edges, fractal structure
- [Extraction](docs/EXTRACTION.md) — What data is extracted from code and git
- [Roadmap](docs/ROADMAP.md) — Build phases and milestones
- [Technical Decisions](docs/TECHNICAL_DECISIONS.md) — Key choices and rationale
