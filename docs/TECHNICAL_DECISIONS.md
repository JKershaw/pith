# Technical Decisions

Key choices made and why.

## Language: TypeScript

**Decision**: Build Pith in TypeScript.

**Rationale**:
- First-class TypeScript codebase support (dogfooding)
- ts-morph works natively
- Type safety for complex node/edge structures
- Familiar to target audience (TS developers)

**Trade-offs**:
- Limits to JS/TS ecosystem
- Could be faster in Rust/Go (acceptable for MVP)

---

## AST Parsing: ts-morph

**Decision**: Use ts-morph for TypeScript AST parsing.

**Rationale**:
- High-level API over TypeScript compiler
- Handles complex TS features (generics, decorators, etc.)
- Well-maintained, widely used
- Can resolve imports and navigate symbol references

**Alternatives considered**:
- Raw TypeScript compiler API: Too low-level, verbose
- Babel: Better for transforms, worse for analysis
- Tree-sitter: Faster, but less TypeScript-specific

---

## Git: simple-git

**Decision**: Use simple-git for git operations.

**Rationale**:
- Wraps git CLI (works everywhere git works)
- Simple promise-based API
- Handles all operations we need (log, blame, show)

**Alternatives considered**:
- nodegit: Libgit2 bindings, faster but complex setup
- isomorphic-git: Pure JS, but slower and some edge cases

---

## Storage: MangoDB

**Decision**: Use MangoDB for storage throughout development and MVP.

**What it is**: MangoDB is a file-based MongoDB replacement. "SQLite is to SQL as MangoDB is to MongoDB." It provides the same API as MongoDB's official driver but persists data as JSON files on disk.

**Rationale**:
- Zero setup required (no Docker, no database service)
- MongoDB-compatible API from day one
- Human-readable JSON files for debugging
- Seamless switch to production MongoDB later (change one import)
- Sufficient for codebases under 10,000 documents

**Usage**:
```typescript
import { MangoClient } from '@jkershaw/mangodb';

const client = new MangoClient('./data');
await client.connect();

const db = client.db('pith');
const nodes = db.collection<WikiNode>('nodes');

await nodes.insertOne(fileNode);
const node = await nodes.findOne({ path: 'src/auth/login.ts' });
```

**Migration to MongoDB**: When scaling beyond MangoDB's limits, change the import to MongoDB's official driver. The API is identical.

**Alternatives considered**:
- Raw JSON files: No querying capability
- SQLite: Less natural for document-shaped data
- Full MongoDB from start: Unnecessary setup complexity for MVP

---

## LLM: On-Demand Generation

**Decision**: Generate prose on-demand, not preemptively.

**Rationale**:
- Avoids upfront cost for nodes that may never be read
- Faster iteration during development
- Users control when they incur LLM costs
- Stale detection + regeneration handles changes

**Trade-offs**:
- First access to a node is slow
- Could add optional pre-generation later

---

## LLM Provider: Anthropic Claude

**Decision**: Default to Claude, but support abstraction.

**Rationale**:
- Strong at code understanding
- Good at following structured output instructions
- Familiar to target users (Claude Code users)

**Implementation**:
- Abstract behind provider interface
- Config specifies provider + model
- Easy to add OpenAI, local models later

---

## API: Express

**Decision**: Use Express for HTTP API.

**Rationale**:
- Simple, well-known
- Minimal overhead
- Easy to add middleware (CORS, auth if needed)
- Sufficient for simple REST endpoints

**Alternatives considered**:
- Fastify: Faster, but adds learning curve
- Hono: Modern, but less ecosystem
- tRPC: Type-safe, but overkill for simple endpoints

---

## CLI: Commander

**Decision**: Use commander for CLI parsing.

**Rationale**:
- Most popular Node.js CLI framework
- Simple API
- Auto-generated help
- Subcommand support (extract, build, generate, serve)

---

## Node Granularity: Files as Atoms

**Decision**: Files are the smallest guaranteed node type.

**Rationale**:
- Files are natural boundaries in most codebases
- Stable identifiers (paths don't change often)
- Match how developers think about code
- Functions are optional nodes (only when significant)

**Trade-offs**:
- May miss important function-level detail
- Heuristics needed for "significant" functions

---

## Edge Computation: Static Analysis

**Decision**: Compute edges statically from imports/exports.

**Rationale**:
- Deterministic and fast
- Works without running code
- Covers 80% of meaningful relationships

**Trade-offs**:
- Misses dynamic imports
- Can't trace runtime call graphs
- May miss dependency injection patterns

**Mitigation**: Co-change analysis (future) catches relationships static analysis misses.

---

## Prose Structure: Summary + Purpose + Gotchas

**Decision**: Three-part prose structure for every node.

**Rationale**:
- **Summary**: Quick scan, one line
- **Purpose**: Understanding context, why it exists
- **Gotchas**: Prevent mistakes, capture tribal knowledge

This covers the main questions developers ask:
- What is this? (summary)
- Why does it exist? (purpose)
- What could go wrong? (gotchas)

---

## Fractal Generation: Bottom-Up

**Decision**: Generate prose bottom-up (functions → files → modules).

**Rationale**:
- Higher-level summaries can reference lower-level ones
- Reduces token usage (don't re-explain children)
- More coherent overall narrative
- Natural dependency order

**Trade-offs**:
- Must generate all children before parents
- Partial generation leaves gaps

---

## Staleness: Time-Based

**Decision**: Detect staleness by comparing timestamps.

**Rationale**:
- Simple to implement
- Works without tracking fine-grained changes
- Conservative (may regenerate unnecessarily, but won't miss changes)

**Future improvement**: Content hashing for more precise invalidation.

---

## Scope: TypeScript Only (MVP)

**Decision**: Support only TypeScript codebases initially.

**Rationale**:
- Focus on one thing done well
- ts-morph provides excellent TypeScript support
- Most target users (Claude Code) work in TypeScript
- Multi-language adds significant complexity

**Migration path**: Abstract parser interface, add language-specific implementations later.

---

## Testing Strategy

**Decision**: Integration tests over unit tests for extraction.

**Rationale**:
- Extraction is I/O heavy (files, git)
- Mocking file systems is brittle
- Real codebases reveal edge cases
- Test against fixture repositories

**Unit tests for**:
- Node building logic
- Edge computation
- Prose parsing
- API routes
