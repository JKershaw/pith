# Pith Testing & Validation Plan

**Goal**: Systematically evaluate Pith's accuracy, performance, and utility across progressively larger codebases, producing a final report on current status and practical value.

**Approach**: Test against real repos of increasing size, query the generated wiki, and compare results against a control agent with direct code access. Update notes incrementally as each phase completes.

---

## Success Criteria

1. **Accuracy**: Pith-assisted answers match or exceed control agent accuracy on code understanding questions
2. **Efficiency**: Pith-assisted answers use fewer tokens than control agent exploration
3. **Correctness**: Extracted metadata (authors, dates, imports) matches ground truth
4. **Scalability**: Pipeline completes in reasonable time for repos up to 100k lines

---

## Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| Extraction time | Seconds per 1k lines of code | <5s |
| Build time | Total node graph construction | <30s for 50k lines |
| Generation cost | Actual vs estimated LLM cost | Within 20% |
| Query accuracy | Judge score (1-5) for answer quality | ≥4.0 average |
| Token efficiency | Pith tokens / Control tokens | <0.5 |
| Metadata accuracy | % correct git attribution | ≥95% |

---

## Phase 1: Self-Test (Pith on Pith)

**Repo**: This repository (~8k lines)
**Purpose**: Baseline validation, verify pipeline works end-to-end

### 1.1 Pipeline Execution
- [ ] Run full pipeline: `extract → build → generate`
- [ ] Record timing and cost
- [ ] Verify all nodes created with prose

### 1.2 Metadata Validation
- [ ] Sample 5 files, compare extracted git data to `git log`
- [ ] Verify import graph matches actual imports
- [ ] Check fanIn/fanOut calculations

### 1.3 Query Testing (5 questions)
Questions designed to test different aspects:
1. "What is the purpose of the cache system in extraction?"
2. "How does the node builder decide what gets its own node?"
3. "What are the gotchas when modifying the prose generator?"
4. "Who is the primary author of the API server code?"
5. "How are the extractor modules related to each other?"

**Method**:
- Control agent: Full code access, explore freely
- Pith agent: Wiki context only (no direct file reads)
- Judge: Score both answers 1-5, explain reasoning

### Phase 1 Notes
```
Status: NOT STARTED
Date:
Duration:
Extraction time:
Build time:
Generation cost (estimated):
Generation cost (actual):
Nodes created:

Metadata validation results:
- File 1:
- File 2:
- File 3:
- File 4:
- File 5:

Query results:
| Q# | Control Score | Pith Score | Control Tokens | Pith Tokens | Notes |
|----|---------------|------------|----------------|-------------|-------|
| 1  |               |            |                |             |       |
| 2  |               |            |                |             |       |
| 3  |               |            |                |             |       |
| 4  |               |            |                |             |       |
| 5  |               |            |                |             |       |

Observations:

Issues found:
```

---

## Phase 2: Small External Repo

**Repo**: commander.js or similar (~15-25k lines)
**Purpose**: Test on unfamiliar codebase, validate extraction handles different patterns

### 2.1 Pipeline Execution
- [ ] Clone and run full pipeline
- [ ] Compare timing to Phase 1 (should scale ~linearly)
- [ ] Check for extraction errors or warnings

### 2.2 Edge Case Validation
- [ ] Verify handling of: re-exports, barrel files, namespace imports
- [ ] Check module detection for nested directories
- [ ] Validate git history with multiple authors

### 2.3 Query Testing (5 questions)
Questions about the external repo's architecture:
1. "What is the main entry point and how does command parsing work?"
2. "How are subcommands registered and executed?"
3. "What validation happens on command options?"
4. "What are the extension points for customization?"
5. "How has the API evolved based on recent commits?"

