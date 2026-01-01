# Pith Benchmarking Plan

**Purpose**: Regularly evaluate Pith's context quality against direct code exploration, producing comparable metrics across runs.

**When to run**: After significant changes to extraction, building, or generation logic.

---

## Overview

This benchmark compares two approaches to generating context for an LLM coding task:

| Approach    | Description                                            |
| ----------- | ------------------------------------------------------ |
| **Pith**    | Query the pre-built wiki for relevant nodes            |
| **Control** | Subagent explores codebase directly (grep, glob, read) |

Both are given the same task prompt. An LLM judge scores the resulting context on multiple criteria.

### Evaluation Modes

Pith supports two evaluation modes:

| Mode             | Endpoint                 | What It Measures                                         |
| ---------------- | ------------------------ | -------------------------------------------------------- |
| **Context Mode** | `GET /context?files=...` | Quality of pre-selected context                          |
| **Query Mode**   | `POST /query`            | End-to-end capability: file selection + answer synthesis |

**Context Mode** (original): Manually select relevant files, compare raw context quality. Isolates context from LLM synthesis.

**Query Mode** (Phase 7+): Ask natural language questions, Pith automatically selects files and generates answers. Measures full pipeline effectiveness.

---

## Benchmark Setup

### 1. Select Test Repository

Choose a repo based on the benchmark goal:

| Size   | Lines   | Example Repos       | Use Case              |
| ------ | ------- | ------------------- | --------------------- |
| Small  | <10k    | Pith itself, day.js | Quick regression test |
| Medium | 10-50k  | Zod, Commander      | Standard benchmark    |
| Large  | 50-150k | Express, Fastify    | Scale testing         |

**Requirements**:

