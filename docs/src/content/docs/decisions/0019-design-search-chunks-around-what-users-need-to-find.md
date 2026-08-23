---
title: "ADR 0019: Design search chunks around what users need to find"
description: Treat content boundaries and carried context as product behavior, not only tuning.
---

# ADR 0019: Design search chunks around what users need to find

## Status

Accepted.

## Context

Long notes and files cannot be searched as one useful unit. They are divided into chunks before
embedding and ranking.

A chunk boundary decides which ideas can be found together. Its title, path, and overlap also
decide whether a result makes sense outside the full document. These choices change what users can
find.

## Decision

We chose to treat chunk design as a product decision.

Chunks follow meaningful text boundaries where possible. They carry enough source context to make
embedding and ranking useful. Retrieval evaluations must guide changes to this behavior.

Exact token targets and overlap sizes remain configuration values. They can change without a new
ADR when the user-facing search contract stays the same.

## Consequences

- Search design reviews include content structure, not only model settings.
- A chunk can be understood with its source title and path.
- Larger overlap improves continuity but repeats content and embedding work.
- Smaller chunks improve focus but can separate facts that belong together.
- Limits that discard accepted content are defects, not chunk tuning.

## Evidence

- `TokenAwareChunker` preserves paragraphs and uses overlap.
- Indexers add source titles and paths to embedding input.
- Indexing tests protect chunk and context behavior.
- `docs/architecture/suspicious-findings.md` tracks the attachment 50-chunk truncation.