### Phase 2 Notes
```
Status: NOT STARTED
Repo URL:
Repo size (lines):
Date:
Duration:

Pipeline metrics:
- Extraction time:
- Build time:
- Generation cost (estimated):
- Generation cost (actual):
- Nodes created:
- Errors/warnings:

Edge case results:
- Re-exports handled:
- Barrel files:
- Namespace imports:
- Module detection:
- Multi-author attribution:

Query results:
| Q# | Control Score | Pith Score | Control Tokens | Pith Tokens | Notes |
|----|---------------|------------|----------------|-------------|-------|
| 1  |               |            |                |             |       |
| 2  |               |            |                |             |       |
| 3  |               |            |                |             |       |
| 4  |               |            |                |             |       |
| 5  |               |            |                |             |       |

Observations:

Issues found:
```

---

## Phase 3: Medium Repo

**Repo**: Zod, Fastify, or similar (~40-60k lines)
**Purpose**: Test scalability, memory usage, and prose coherence at scale

### 3.1 Pipeline Execution
- [ ] Run with `--estimate` first to predict cost
- [ ] Execute full pipeline, monitor memory
- [ ] Time each stage separately

### 3.2 Coherence Testing
- [ ] Read 3 module-level summaries - do they accurately represent children?
- [ ] Check that related nodes reference each other appropriately
- [ ] Verify gotchas mention real complexity (not generic warnings)

### 3.3 Query Testing (5 questions)
1. High-level architecture question
2. Specific function behavior question
3. Cross-module relationship question
4. Historical context question (why something changed)
5. Gotcha/pitfall discovery question

### Phase 3 Notes
```
Status: NOT STARTED
Repo URL:
Repo size (lines):
Date:
Duration:

Pipeline metrics:
- Extraction time:
- Build time:
- Estimation accuracy:
- Generation cost (actual):
- Peak memory usage:
- Nodes created:

Coherence assessment:
- Module 1 summary quality (1-5):
- Module 2 summary quality (1-5):
- Module 3 summary quality (1-5):
- Cross-references appropriate:
- Gotchas specific vs generic:

Query results:
| Q# | Control Score | Pith Score | Control Tokens | Pith Tokens | Notes |
|----|---------------|------------|----------------|-------------|-------|
| 1  |               |            |                |             |       |
| 2  |               |            |                |             |       |
| 3  |               |            |                |             |       |
| 4  |               |            |                |             |       |
| 5  |               |            |                |             |       |

Observations:

Issues found:
```

---

## Phase 4: Large Repo

**Repo**: Express, TypeORM, or similar (~80-120k lines)
**Purpose**: Stress test, identify performance bottlenecks, test selective generation

### 4.1 Pipeline Execution
- [ ] Run extraction only, measure time/memory
- [ ] Build graph, check for performance issues
- [ ] Use `--node` to generate prose for subset only (cost control)

### 4.2 Selective Generation Test
- [ ] Generate prose for 10% of nodes (most imported files)
- [ ] Query using partial wiki - does it still help?
- [ ] Compare cost vs full generation

### 4.3 Query Testing (5 questions)
Focus on questions that require understanding scale:
1. "What are the core abstractions in this codebase?"
2. "How do the main subsystems interact?"
3. "What are the most critical files to understand?"
4. "What patterns are used consistently across the codebase?"
5. "Where would I start to add feature X?"

### Phase 4 Notes
```
Status: NOT STARTED
Repo URL:
Repo size (lines):
Date:
Duration:

Pipeline metrics:
- Extraction time:
- Build time:
- Full generation estimate:
- Selective generation (10%):
- Peak memory usage:
- Total nodes:
- Nodes with prose:

Selective generation effectiveness:
- Partial wiki still useful:
- Coverage of key files:
- Cost savings:

Query results:
| Q# | Control Score | Pith Score | Control Tokens | Pith Tokens | Notes |
|----|---------------|------------|----------------|-------------|-------|
| 1  |               |            |                |             |       |
| 2  |               |            |                |             |       |
| 3  |               |            |                |             |       |
| 4  |               |            |                |             |       |
| 5  |               |            |                |             |       |

Observations:

Issues found:
```

---

## Phase 5: Incremental Update Testing

**Repo**: Use Phase 1 repo (Pith itself)
**Purpose**: Validate staleness detection and incremental regeneration

