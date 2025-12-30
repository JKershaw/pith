# Benchmark Run: 2025-12-30

## Configuration
- **Repository**: Pith (self-benchmark)
- **Size**: 29 files, ~10k lines
- **Pith version**: ff7d51d
- **Model**: qwen/qwen-turbo (via OpenRouter)
- **Judge Model**: qwen/qwen-turbo

## Pipeline Metrics
| Stage | Time | Notes |
|-------|------|-------|
| Extraction | 9s | 29 files extracted |
| Build | 2s | 29 file, 57 function, 10 module nodes |
| Generation | 135s | 39 nodes generated (files + modules) |
| **Total** | 146s | |

- Nodes created: 29 file, 57 function, 10 module
- Estimated cost: ~$1.04

---

## Task Results

### Task 1: Architecture Overview
**Task**: "What are the main components of this codebase and how do they interact?"

| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | 4/5 | 5/5 |
| Completeness | 3/5 | 5/5 |
| Accuracy | 5/5 | 5/5 |
| Efficiency | 3/5 | 2/5 |
| Actionability | 2/5 | 5/5 |
| **Total** | **17/25** | **22/25** |

- Pith tokens: ~2,200 (22 nodes)
- Control tokens: ~4,500
- Winner: **Control**
- Notes: Control provided comprehensive pipeline diagram, phase breakdowns, and data flow explanations. Pith provided module summaries but lacked implementation details.

---

### Task 2: Extraction Caching System
**Task**: "How does the extraction caching system work?"

| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | 3/5 | 5/5 |
| Completeness | 2/5 | 5/5 |
| Accuracy | 4/5 | 5/5 |
| Efficiency | 2/5 | 4/5 |
| Actionability | 2/5 | 5/5 |
| **Total** | **13/25** | **24/25** |

- Pith tokens: ~1,500 (3 nodes)
- Control tokens: ~3,000
- Winner: **Control**
- Notes: Control showed actual cache JSON format, invalidation triggers, --force flag implementation, and fault tolerance. Pith had function signatures but lacked implementation flow.

---

### Task 3: Builder Node Structure Impact
**Task**: "What files would be affected if I changed the node structure in builder?"

| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | 3/5 | 5/5 |
| Completeness | 2/5 | 5/5 |
| Accuracy | 4/5 | 5/5 |
| Efficiency | 2/5 | 4/5 |
| Actionability | 3/5 | 5/5 |
| **Total** | **14/25** | **24/25** |

- Pith tokens: ~3,500 (7 nodes)
- Control tokens: ~2,800
- Winner: **Control**
- Notes: Pith showed dependents list and "Widely used" warnings. Control provided interface definitions, property access counts per module, and MUST vs SHOULD change categorization.

---

### Task 4: Prose Generation Debugging
**Task**: "Why might prose generation be slow or fail?"

| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | 2/5 | 5/5 |
| Completeness | 2/5 | 5/5 |
| Accuracy | 5/5 | 5/5 |
| Efficiency | 3/5 | 4/5 |
| Actionability | 2/5 | 5/5 |
| **Total** | **14/25** | **24/25** |

- Pith tokens: ~2,800 (5 nodes)
- Control tokens: ~4,200
- Winner: **Control**
- Notes: Pith showed function signatures and general gotchas. Control identified 11 specific failure points with timeout values, retry logic, backoff formulas, and error handling paths.

---

### Task 5: Adding New Edge Type
**Task**: "How would I add a new edge type to the graph?"

| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | 3/5 | 5/5 |
| Completeness | 2/5 | 5/5 |
| Accuracy | 5/5 | 5/5 |
| Efficiency | 2/5 | 4/5 |
| Actionability | 2/5 | 5/5 |
| **Total** | **14/25** | **24/25** |

- Pith tokens: ~4,000 (10 nodes)
- Control tokens: ~3,200
- Winner: **Control**
- Notes: Pith showed builder functions and edge-related code. Control provided 7-step implementation guide with exact line numbers, code patterns, and integration points.

---

## Summary

| Metric | Pith | Control |
|--------|------|---------|
| Average score | 14.4/25 | 23.6/25 |
| Win/Loss/Tie | 0-5-0 | 5-0-0 |

