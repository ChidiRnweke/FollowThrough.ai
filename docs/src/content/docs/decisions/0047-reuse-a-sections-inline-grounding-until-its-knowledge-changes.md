---
title: "ADR 0047: Reuse a section's inline grounding until its knowledge changes"
description: Store the passages and memory one caret rest retrieved for a note section, and serve later rests in that section from the stored row until the corpus it came from changes.
---

## Status

Accepted.

## Context

Inline suggestions (ghost text in the note editor) run on every caret rest. Before the model can
start, each request retrieves grounding: an embedding call, a vector search over the project's
chunks and a rerank call, in parallel with a read of the user's memory. The retrieval query is the
heading path, the section text, and the text around the caret, so two rests in one section ask the
corpus nearly the same question. The corpus itself changes between two rests rarely.

Measured on 2026-10-25 with the production composition against a disposable PostgreSQL, real
OpenRouter calls, a project of 49 embedded notes and 30 requests spread over three sections of one
note, with the model's reasoning switched off:

| Span                      | p50 (ms) | p95 (ms) |
| ------------------------- | -------: | -------: |
| `retrieval.vector-search` |      655 |      789 |
| `retrieval.rerank`        |      396 |      466 |
| `inline.context`          |     1078 |     1366 |
| `inline.generate`         |      635 |     1156 |
| `inline.suggestion`       |     1707 |     2526 |

Retrieval is 63% of the median request. A suggestion that arrives after the writer has typed the
next word is wasted, so the time before the model starts decides whether ghost text appears at all.

Three places to keep the grounding were considered. A process-local cache would vanish on restart,
differ between instances, and break the rule that the server keeps no state between requests (ADR
0007). Sending the grounding back to the browser and echoing it with the next request would add
20 to 30 KB to every rest and let the server ground on passages the client chose. A database row
keeps the server stateless, survives restarts, and is testable through the storage contracts.

A time-to-live was rejected. The grounding is correct for as long as the corpus it came from is
unchanged; a window would either discard a valid row or keep a stale one, and nothing measured
motivates any particular number.

## Decision

- One row per (user, note, section) in `inline_grounding_snapshots` holds the project passages and
  user memory the last retrieval produced. The section is the heading path above the caret.
- The row is stamped with two fingerprints of the corpus it came from: the project's indexed
  knowledge outside the note being written (the newest `updated_at` and the row count of its
  search chunks) and the user's own memory (the same, over user-level entries). An edit, an
  addition and a deletion each move a fingerprint.
- A rest in the section reuses the row when both fingerprints still match. It retrieves again,
  and replaces the row, when either moved, when the section has no row, or when the writer asked
  explicitly (Alt+\ sends `trigger: explicit`, which the route maps to `grounding: rebuild`).
- The note being written is left out of the knowledge fingerprint: autosave re-indexes it on
  nearly every pause, and retrieval already excludes its own chunks.
- Rows are replaced in place and removed with their note. There is no sweeper.
- A suggestion reports where its grounding came from (`source: retrieval | snapshot`), and the
  `inline.context` span records the decision and its reason, so the reuse ratio is observable.

## Consequences

- Only the first rest in a section pays for retrieval. A later rest costs one row read and two
  aggregate queries. The same 30 requests, now
  with the grounding stored: retrieval ran three times, once per section, 27 requests were served
  from the row, `inline.context` fell to under a millisecond at the median, and the whole request
  fell from a median of 1707 ms to 580 ms (p95 from 2526 ms to 1880 ms).
- Within one section the stored passages do not follow the writer's text as it moves on; the next
  explicit ask, or any change to the project or memory, rebuilds them. The retrieval query was
  already dominated by the section text, so the loss is small and the saving is every rest after
  the first.
- Any change to the project's knowledge or to user memory invalidates every section's grounding in
  that project at its next rest, one rebuild each.
- The table grows with the sections a user has written in, bounded by notes times headings.
- A client built before `trigger` existed sends none; the route treats that as a rest.

## Evidence

- `src/lib/server/services/inline-suggestions/inline-grounding.spec.ts` covers the decision:
  missing, unchanged, knowledge changed, memory changed, requested, and section isolation.
- `src/lib/server/controllers/inline-suggestions/context.spec.ts` shows a rest served from the
  stored grounding without retrieval, a rebuild after the corpus moved, a rebuild on an explicit
  ask, and the retrieved grounding being kept.
- `tests/integration/inline-suggestions/grounding.contract.spec.ts` proves against PostgreSQL
  that one row per section is replaced on the next put, that a chunk of the note being written
  leaves the fingerprint alone while a sibling note's chunk moves it, that adding or editing a
  user memory moves the memory fingerprint, and that deleting the note removes the row.
- The measurement above, and the reuse measurement in the consequences, were taken with
  `inline.*` spans recorded in process from the production composition.