### 5.1 Modification Tests
- [ ] Modify one function → verify only that node marked stale
- [ ] Add new file → verify extraction picks it up
- [ ] Delete file → verify node removed from graph
- [ ] Modify file heavily → verify cache invalidation works

### 5.2 Regeneration Efficiency
- [ ] After changes, regenerate only stale nodes
- [ ] Compare cost to full regeneration
- [ ] Verify updated prose reflects changes

### Phase 5 Notes
```
Status: NOT STARTED
Date:
Duration:

Staleness detection:
- Function modification detected:
- New file detected:
- Deleted file handled:
- Cache invalidation correct:

Regeneration metrics:
- Stale nodes after changes:
- Regeneration cost:
- Full regen cost (for comparison):
- Savings:

Observations:

Issues found:
```

---

## Testing Methodology Details

### Subagent Comparison Protocol

For each query test:

1. **Control Agent Setup**
   - Full repository access via file system
   - Can use grep, glob, read tools freely
   - No Pith context provided
   - Prompt: "Answer this question about the codebase: {question}"

2. **Pith Agent Setup**
   - Pith wiki context injected (relevant nodes for the question)
   - Limited/no direct file access (or access to confirm only)
   - Prompt: "Using this context about the codebase, answer: {question}\n\nContext:\n{pith_context}"

3. **Judge Agent Scoring**
   - Receives: question, both answers, (optionally) ground truth
   - Scores each answer 1-5:
     - 5: Completely accurate, insightful, actionable
     - 4: Accurate with minor omissions
     - 3: Mostly accurate but missing key details
     - 2: Partially accurate, some errors
     - 1: Incorrect or unhelpful
   - Provides reasoning for scores
   - Notes any hallucinations or factual errors

### LLM Call Efficiency

To minimize costs while testing thoroughly:

1. **Batch context retrieval**: Get all relevant nodes for a question set at once
2. **Reuse wikis**: Generate wiki once per repo, reuse across all questions
3. **Use appropriate models**:
   - Haiku for judge scoring (cheap, fast)
   - Sonnet for control/pith agents (balance of quality/cost)
4. **Sample strategically**: 5 diverse questions per phase, not exhaustive
5. **Incremental testing**: Don't regenerate entire wiki for each test run

### Ground Truth Sources

When available, validate against:
- README.md and existing documentation
- GitHub issues mentioning specific code
- Commit messages explaining changes
- `git blame` for authorship

---

## Final Report Structure

After all phases complete, compile findings into:

### 1. Executive Summary
- Overall utility assessment (1-2 paragraphs)
- Key metrics summary table
- Recommendation (ready for use / needs work / specific improvements)

### 2. Accuracy Analysis
- Aggregate query scores across all phases
- Breakdown by question type
- Common failure modes identified

### 3. Performance Analysis
- Scaling characteristics (time/memory vs repo size)
- Cost analysis (actual vs projected at scale)
- Bottleneck identification

### 4. Quality Assessment
- Prose coherence evaluation
- Gotcha usefulness
- Metadata accuracy

### 5. Recommendations
- Immediate fixes needed
- Enhancements for consideration
- Suggested next steps

---

## Appendix: Test Questions Bank

### Architecture Questions
- "What are the main components/modules of this codebase?"
- "How does data flow through the system?"
- "What are the extension points?"

### Specific Behavior Questions
- "What does function X do and when is it called?"
- "What are the parameters and return type of Y?"
- "What side effects does Z have?"

### Relationship Questions
- "How are files A, B, and C related?"
- "What depends on module X?"
- "What would break if I changed Y?"

### Historical Questions
- "Why was this code structured this way?"
- "What changed in the last few commits?"
- "Who wrote this and when?"

### Gotcha Questions
- "What should I watch out for when modifying X?"
- "Are there any known issues with Y?"
- "What assumptions does Z make?"

---

## Change Log

| Date | Phase | Change | Author |
|------|-------|--------|--------|
|      |       |        |        |

