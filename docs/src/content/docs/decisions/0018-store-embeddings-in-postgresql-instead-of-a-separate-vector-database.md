---
title: 'ADR 0018: Store embeddings in PostgreSQL instead of a separate vector database'
description: Keep search vectors near their source data and avoid another data service.
---

## Status

Accepted.

## Context

Semantic search needs embeddings. An embedding is a numeric form of content used to find similar
content.

A separate vector database would add another stored copy of source identity, ownership, and
lifecycle state. The application would need to keep that service consistent with PostgreSQL.

## Decision

We chose PostgreSQL with pgvector for stored embeddings.

Source ownership, index state, and vectors stay in the same database. We will not add a separate
vector service without a scale or search need that PostgreSQL cannot meet.

This decision does not require vector-only retrieval. A later keyword ranking and result-combining
stage can still use PostgreSQL or another justified search component.

## Consequences

- Source and vector lifecycle stay close together.
- The deployment operates one fewer data service.
- Database transactions can protect index state.
- PostgreSQL carries both application and vector-search load.
- Search features are limited to what this setup can support until a new need justifies change.

## Evidence

- `search_chunks` stores source data and pgvector embeddings in PostgreSQL.
- PostgreSQL repository queries perform vector distance ranking.
- The development and test database images include pgvector.
