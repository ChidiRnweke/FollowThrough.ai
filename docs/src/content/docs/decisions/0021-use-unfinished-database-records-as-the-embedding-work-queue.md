---
title: 'ADR 0021: Use unfinished database records as the embedding work queue'
description: Resume embedding work from durable index state without a separate job table.
---

## Status

Accepted.

## Context

Saved content can wait for an embedding. The application needs a durable list of that work so a
worker restart does not lose it.

A separate job table would repeat which source and chunks still need work. The unfinished search
records already contain that answer.

## Decision

We chose search records without an embedding as the embedding work queue.

The worker scans pending sources, creates embeddings outside a database transaction, and completes
the records in a short transaction. A failed source remains pending for a later run. One failed
source does not stop the rest of the backlog.

We will keep this design while the durable record itself fully describes the work to resume.

## Consequences

- A worker restart does not lose embedding work.
- The system does not need a second job record for each chunk.
- The queue cannot disagree with the data it represents.
- The pending-row query needs an index so work scales with backlog size.
- Scheduling, retry counts, and dead-letter handling are limited compared with a full job system.

## Evidence

- `KnowledgeIndexMaintenance` scans chunks without embeddings.
- `search_chunks_pending_idx` indexes the pending backlog.
- Maintenance tests check retries, per-source failure isolation, and completed work.
