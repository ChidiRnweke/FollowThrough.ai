---
name: debugging-observability
description: Investigate observability failures using Phoenix traces and repository evidence. Use when Codex receives a trace ID, needs to inspect recent Phoenix spans, diagnose agent or tool-call failures, explain latency or token growth, validate trace hierarchy and status, find duplicate instrumentation, batch-investigate a file of trace IDs with per-trace subagents, or turn telemetry evidence into a source fix and verification plan.
---

# Debugging Observability

Investigate traces as evidence, then separate application failures from telemetry failures.

## Workflow

1. Verify Phoenix configuration without printing API keys or authorization headers. Reuse the repository's existing environment aliases and project name.
2. Query the smallest useful dataset:
   - Specific trace: `bun scripts/phoenix-query.js --trace-id <trace-id>`
   - Recent window: `bun scripts/phoenix-query.js --days <N>`
   - Add `--raw` only when the compact output omits evidence required for the diagnosis.
3. Reconstruct the trace chronologically and as a parent/child tree. Record roots, unresolved parents, status, duration, model generations, tool calls, and retries.
4. Inspect failures below the root even when the root status is `OK`. Compare tool arguments with their advertised schema, and distinguish malformed model output, dispatcher validation, controller/domain failures, and provider failures.
5. Quantify the impact: failed attempts, repeated argument sizes, prompt/completion tokens, latency, and duplicate spans. Treat sudden prompt growth as evidence that large prior tool calls or outputs are being replayed.
6. Search the repository with `rg` for the observed span names, tool names, schemas, error text, and instrumentation setup. Check whether the process may be running stale code before proposing another code change.
7. Separate the findings:
   - Application bug: incorrect contract, recovery, state transition, or user-visible behavior.
   - Telemetry bug: duplicate instrumentation, split roots, wrong parents, misleading status, or missing attributes.
   - Operational issue: stale process, configuration drift, exporter delivery, or deployment mismatch.
8. Implement the narrowest fix and add a regression test at the failing boundary. Never mutate or delete Phoenix data.
9. Verify with the repository's applicable commands:
   - `pnpm trace:audit`
   - `pnpm trace:validate`
   - `pnpm trace:smoke`
   - A fresh scenario that exercises the original failure.

## Batch trace investigation (file of trace IDs)

Use when a caller points you at a file of trace IDs and asks what each agent did wrong. This workflow is generic: it works for any project whose traces live in the configured Phoenix project. It is designed to run on a fresh context so earlier analysis does not pollute it.

### 1. Read the input file

The file is JSON with a `traces` array. Each entry carries at minimum a full 32-hex `traceId`; it may also include `rootName`, `spanCount`, `broken`, and `startTime` metadata. Keep the metadata but never trust its verdicts — re-derive conclusions from Phoenix data.

Example shape:

```json
{
  "project": "followthrough",
  "window": { "start": "...", "end": "...", "timezone": "UTC" },
  "count": 46,
  "traces": [
    { "traceId": "<32-hex>", "rootName": "agent.turn", "broken": true }
  ]
}
```

### 2. Choose a sub-set to investigate

- Filter out noise traces the caller asked to skip (for example `inline.suggestion` roots) unless the caller wants them.
- Prefer traces that are `broken: true` or carry ERROR spans; investigate healthy traces only if asked.
- If the set is large, run one subagent per trace; if the set is enormous, group the trivial (e.g. 2-span) traces into a few subagents and give full traces individual subagents.

### 3. Spawn one subagent per trace

For each chosen trace, launch a subagent with this prompt template (fill the bracketed values):

```
You are investigating one Phoenix trace as evidence of what the agent did wrong.
Do NOT modify code. Do NOT touch Phoenix data. This is read-only analysis.

Trace ID: <traceId>
Phoenix project: <projectName>

Steps:
1. Run: bun scripts/phoenix-query.js --trace-id <traceId>
   Re-run with --raw only if the compact output omits evidence you need.
2. Reconstruct the trace: chronological order and parent/child tree. Identify
   the root, every unresolved parent, every span status, durations, model
   generations, and every tool call in order with its arguments and output.
3. Decide what the agent did wrong, if anything. Consider: wrong or premature
   tool choice, missing grounding reads, retry loops, wasted or duplicate
   calls, oversized payloads, abortive turns, failed mutations, and cases where
   the agent acted without reading the workspace first.
4. Separate agent misbehaviour from telemetry breakage. If the trace looks
   structurally broken (bare agent.turn + Agent workflow pair, orphaned tool
   spans, missing parents, no root), say so explicitly and do not invent agent
   failures from missing data.
5. Return a structured report: trace id, what was asked (if derivable), the
   tool sequence with outcomes, what went wrong, impact, and a severity
   (high/medium/low). Keep it under 40 lines. Redact secrets and user content.
```

Launch all subagents in parallel (one message, many task calls).

### 4. Aggregate

Collect the subagent reports. Group findings by failure pattern, count how many traces share each pattern, and rank by impact. Produce:

- A table of per-trace verdicts (trace id, pattern, severity).
- A list of distinct failure patterns with representative trace IDs.
- A short summary of what "the agents did wrong" overall, plus any telemetry-level caveats (broken traces whose absence of data must not be read as agent success).

### 5. Feed improvements

If the caller wants improvements next, pass the aggregated patterns (not raw traces) to a separate planning pass. Suggest fixes only for patterns with enough supporting traces; treat a single ambiguous trace as an anecdote.

## Report

Report the symptom, evidence-backed timeline, root cause, code or operational fix, and verification result. State explicitly when a conclusion is an inference. Redact secrets and avoid reproducing full user content, embeddings, or bulky raw trace payloads. For batch investigations, also report the aggregation table and pattern ranking.