- TypeScript codebase (Pith's current scope)
- Public repo with meaningful git history
- Not previously used for training/tuning

### 2. Build the Wiki

```bash
# Clone if external repo
git clone <repo-url> /tmp/benchmark-repo
cd /tmp/benchmark-repo

# Run full pipeline with timing
time pith extract .
time pith build
time pith generate

# Record metrics
pith generate --estimate  # For cost tracking
```

Record in results:

- Extraction time
- Build time
- Generation time
- Node count (file/function/module)
- Estimated cost

### 3. Prepare Test Tasks

**Run ALL 15 tasks from the task bank** (see Appendix A) for comprehensive evaluation. This ensures:

- Statistical significance across task types
- Consistent comparison between benchmark runs
- Complete coverage of Pith's strengths and weaknesses

Tasks are organized into 5 categories with 3 tasks each:

- [ ] 3 architecture/overview tasks (A1-A3)
- [ ] 3 specific behavior tasks (B1-B3)
- [ ] 3 cross-module relationship tasks (R1-R3)
- [ ] 3 debugging/investigation tasks (D1-D3)
- [ ] 3 modification planning tasks (M1-M3)

**Note**: For quick regression tests, a 5-task subset (one per category) may be used, but full benchmarks should always run all 15 tasks.

---

## Test Execution

### For Each Task

#### Step 1: Pith Context Generation

Choose your evaluation mode:

#### Option A: Query Mode (Recommended for Phase 7+)

```bash
# Ask the question directly - Pith selects files and generates answer
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "<task question>"}'
```

Record:

- `filesUsed` - which files the planner selected
- `candidatesConsidered` - how many files were pre-filtered
- `answer` - the synthesized answer
- `reasoning` - why those files were selected
- Time to respond

#### Option B: Context Mode (For context-only comparison)

```bash
# Manually identify relevant files for the task
curl "http://localhost:3000/context?files=<relevant-files>"
```

Record:

- Which nodes were retrieved
- Total token count of context
- Time to retrieve

#### Step 2: Control Agent Exploration

Spawn a subagent with:

- Full filesystem access to the repo
- Tools: Glob, Grep, Read
- No Pith access
- Time limit: 2 minutes
- Instruction: "Gather context to answer this task. Return the context you would provide to a coding agent."

Record:

- Files explored
- Total tokens of context gathered
- Time taken

#### Step 3: Judge Evaluation

Send both contexts to the judge with the scoring rubric.

#### Step 4: Information Gap Analysis

After all tasks are judged, compile an information gap analysis comparing what each approach provided. This is critical for identifying specific improvements to Pith.

**Judge Prompt**:

```text
You are evaluating context quality for an LLM coding task.

TASK: {task_description}

CONTEXT A (Pith):
{pith_context}

CONTEXT B (Control):
{control_context}

Score each context on these criteria (1-5 scale):

1. RELEVANCE: Does the context address the task directly?
   1=Off-topic, 5=Precisely targeted

2. COMPLETENESS: Does it include all necessary information?
   1=Major gaps, 5=Comprehensive

3. ACCURACY: Is the information factually correct?
   1=Contains errors, 5=Fully accurate

4. EFFICIENCY: Is it concise without unnecessary content?
   1=Bloated/noisy, 5=Lean and focused

5. ACTIONABILITY: Could an agent act on this immediately?
   1=Needs more research, 5=Ready to implement

Respond in this format:
CONTEXT_A_SCORES: [relevance, completeness, accuracy, efficiency, actionability]
CONTEXT_B_SCORES: [relevance, completeness, accuracy, efficiency, actionability]
CONTEXT_A_TOTAL: <sum>
CONTEXT_B_TOTAL: <sum>
WINNER: A|B|TIE
REASONING: <2-3 sentences explaining the key differences>
```

---

## Scoring Criteria Detail

### Relevance (1-5)

| Score | Description                                        |
| ----- | -------------------------------------------------- |
| 5     | Every piece of context directly addresses the task |
| 4     | Mostly relevant, minor tangential information      |
| 3     | Mix of relevant and irrelevant content             |
| 2     | Mostly tangential, some relevant pieces            |
| 1     | Context doesn't address the task                   |

### Completeness (1-5)

| Score | Description                                   |
| ----- | --------------------------------------------- |
| 5     | All information needed to complete the task   |
| 4     | Minor details missing, core info present      |
| 3     | Key information present but gaps exist        |
| 2     | Significant gaps, would need more exploration |
| 1     | Critical information missing                  |

### Accuracy (1-5)

| Score | Description                               |
| ----- | ----------------------------------------- |
| 5     | All facts verifiable and correct          |
| 4     | Minor inaccuracies that don't affect task |
| 3     | Some errors but core facts correct        |
| 2     | Multiple errors affecting understanding   |
| 1     | Factually incorrect or misleading         |

### Efficiency (1-5)

| Score | Description                     |
| ----- | ------------------------------- |
| 5     | Minimal tokens, maximum signal  |
| 4     | Concise with minor redundancy   |
| 3     | Moderate bloat or repetition    |
| 2     | Significant unnecessary content |
| 1     | Mostly noise, buried signal     |

### Actionability (1-5)

| Score | Description                            |
| ----- | -------------------------------------- |
| 5     | Agent could start coding immediately   |
| 4     | Minor clarification needed             |
| 3     | Would need some additional exploration |
| 2     | Significant unknowns remain            |
| 1     | Cannot proceed without more context    |

---

## Query Mode Scoring (Phase 7+)

When using Query Mode, additional metrics should be captured:

### File Selection Quality

| Metric              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| **Precision**       | What % of selected files were actually relevant?     |
| **Recall**          | What % of relevant files were selected?              |
| **Selection count** | How many files did the planner select (target: 3-8)? |

### Answer Quality

Score the synthesized answer on these criteria:

| Criterion        | Description                              |
| ---------------- | ---------------------------------------- |
| **Correctness**  | Is the answer factually accurate? (1-5)  |
| **Completeness** | Does it fully answer the question? (1-5) |
| **Specificity**  | Does it cite file:line references? (1-5) |
| **Conciseness**  | Is it appropriately brief? (1-5)         |

### End-to-End Metrics

| Metric          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| **Total time**  | Pre-filter + planner LLM + prose generation + synthesis LLM   |
| **LLM calls**   | Number of API calls made (typically 2: planner + synthesizer) |
| **Token usage** | Input + output tokens across all LLM calls                    |

### Query Mode Judge Prompt

```text
You are evaluating an answer generated by a codebase Q&A system.

QUESTION: {question}

ANSWER PROVIDED:
{pith_answer}

FILES USED: {files_used}
REASONING: {reasoning}

GROUND TRUTH (Control explored directly):
{control_answer}

Score the answer on these criteria (1-5 scale):

1. CORRECTNESS: Is the answer factually accurate?
   1=Major errors, 5=Fully correct

2. COMPLETENESS: Does it fully answer the question?
   1=Missing critical info, 5=Comprehensive

3. SPECIFICITY: Does it cite specific files, functions, line numbers?
   1=Vague, 5=Precise references

4. CONCISENESS: Is it appropriately brief without unnecessary content?
   1=Rambling/bloated, 5=Focused and efficient

Respond in this format:
SCORES: [correctness, completeness, specificity, conciseness]
TOTAL: <sum>/20
FILE_SELECTION: <assessment of which files were chosen>
NOTES: <2-3 sentences on key observations>
```

---

## Results Template

Copy this template for each benchmark run:

```markdown
## Benchmark Run: [DATE]

### Configuration

- **Repository**: [name] ([url])
- **Size**: [X] files, ~[Y]k lines
- **Pith version**: [commit hash]
- **Model**: [model used for generation]

### Pipeline Metrics

| Stage      | Time | Notes |
| ---------- | ---- | ----- |
| Extraction | Xs   |       |
| Build      | Xs   |       |
| Generation | Xs   |       |
| **Total**  | Xs   |       |

- Nodes created: [X] file, [Y] function, [Z] module
- Estimated cost: $[X.XX]

### Task Results

#### Task 1: [Task description]

**Context Mode** (if used):
| Criterion | Pith | Control |
|-----------|------|---------|
| Relevance | /5 | /5 |
| Completeness | /5 | /5 |
| Accuracy | /5 | /5 |
| Efficiency | /5 | /5 |
| Actionability | /5 | /5 |
| **Total** | /25 | /25 |

- Pith tokens: [X]
- Control tokens: [X]
- Winner: [Pith/Control/Tie]
- Notes: [Judge reasoning]

**Query Mode** (if used):
| Criterion | Pith | Control |
|-----------|------|---------|
| Correctness | /5 | /5 |
| Completeness | /5 | /5 |
| Specificity | /5 | /5 |
| Conciseness | /5 | /5 |
| **Total** | /20 | /20 |

- Files selected: [list]
- Candidates considered: [X]
- Time: [X]s
- File selection quality: [assessment]
- Notes: [observations]

[Repeat for Tasks 2-5]

### Summary

| Metric            | Pith  | Control |
| ----------------- | ----- | ------- |
| Average score     | /25   | /25     |
| Total tokens used |       |         |
| Win/Loss/Tie      | X-Y-Z | Y-X-Z   |

### Observations

- [Key findings]
- [Regressions from previous run]
- [Improvements noted]

### Issues Found

1. [Issue description]

---

## Information Gap Analysis

This section identifies specific information types that each approach provides.

### Information Type Comparison

| Information Type                | Pith | Control | Gap Severity |
| ------------------------------- | :--: | :-----: | :----------: |
| Module/file names               |      |         |              |
| One-line summary                |      |         |              |
| Purpose description             |      |         |              |
| Gotchas/warnings                |      |         |              |
| Key exports list                |      |         |              |
| Import relationships            |      |         |              |
| Fan-in/fan-out metrics          |      |         |              |
| Git metadata                    |      |         |              |
| Line numbers                    |      |         |              |
| Code snippets                   |      |         |              |
| Function signatures             |      |         |              |
| Specific variable/config values |      |         |              |
| Implementation details          |      |         |              |
| Error handling logic            |      |         |              |
| Data flow explanation           |      |         |              |
| Priority/criticality ranking    |      |         |              |
| Test file locations             |      |         |              |
| Suggested changes               |      |         |              |

**Legend**: ✅ = Provided, ⚠️ = Partial, ❌ = Missing
**Gap Severity**: None, Minor, Medium, High, Critical

### Concrete Examples

For 1-2 tasks, provide specific before/after comparisons:

#### Example: [Task Name]

| Detail            | Pith Said            | Control Said            | Gap               |
| ----------------- | -------------------- | ----------------------- | ----------------- |
| [specific detail] | [what Pith provided] | [what Control provided] | [gap description] |

### Priority Improvements

Based on the gap analysis, list specific improvements for Pith:

1. **Critical**: [gaps that must be addressed]
2. **High**: [gaps that significantly impact usefulness]
3. **Medium**: [gaps that would improve experience]
```

---

## Appendix A: Task Bank

When benchmarking Pith itself (self-test), use the Pith-specific versions below. When benchmarking external repos, adapt the generic versions to that codebase.

### Architecture Tasks (A1-A3)

| ID  | Pith Self-Test Version                                                    | Generic Version                                              |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A1  | "What are the main components of this codebase and how do they interact?" | Same                                                         |
| A2  | "Explain the data flow from file input to wiki output."                   | "Explain the data flow from user input to database storage." |
| A3  | "What design patterns are used in this codebase?"                         | Same                                                         |

### Specific Behavior Tasks (B1-B3)

| ID  | Pith Self-Test Version                                                   | Generic Version                                                       |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| B1  | "How does the extraction cache determine if a file needs re-extraction?" | "Explain the caching strategy used in [module]."                      |
| B2  | "How does buildPrompt construct LLM prompts for different node types?"   | "What happens when [specific function] is called with invalid input?" |
| B3  | "What is the retry logic in the LLM client and what triggers a retry?"   | "How does the authentication middleware validate tokens?"             |

### Relationship Tasks (R1-R3)

| ID  | Pith Self-Test Version                                              | Generic Version                                                    |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R1  | "What files would be affected if I changed the WikiNode interface?" | "What files would be affected if I changed the User model schema?" |
| R2  | "How do the API routes connect to the database layer?"              | Same                                                               |
| R3  | "What are all the consumers of the extractFile function?"           | "What are all the consumers of [specific utility function]?"       |

### Debugging Tasks (D1-D3)

| ID  | Pith Self-Test Version                                                             | Generic Version                                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| D1  | "Generation completes but some nodes have empty prose. What should I investigate?" | "A user reports [symptom]. What files should I investigate?" |
| D2  | "Why might the generate command be slow?"                                          | "Why might [specific operation] be slow?"                    |
| D3  | "API returns 404 for a file that exists. What could cause this?"                   | "What could cause [error type] in the [module] code?"        |

### Modification Tasks (M1-M3)

| ID  | Pith Self-Test Version                                                          | Generic Version                                                   |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| M1  | "How would I add support for JavaScript (.js) files in addition to TypeScript?" | "What's involved in adding support for [new feature]?"            |
| M2  | "How would I add rate limiting to the API endpoints?"                           | Same                                                              |
| M3  | "I want to add a 'complexity' field to WikiNode. What files need changes?"      | "I want to add a new field to [entity]. What files need changes?" |

---

## Appendix B: Automation Notes

For regular benchmarking, consider:

1. **Scripted pipeline timing**:

```bash
#!/bin/bash
START=$(date +%s)
pith extract "$1"
EXTRACT_TIME=$(($(date +%s) - START))
# ... etc
```

2. **Judge API calls**: Use OpenRouter API directly for consistent scoring

3. **Results tracking**: Append to a CSV or JSON file for trend analysis

4. **CI integration**: Run small benchmark on PR merge to detect regressions

---

## Revision History

| Date       | Change                                                             | Author |
| ---------- | ------------------------------------------------------------------ | ------ |
| 2025-12-30 | Initial benchmarking plan created                                  | Claude |
| 2025-12-30 | Added Information Gap Analysis section to template                 | Claude |
| 2025-12-30 | Updated to require all 15 tasks; added Pith-specific task versions | Claude |
| 2026-01-01 | Added Query Mode for Phase 7 `/query` endpoint benchmarking        | Claude |
