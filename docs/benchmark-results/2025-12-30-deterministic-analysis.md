# Deterministic vs LLM Analysis

**Date**: 2025-12-30
**Context**: Follow-up to first benchmark run, analyzing which information gaps can be closed with code vs. requiring LLM.

---

## Key Insight

Most of what the Control agent found that Pith missed is **already in the AST** - Pith just isn't extracting it. The LLM should synthesize facts into prose, not discover the facts themselves.

---

## Information Type Analysis

| Information Type | Deterministic? | Method | Priority |
|------------------|:--------------:|--------|:--------:|
| Line numbers | ✅ Yes | `node.getStartLineNumber()` | **P0** |
| Code snippets | ✅ Yes | `node.getText()` | **P0** |
| Function signatures | ✅ Yes | Already in `raw.signature` | **P0** |
| Default parameter values | ✅ Yes | `param.getInitializer()` | P1 |
| Const/config values | ✅ Yes | Parse const declarations | P1 |
| Retry counts/timeouts | ✅ Yes | Find numeric literals in patterns | P1 |
| Error types caught | ✅ Yes | Parse catch clauses | P1 |
| Status codes checked | ✅ Yes | Find numeric literals in conditionals | P1 |
| Backoff formulas | ✅ Yes | Detect `Math.pow`/`**` patterns | P2 |
| Call graph | ✅ Yes | Track function calls in AST | P2 |
| Cyclomatic complexity | ✅ Yes | Count branches/loops | P2 |
| Data flow (structure) | ⚠️ Partial | Call graph + params deterministic | P2 |
| Data flow (narrative) | ❌ No | Requires synthesis | - |
| Priority/importance | ⚠️ Partial | Metrics deterministic, interpretation not | - |
| Why explanations | ❌ No | Requires understanding intent | - |
| Suggested changes | ❌ No | Requires understanding intent | - |

---

## Already Available in ts-morph (Not Surfaced)

```typescript
// All of these are available but not included in Pith output

// Line numbers
func.getStartLineNumber()           // → 431
func.getEndLineNumber()             // → 527

// Code snippets
func.getText()                      // → Full function source
func.getBody()?.getText()           // → Just the body

// Parameters with defaults
func.getParameters().map(p => ({
  name: p.getName(),                // → "timeout"
  type: p.getType().getText(),      // → "number"
  default: p.getInitializer()?.getText()  // → "30000"
}))

// Return type
func.getReturnType().getText()      // → "Promise<string>"

// Modifiers
func.isAsync()                      // → true
func.isExported()                   // → true
```

---

## Pattern Detection (Add to Extractor)

### 1. Retry Pattern Detection

```typescript
interface RetryPattern {
  detected: boolean;
  maxRetries?: number;
  backoffType?: 'none' | 'linear' | 'exponential';
  backoffFormula?: string;
  sleepCall?: string;
  location: { start: number; end: number };
}

function detectRetryPattern(func: FunctionDeclaration): RetryPattern | null {
  // Find for/while loops
  const loops = func.getDescendantsOfKind(SyntaxKind.ForStatement);

  // Find try/catch inside loops
  const tryCatches = func.getDescendantsOfKind(SyntaxKind.TryStatement);

  // Find sleep/delay calls
  const sleepCalls = func.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(c => /sleep|setTimeout|delay/.test(c.getText()));

  // Find maxRetries-like constants
  const retryVars = func.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .filter(v => /retry|attempt|max/i.test(v.getName()));

  // Detect exponential backoff: Math.pow(2, attempt) or 2 ** attempt
  const exponentialPattern = func.getText().match(/Math\.pow\s*\(\s*2\s*,|2\s*\*\*\s*attempt/);

  if (loops.length > 0 && tryCatches.length > 0) {
    return {
      detected: true,
      maxRetries: extractNumericConstant(retryVars[0]),
      backoffType: exponentialPattern ? 'exponential' : 'none',
      backoffFormula: exponentialPattern?.[0],
      location: { start: func.getStartLineNumber(), end: func.getEndLineNumber() }
    };
  }
  return null;
}
```

### 2. Error Handling Detection