### Score Breakdown by Criterion

| Criterion | Pith Avg | Control Avg | Gap |
|-----------|----------|-------------|-----|
| Relevance | 3.0 | 5.0 | -2.0 |
| Completeness | 2.2 | 5.0 | -2.8 |
| Accuracy | 4.6 | 5.0 | -0.4 |
| Efficiency | 2.4 | 3.6 | -1.2 |
| Actionability | 2.2 | 5.0 | -2.8 |

### Observations
- **Accuracy is Pith's strength**: High accuracy scores (4.6/5) show the LLM-generated prose is factually correct
- **Completeness is the biggest gap**: Pith provides summaries but misses implementation details needed for tasks
- **Actionability gap**: Control provides step-by-step guides; Pith provides descriptions but not workflows
- **Efficiency trade-off**: Pith is more concise but lacks depth needed for the tasks

---

## Information Gap Analysis

### Information Type Comparison

| Information Type | Pith | Control | Gap Severity |
|------------------|:----:|:-------:|:------------:|
| Module/file names | ✅ | ✅ | None |
| One-line summary | ✅ | ✅ | None |
| Purpose description | ✅ | ✅ | None |
| Gotchas/warnings | ✅ | ✅ | Minor |
| Key exports list | ✅ | ⚠️ | None |
| Import relationships | ✅ | ✅ | None |
| Fan-in/fan-out metrics | ✅ | ❌ | None (Pith advantage) |
| Git metadata | ❌ | ⚠️ | Minor |
| **Line numbers** | ❌ | ✅ | **Critical** |
| **Code snippets** | ⚠️ | ✅ | **Critical** |
| Function signatures | ✅ | ✅ | None |
| **Specific variable/config values** | ❌ | ✅ | **High** |
| **Implementation details** | ❌ | ✅ | **Critical** |
| **Error handling logic** | ❌ | ✅ | **High** |
| Data flow explanation | ⚠️ | ✅ | High |
| Priority/criticality ranking | ⚠️ | ✅ | Medium |
| Test file locations | ✅ | ✅ | None |
| **Step-by-step guides** | ❌ | ✅ | **Critical** |

**Legend**: ✅ = Provided, ⚠️ = Partial, ❌ = Missing

### Concrete Examples

#### Example: Task 4 (Debugging)
| Detail | Pith Said | Control Said | Gap |
|--------|-----------|--------------|-----|
| Timeout value | Not mentioned | "30 seconds default" with code | Critical |
| Retry count | Not mentioned | "3 retries with 2s, 4s, 8s backoff" | Critical |
| Rate limit handling | Not mentioned | "HTTP 429 triggers retry" | High |
| Worst-case time | Not mentioned | "104 seconds calculation" | High |

#### Example: Task 5 (Modification)
| Detail | Pith Said | Control Said | Gap |
|--------|-----------|--------------|-----|
| Edge type location | Not mentioned | "builder/index.ts:14-18" | Critical |
| Implementation steps | Functions listed | 7-step guide with code | Critical |
| Test pattern | Not mentioned | "builder/index.test.ts:1145-1149" | High |

---

## Priority Improvements

Based on the gap analysis, prioritized improvements for Pith:

### Critical (Must Address)
1. **Include line numbers in output** - Control won on actionability because agents could navigate directly to code
2. **Show code snippets in context** - Function signatures alone don't show implementation logic
3. **Generate step-by-step modification guides** - For modification tasks, procedural guidance is essential

### High Priority
4. **Extract and display configuration values** - Timeouts, retry counts, URLs are critical for debugging
5. **Include error handling paths** - Show try/catch structure and error propagation
6. **Show implementation flow, not just structure** - Data flow and call sequences

### Medium Priority
7. **Provide priority/criticality rankings** - "Start here" guidance for complex tasks
8. **Include example code in Quick Start** - Currently too abstract

---

## Next Steps

1. **Phase 6.6 continuation**: Enhanced deterministic extraction is already adding code snippets and key statements - verify these appear in output
2. **Prompt refinement**: Update LLM prompts to generate more procedural, actionable guidance
3. **Context bundling**: Consider including more related nodes for task-specific queries
4. **Re-benchmark**: After improvements, run same 5 tasks to measure progress
