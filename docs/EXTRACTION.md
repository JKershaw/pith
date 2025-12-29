# Extraction Data Reference

Complete inventory of data extracted from a codebase. Each item is implemented and tested individually.

## AST Data (ts-morph)

Data extracted by parsing TypeScript source files.

| # | Data Point | Type | Description | Example |
|---|------------|------|-------------|---------|
| A1 | File path | `string` | Relative path from project root | `src/auth/login.ts` |
| A2 | Line count | `number` | Total lines in file | `142` |
| A3 | Imports | `Import[]` | Import statements | `[{ from: './session', names: ['createSession'] }]` |
| A4 | Exports | `Export[]` | Exported declarations | `[{ name: 'login', kind: 'function' }]` |
| A5 | Functions | `Function[]` | Function declarations | `[{ name: 'login', signature: '(user: User) => Promise<Session>' }]` |
| A6 | Classes | `Class[]` | Class declarations | `[{ name: 'AuthService', methods: [...] }]` |
| A7 | Interfaces | `Interface[]` | Interface/type definitions | `[{ name: 'User', properties: [...] }]` |
| A8 | Function parameters | `Param[]` | Parameter names and types | `[{ name: 'user', type: 'User' }]` |
| A9 | Return types | `string` | Function return types | `Promise<Session>` |
| A10 | Async markers | `boolean` | Whether function is async | `true` |

### Type Definitions

```typescript
interface Import {
  from: string;           // Module path
  names: string[];        // Named imports
  defaultName?: string;   // Default import name
  isTypeOnly: boolean;    // import type { ... }
}

interface Export {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'default';
  isReExport: boolean;    // export { x } from './y'
}

interface Function {
  name: string;
  signature: string;      // Full signature as string
  params: Param[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  startLine: number;
  endLine: number;
}

interface Param {
  name: string;
  type: string;
  isOptional: boolean;
  defaultValue?: string;
}

interface Class {
  name: string;
  methods: Function[];
  properties: Property[];
  isExported: boolean;
  extends?: string;
  implements?: string[];
}

interface Interface {
  name: string;
  properties: Property[];
  isExported: boolean;
}

interface Property {
  name: string;
  type: string;
  isOptional: boolean;
}
```

---

## Git Data (simple-git)

Data extracted from git history.

| # | Data Point | Type | Description | Example |
|---|------------|------|-------------|---------|
| G1 | Commit count | `number` | Total commits touching this file | `23` |
| G2 | Last modified | `Date` | Date of most recent commit | `2024-01-15T10:30:00Z` |
| G3 | Created date | `Date` | Date file was first added | `2023-06-01T09:00:00Z` |
| G4 | Authors | `string[]` | Unique commit authors | `['alice@example.com', 'bob@example.com']` |
| G5 | Recent commits | `Commit[]` | Last N commit messages | `[{ message: 'Fix session timeout', ... }]` |
| G6 | Primary author | `string` | Author with most commits | `alice@example.com` |

### Type Definitions

```typescript
interface GitInfo {
  commitCount: number;
  lastModified: Date;
  createdAt: Date;
  authors: string[];
  primaryAuthor: string;
  recentCommits: Commit[];
}

interface Commit {
  hash: string;
  message: string;
  author: string;
  date: Date;
}
```

### Deferred (Post-MVP)

| # | Data Point | Description |
|---|------------|-------------|
| G7 | Blame data | Line-by-line authorship |
| G8 | Co-changes | Files that change together |
| G9 | Churn rate | Change frequency over time |

---

## Documentation Data

Data extracted from comments and documentation files.

| # | Data Point | Type | Description | Example |
|---|------------|------|-------------|---------|
| D1 | JSDoc comments | `JSDoc` | Structured doc comments | `{ description: '...', params: [...] }` |
| D2 | Inline comments | `string[]` | Comments near code | `['// Handle edge case for expired tokens']` |
| D3 | README content | `string` | Per-directory README.md | `'# Auth Module\n\nHandles...'` |
| D4 | TODO comments | `Todo[]` | TODO/FIXME markers | `[{ text: 'Refactor this', line: 42 }]` |
| D5 | Deprecation markers | `string[]` | @deprecated tags | `['Use newLogin() instead']` |

### Type Definitions

```typescript
interface JSDoc {
  description: string;
  params: JSDocParam[];
  returns?: string;
  throws?: string[];
  examples?: string[];
  deprecated?: string;
  see?: string[];
}

interface JSDocParam {
  name: string;
  type: string;
  description: string;
}

interface Todo {
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  text: string;
  line: number;
}

interface InlineComment {
  text: string;
  line: number;
  nearFunction?: string;  // Function this comment is inside/near
}
```

---

## Computed/Derived Data

Data computed from the above during the build phase.

| # | Data Point | Type | Computed From | Description |
|---|------------|------|---------------|-------------|
| C1 | Fan-in | `number` | Import graph | How many files import this |
| C2 | Fan-out | `number` | Imports (A3) | How many files this imports |
| C3 | Age (days) | `number` | Created date (G3) | Days since creation |
| C4 | Recency (days) | `number` | Last modified (G2) | Days since last change |

### Deferred (Post-MVP)

| # | Data Point | Description |
|---|------------|-------------|
| C5 | Cyclomatic complexity | Branch/decision count |
| C6 | Cognitive complexity | Nesting and control flow |
| C7 | Hotspot score | High churn + high complexity |
| C8 | Coupling score | Dependency density |

---

## Extracted Document Schema

The complete structure stored in MangoDB `extracted` collection:

```typescript
interface ExtractedFile {
  // Identity
  path: string;

  // AST data (A1-A10)
  lines: number;
  imports: Import[];
  exports: Export[];
  functions: Function[];
  classes: Class[];
  interfaces: Interface[];

  // Git data (G1-G6)
  git: GitInfo;

  // Documentation (D1-D5)
  docs: {
    jsdoc: Map<string, JSDoc>;  // function name -> JSDoc
    inlineComments: InlineComment[];
    readme?: string;
    todos: Todo[];
    deprecations: string[];
  };

  // Metadata
  extractedAt: Date;
}
```

---

## Implementation Order

Each data point is implemented in sequence. Complete one before starting the next.

### Phase 1a: AST Extraction
1. A1: File path
2. A2: Line count
3. A3: Imports
4. A4: Exports
5. A5: Functions (basic)
6. A6: Classes (basic)
7. A7: Interfaces
8. A8: Function parameters
9. A9: Return types
10. A10: Async markers

### Phase 1b: Git Extraction
1. G1: Commit count
2. G2: Last modified
3. G3: Created date
4. G4: Authors
5. G5: Recent commits
6. G6: Primary author

### Phase 1c: Documentation Extraction
1. D1: JSDoc comments
2. D2: Inline comments
3. D3: README content
4. D4: TODO comments
5. D5: Deprecation markers

### Phase 2: Computed Data
1. C1: Fan-in
2. C2: Fan-out
3. C3: Age
4. C4: Recency
