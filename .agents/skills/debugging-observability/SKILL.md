---
name: debugging-observability
description: Investigate observability failures using Phoenix traces and repository evidence. Use when Codex receives a trace ID, needs to inspect recent Phoenix spans, diagnose agent or tool-call failures, explain latency or token growth, validate trace hierarchy and status, find duplicate instrumentation, or turn telemetry evidence into a source fix and verification plan.
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

## Report

Report the symptom, evidence-backed timeline, root cause, code or operational fix, and verification result. State explicitly when a conclusion is an inference. Redact secrets and avoid reproducing full user content, embeddings, or bulky raw trace payloads.
