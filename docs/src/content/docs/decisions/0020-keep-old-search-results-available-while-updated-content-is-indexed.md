---
title: 'ADR 0020: Keep old search results available while updated content is indexed'
description: Prefer briefly stale semantic results to making edited content disappear from search.
---

## Status

Accepted.

## Context

Saving content is fast. Creating new embeddings requires a network call and can finish later. If
the old vectors are removed at save time, the edited source disappears from semantic search until
the worker catches up.

Briefly stale search is less harmful than a search gap that looks like missing data.

## Decision

We chose to keep the previous embedded chunks searchable until every replacement chunk has an
embedding.

New text is available to literal search while it waits. Literal search hides the superseded text.
Semantic search can still use the older vectors. Once the replacement is ready, the system removes
the old chunks.

## Consequences

- An edit does not make its source disappear from semantic search.
- Semantic search may briefly return text from the prior version.
- Literal search can show the new text sooner.
- The index must distinguish pending, current, and superseded chunks.
- A further edit during backfill must not remove the last searchable version.

## Evidence

- `search_chunks.supersededAt` marks old embedded chunks.
- `KnowledgeIndexMaintenance` completes pending embeddings before retiring old rows.
- `index-maintenance.spec.ts` checks search continuity and the mid-backfill edit race.