```typescript
interface ErrorHandling {
  catches: Array<{
    errorType: string;
    lineNumber: number;
  }>;
  throws: Array<{
    errorType: string;
    lineNumber: number;
  }>;
  statusCodesChecked: number[];
  retryableConditions: string[];
}

function detectErrorHandling(func: FunctionDeclaration): ErrorHandling {
  const catches = func.getDescendantsOfKind(SyntaxKind.CatchClause);
  const throws = func.getDescendantsOfKind(SyntaxKind.ThrowStatement);

  // Find status code checks: status === 429, status >= 500, etc.
  const conditionals = func.getDescendantsOfKind(SyntaxKind.IfStatement);
  const statusChecks = conditionals
    .map(c => c.getExpression().getText())
    .filter(t => /status\s*(===|>=|<=|>|<)\s*\d{3}/.test(t));

  // Extract numeric status codes
  const statusCodes = statusChecks
    .flatMap(s => s.match(/\d{3}/g) || [])
    .map(Number);

  return {
    catches: catches.map(c => ({
      errorType: c.getVariableDeclaration()?.getType().getText() || 'Error',
      lineNumber: c.getStartLineNumber()
    })),
    throws: throws.map(t => ({
      errorType: extractThrowType(t),
      lineNumber: t.getStartLineNumber()
    })),
    statusCodesChecked: [...new Set(statusCodes)],
    retryableConditions: statusChecks
  };
}
```

### 3. Configuration Value Extraction

```typescript
interface ConfigValue {
  name: string;
  value: string | number | boolean;
  lineNumber: number;
  isDefault: boolean;  // true if it's a default param or fallback
}

function extractConfigValues(func: FunctionDeclaration): ConfigValue[] {
  const configs: ConfigValue[] = [];

  // Default parameters
  for (const param of func.getParameters()) {
    const init = param.getInitializer();
    if (init) {
      configs.push({
        name: param.getName(),
        value: evaluateLiteral(init),
        lineNumber: param.getStartLineNumber(),
        isDefault: true
      });
    }
  }

  // Const declarations with literals
  const consts = func.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .filter(v => v.getInitializer()?.getKind() === SyntaxKind.NumericLiteral);

  for (const c of consts) {
    configs.push({
      name: c.getName(),
      value: evaluateLiteral(c.getInitializer()!),
      lineNumber: c.getStartLineNumber(),
      isDefault: false
    });
  }

  // Nullish coalescing defaults: config.timeout ?? 30000
  const nullishDefaults = func.getText().matchAll(/(\w+)\s*\?\?\s*(\d+)/g);
  for (const match of nullishDefaults) {
    configs.push({
      name: match[1],
      value: Number(match[2]),
      lineNumber: findLineNumber(func, match.index!),
      isDefault: true
    });
  }

  return configs;
}
```

---

## Example: What Task 2 Should Have Produced

### Current Pith Output (prose only)
```json
"gotchas": [
  "The 'callLLM' function has retry logic but may still fail on persistent network issues"
]
```

### Ideal Pith Output (deterministic + prose)
```json
{
  "prose": {
    "summary": "Calls OpenRouter API with retry and timeout handling",
    "purpose": "...",
    "gotchas": ["May fail after 3 retries on persistent errors"]
  },
  "patterns": {
    "retry": {
      "detected": true,
      "maxRetries": 3,
      "backoffType": "exponential",
      "backoffFormula": "Math.pow(2, attempt) * 1000",
      "backoffDelays": ["2s", "4s", "8s"]
    },
    "errorHandling": {
      "retryableStatuses": [429, 500, 502, 503, 504],
      "retryableErrors": ["AbortError", "timeout", "network", "ECONNRESET"],
      "nonRetryable": ["4xx except 429"]
    },
    "timeout": {
      "default": 30000,
      "configurable": true,
      "implementation": "AbortController"
    }
  },
  "location": {
    "file": "src/generator/index.ts",
    "lines": "431-527",
    "function": "callLLM"
  }
}
```

---

## The Right Split

| Code Should Do | LLM Should Do |
|----------------|---------------|
| Extract facts (line numbers, values) | Turn facts into readable prose |
| Detect patterns (retry, error handling) | Explain why patterns exist |
| Compute metrics (complexity, fan-in) | Interpret what metrics mean |
| Build structure (call graph, deps) | Synthesize into narratives |
| Find locations (line numbers, files) | Prioritize what's important |

---

## Implementation Recommendations

### Phase 1: Surface Existing Data (P0)
- Add line numbers to function/class nodes
- Include code snippets for key exports
- Surface `raw.signature` in a readable format

### Phase 2: Add Pattern Detection (P1)
- Retry pattern detection
- Error handling summary
- Config value extraction
- Timeout/limit detection

### Phase 3: Enhanced Analysis (P2)
- Cyclomatic complexity per function
- Call graph within file
- Data flow tracking

### Phase 4: Smarter Prose (LLM)
- Feed deterministic facts to LLM
- LLM synthesizes into coherent narrative
- LLM explains "why" based on patterns detected

---

## Metrics for Success

After implementing deterministic extraction, re-run benchmark and measure:

1. **Completeness score** should increase (currently 1.8/5)
2. **Actionability score** should increase (currently 1.8/5)
3. **Details** in concrete examples should be present

Target: Pith should match Control on factual content, with LLM adding the synthesis layer.

---

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2025-12-30 | Initial analysis created | Claude |
