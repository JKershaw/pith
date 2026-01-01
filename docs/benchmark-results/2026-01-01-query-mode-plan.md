# Benchmark Plan: 2026-01-01 (Query Mode Self-Test)

## Purpose

This is the **first benchmark to use Query Mode** (Phase 7 `/query` endpoint). This run will establish baseline metrics for the end-to-end query pipeline, measuring both file selection quality and answer synthesis.

## Configuration

| Parameter    | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| Repository   | Pith (self-test)                                                  |
| Size         | ~22k lines, ~45 source files                                      |
| Pith version | ea528e7                                                           |
| Model        | qwen/qwen-turbo (via OPENROUTER_MODEL)                            |
| Tasks        | 15 (all tasks from task bank - 3 per category)                    |
| Mode         | **Query Mode** (`POST /query`) - first time using this evaluation |

## Tasks to Evaluate

### Architecture Tasks (A1-A3)

- A1: "What are the main components of this codebase and how do they interact?"
- A2: "Explain the data flow from file input to wiki output."
- A3: "What design patterns are used in this codebase?"

### Specific Behavior Tasks (B1-B3)

- B1: "How does the extraction cache determine if a file needs re-extraction?"
- B2: "How does buildPrompt construct LLM prompts for different node types?"
- B3: "What is the retry logic in the LLM client and what triggers a retry?"

### Relationship Tasks (R1-R3)

- R1: "What files would be affected if I changed the WikiNode interface?"
- R2: "How do the API routes connect to the database layer?"
- R3: "What are all the consumers of the extractFile function?"

### Debugging Tasks (D1-D3)

- D1: "Generation completes but some nodes have empty prose. What should I investigate?"
- D2: "Why might the generate command be slow?"
- D3: "API returns 404 for a file that exists. What could cause this?"

### Modification Tasks (M1-M3)

- M1: "How would I add support for JavaScript (.js) files in addition to TypeScript?"
- M2: "How would I add rate limiting to the API endpoints?"
- M3: "I want to add a 'complexity' field to WikiNode. What files need changes?"

## Expected Duration

| Stage       | Estimated Time |
| ----------- | -------------- |
| Extraction  | ~15-20s        |
| Build       | ~3-5s          |
| Generation  | ~4-5 min       |
| Serve + API | ~5s startup    |
| Evaluation  | ~30-45 min     |
| **Total**   | ~40-55 min     |

## Cost Estimate

| Component            | Estimated Cost |
| -------------------- | -------------- |
| Prose generation     | ~$0.50-1.00    |
| Query LLM calls (30) | ~$0.30-0.50    |
| Judge evaluations    | ~$0.20-0.30    |
| **Total**            | ~$1.00-1.80    |

## Evaluation Approach

### Pith: Query Mode

For each task:

1. Send `POST /query` with the task question
2. Record: files selected, candidates considered, answer, reasoning, timing
3. Evaluate file selection precision/recall
4. Score answer on: Correctness, Completeness, Specificity, Conciseness

### Control: Direct Exploration

For each task:

1. Spawn subagent with Glob, Grep, Read tools
2. Time limit: 2 minutes
3. Gather context and synthesize answer
4. Record: files explored, tokens, time

### Judge: Comparative Evaluation

- Use Query Mode judge prompt from BENCHMARKING.md
- Score both Pith and Control answers
- Identify file selection quality gaps

## Success Criteria

Given this is the first Query Mode benchmark:

- Establish baseline metrics for file selection precision/recall
- Compare answer quality vs Context Mode baseline (73% from previous run)
- Identify query types where Query Mode excels vs struggles
- Document LLM call patterns and token usage

## Notes

- Previous Context Mode benchmarks achieved ~73% Pith score vs ~96% Control
- Query Mode adds file selection step - may impact overall scores
- Focus on identifying where automatic file selection improves/hurts results
