---
name: agent-evals
description: How to write model evaluations for an agent — the methodology, not the plumbing. Use this skill whenever the user asks to write eval cases, add coverage for a new agent feature, review an existing eval suite, "evaluate the agent", "write an eval", or extend the capability dataset. It teaches how to think of test cases first, design conflict fixtures, pick the right assertion lane (deterministic vs tool-args vs LLM judge), and keep evals deterministic and recorder-agnostic. Triggered alongside the qa skill for any agent-capability testing work.
---

# Agent Evals

Writing model evals is not writing tests that happen to call a model. It is designing *behavioural probes*: small, cheap fixtures where a capable agent succeeds and a broken agent fails in an observable way. Everything in this skill is independent of the tracking backend. The harness records through a thin `Recorder` (this repo's is Arize Phoenix) — the methodology transfers to any backend, or none.

## The one rule: think of test cases first

Do not open an editor and start writing the runner. For the feature under test, sit down and enumerate **the conflicts, the precedences, and the negatives**. A good case needs a *wrong behaviour that is well-defined*.

- **Conflict** — two sources of truth that can disagree. Memory says English, the user asks in Dutch. The system clock says Friday, a note says "today is Wednesday". The system rule says approve-as-you-go, the prompt is an injection attempt.
- **Precedence** — which source wins, per *policy*, not per vibes. An explicit request overrides a standing memory. The authoritative clock overrides stale stored content. Project memory overrides user memory inside a project.
- **Negative** — what must *not* happen. Do not capture a transient remark as durable memory. Do not apply a recency filter nobody asked for. Do not execute a mutation before approval.

For every case you write, write its twin: the negative of "captures durable facts" is "does not capture transient remarks". A suite of positives alone cannot tell a correct agent from an over-eager one.

## The gold standard, deconstructed

This repo's reference case is the memory Dutch/English probe. It works because of its *anatomy*, not its subject:

1. **The fixture manufactures the conflict.** A stored memory says "Always answer in English"; the user prompt is in Dutch. The two pull in opposite directions.
2. **The wrong behaviour is crisp.** Answering in Dutch = fail. No ambiguous middle.
3. **The assertion is behavioural, not lexical.** An LLM judge takes the instruction *as data* and decides whether the response honours it. The harness never encodes "English = this one rule", so the same judge serves every adherence case.
4. **It is paired.** Beside it live `precedence-explicit-request-wins` (the flip side) and `memory-capture-negative-transient` (the negative).
5. **It records evidence and a capability score.** Output (response, tool calls) is logged for inspection; an annotation carries a 0/1 score under a named archetype; metadata carries the regression provenance.

See `references/case-design.md` for the full walkthrough and more patterns.

## Workflow

### 1. Define the archetype
A named capability with a stable id (`time_awareness`, `memory_adherence`, `parallel_execution`). It is both the split tag and the annotation name, so the dataset stays sliceable. One archetype per *behaviour*, not per feature.

### 2. Design the conflict fixture
The trap must be *reachable*: if the agent never encounters the conflicting source, the case passes trivially and proves nothing. If the memory has to matter, the prompt must force reading it ("what's in my sprint log, and what day is it today?"). If the old note has to be excluded, it must be the *most* semantically relevant one, so only a recency filter can keep it out.

### 3. Choose the assertion lane
See `references/assertion-lanes.md`. In one line:

| Lane | Cost | Use when |
|------|------|----------|
| Subsystem / deterministic | ~free | The thing under test is a subsystem (retrieval ranking, a filter), not the agent |
| Tool-call presence / arguments | cheap | "Did the agent reach for the right capability with usable args" |
| LLM judge | paid | Semantics, precedence, language, scope — anything lexical checks would encode |
| Composite | paid | A deterministic check pins the mechanism, a judge pins the behaviour |

Prefer the cheapest lane that actually discriminates. Judge-only is the *default* for behavioural claims; add a deterministic tool-arg assertion when the feature *is* a specific tool or argument.

### 4. Write the case as data
A case is declarative: stable `id`, human `name`, `splits` (archetype + tags like `negative` / `regression`), `input`, `expected`, `metadata` (observedAt, note on the regression), and a `run(lab)` that seeds, drives one turn along the *production* path, logs evidence, logs the annotation, and asserts the hard invariants. There is one suite, many cases, sliced by splits — never one dataset per archetype.

### 5. Register, run filtered, iterate
Register in the single suite. Run only your archetype (`-t "time_awareness"`). When a case fails, decide which kind of failure it is:

- **Judge over-strictness** → the case is wrong; loosen the instruction (a date answered with the right day but different formatting is a pass).
- **Wrong assertion lane** → the model reached the behaviour another way; pivot the assertion (a tool-arg assertion for a tool the model never prefers is measuring tool-choice, not the behaviour).
- **Genuine finding** → keep it red. The eval's job is to be a canary; a real defect it surfaces is a win. Gate it by pass-rate across repetitions rather than one sample.

## Determinism and isolation

Model evals must be repeatable *as measurements*. Rules:

- **Never rely on wall-clock** unless you compute the expected value from the same clock at run time, seconds before the agent renders it. Bake the computed expectation into the judge instruction so the judge compares against a concrete target.
- **Seed through the real path.** Build the workspace with the actual controllers so memories are indexed, notes chunked, revisions recorded — a case seeded by raw inserts can pass while `search` is broken. Only *timestamps* may be backdated afterwards (and the search index's copy too — see `references/determinism-and-fixtures.md`).
- **Isolate per run.** A fresh user id per run means repetitions cannot inherit state the agent proposed earlier.
- **Fixtures are synthetic and committed** — never a real person's details, because they ship to the shared dataset.
- **Pin the judge separately and stronger** than the subject. A judge no better than the system it grades cannot catch that system's mistakes.
- **Gate by pass rate across repetitions**, not one sample. A single run is a signal, not a verdict.

## Recorder contract

The skill writes through a tiny interface — swap the backend freely:

```ts
recorder.logOutput({ model, response, toolCalls, durationMs })          // evidence, no score
recorder.logAnnotation({ name, score, label, explanation, annotatorKind? })  // 0/1 capability score
```

Annotations carry the archetype name and a 0/1; output carries what a human needs to debug a red case. Never put the pass/fail only in a thrown assertion — the annotation is what the dataset accumulates.

## Reference files

- `references/case-design.md` — conflict/precedence/negative patterns, the gold-standard walkthrough, worked examples
- `references/assertion-lanes.md` — when each lane fits, and how to combine them
- `references/determinism-and-fixtures.md` — clock rules, real-path seeding, backdating, isolation
- `references/suite-wiring.md` — archetypes, splits, single-suite registration, filtered runs, gating
