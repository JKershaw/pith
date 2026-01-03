# Plan: Add Concurrency Limiter for Parallel Prose Generation

## Overview

Add parallel LLM calls to the `pith generate` command using a custom concurrency limiter utility, avoiding external dependencies like `p-limit`.

## Current State

- **Location**: `src/cli/index.ts:602-644`
- **Behavior**: Sequential `for...of` loop processing nodes one at a time
- **Constraint**: Module nodes depend on file node summaries (fractal generation)

## Design Decisions

### Concurrency Limit Default: 5
- OpenRouter rate limits vary by plan, 5 is conservative
- Configurable via `--concurrency` flag for users with higher limits
- The existing retry logic (3 attempts, exponential backoff) handles occasional 429s

### Two-Phase Approach
File nodes must complete before module nodes start (module prose needs child summaries). Within each phase, nodes are processed in parallel.

---

## Implementation Plan

### Step 1: Create Concurrency Limiter Utility

**File**: `src/utils/concurrency.ts` (new file)

```typescript
/**
 * Creates a concurrency limiter that restricts parallel async operations
 * @param concurrency - Maximum number of concurrent operations
 * @returns A limit function that wraps async operations
 */
export function createConcurrencyLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  async function limit<T>(fn: () => Promise<T>): Promise<T> {
    // If at capacity, wait in queue
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount++;
    try {
      return await fn();
    } finally {
      activeCount--;
      // Release next waiting task
      const next = queue.shift();
      if (next) next();
    }
  }

  return limit;
}
```

**Test file**: `src/utils/concurrency.test.ts`
- Test concurrent execution respects limit
- Test queue ordering (FIFO)
- Test error propagation doesn't break the queue
- Test all tasks complete even with failures

### Step 2: Add CLI Option for Concurrency

**File**: `src/cli/index.ts`

Add option to generate command (around line 490):
```typescript
.option('-c, --concurrency <number>', 'Max concurrent LLM calls', '5')
```

Parse and validate in action handler:
```typescript
const concurrency = Math.max(1, Math.min(20, parseInt(options.concurrency) || 5));
```

### Step 3: Refactor Generate Command for Parallel Execution

**File**: `src/cli/index.ts` (lines 594-644)

Replace the sequential loop with two-phase parallel processing:

```typescript
import { createConcurrencyLimiter } from '../utils/concurrency.ts';

// ... inside action handler ...

const limit = createConcurrencyLimiter(concurrency);
const proseResults = new Map<string, ProseData>();
let generated = 0;
const generationErrors: Array<{ nodeId: string; error: Error | PithError }> = [];

// Helper for processing a single node
async function processNode(
  node: WikiNode,
  childSummaries?: Map<string, string>
): Promise<void> {
  try {
    log(`  Generating: ${node.id}`, 'verbose');
    const prose = await generateProse(node, generatorConfig, { childSummaries });
    proseResults.set(node.id, prose);
    await updateNodeWithProse(db, node.id, prose);
    generated++;
    log(`    ✓ ${node.id}`, 'verbose');
  } catch (error) {
    // ... existing error handling ...
    generationErrors.push({ nodeId: node.id, error: wrappedError });
  }
}

// Phase 1: Process all file nodes in parallel
log(`Phase 1: Generating prose for ${fileNodes.length} file nodes (concurrency: ${concurrency})...`);
await Promise.all(
  fileNodes.map((node) => limit(() => processNode(node)))
);

// Phase 2: Process module nodes in parallel (now have child summaries)
log(`Phase 2: Generating prose for ${moduleNodes.length} module nodes...`);
await Promise.all(
  moduleNodes.map((node) => limit(async () => {
    // Gather child summaries from Phase 1 results + existing DB
    const childIds = node.edges.filter((e) => e.type === 'contains').map((e) => e.target);
    const childSummaries = new Map<string, string>();

    for (const childId of childIds) {
      // Check in-memory results first
      const inMemory = proseResults.get(childId);
      if (inMemory?.summary) {
        childSummaries.set(childId, inMemory.summary);
      } else {
        // Fall back to database (for pre-existing prose)
        const dbNode = await nodesCollection.findOne({ id: childId });
        if (dbNode?.prose?.summary) {
          childSummaries.set(childId, dbNode.prose.summary);
        }
      }
    }

    await processNode(node, childSummaries);
  }))
);
```

### Step 4: Update Progress Reporting

Current progress (every 5 nodes) won't work well with parallelism. Options:

**Option A: Atomic counter with periodic logging**
```typescript
let generated = 0;
const totalNodes = fileNodes.length + moduleNodes.length;

// In processNode success path:
generated++;
if (generated % 5 === 0 || generated === totalNodes) {
  log(`Progress: ${generated}/${totalNodes} nodes`);
}
```

**Option B: Log on completion of each node** (simpler, more verbose)
```typescript
log(`  ✓ ${node.id} (${generated}/${totalNodes})`);
```

Recommend **Option A** for cleaner output.

### Step 5: Export from Main Index

**File**: `src/index.ts`

Add export:
```typescript
export * from './utils/concurrency.ts';
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/utils/concurrency.ts` | **NEW** | Concurrency limiter utility (~25 lines) |
| `src/utils/concurrency.test.ts` | **NEW** | Tests for concurrency limiter (~80 lines) |
| `src/cli/index.ts` | **MODIFY** | Add --concurrency option, refactor generate loop |
| `src/index.ts` | **MODIFY** | Export new utility |

---

## Testing Strategy

### Unit Tests (concurrency.test.ts)
1. **Respects limit**: Start 10 tasks with limit 3, verify only 3 run at once
2. **Queue order**: Tasks complete in FIFO order when queued
3. **Error handling**: One task throwing doesn't break others
4. **Completion**: All tasks eventually complete
5. **Edge cases**: Limit of 1 (sequential), limit > task count

### Integration Tests (cli.test.ts additions)
1. **Parallel generation**: Mock LLM, verify concurrent calls
2. **Two-phase ordering**: Module nodes don't start until file nodes done
3. **--concurrency flag**: Respects custom concurrency value
4. **Error collection**: Errors from parallel tasks all captured

### Manual Testing
```bash
# Test with small concurrency
pith generate --concurrency 2 --verbose

# Test with higher concurrency
pith generate --concurrency 10

# Verify rate limit handling still works
pith generate --concurrency 20  # May trigger 429s, should retry
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Rate limiting (429 errors) | Default concurrency of 5 is conservative; existing retry logic handles occasional 429s |
| Memory pressure with many nodes | Map only stores summaries (small strings), not full prose |
| Database write contention | MangoDB handles concurrent writes; each node updates different doc |
| Progress counter race conditions | JavaScript is single-threaded; `generated++` is atomic |

---

## Future Considerations (Not in Scope)

- **Streaming progress**: Show real-time updates with a progress bar
- **Resume on failure**: Track which nodes succeeded to enable resumption
- **Adaptive concurrency**: Reduce concurrency when rate limited
- **Function nodes**: Currently skipped; could be parallelized with files

---

## Estimated Scope

- **New code**: ~120 lines (utility + tests)
- **Modified code**: ~50 lines in CLI
- **Complexity**: Low - straightforward async patterns
