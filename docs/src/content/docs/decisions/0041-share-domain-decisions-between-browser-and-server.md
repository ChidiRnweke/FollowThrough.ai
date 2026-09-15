---
title: 'ADR 0041: Share domain decisions between browser and server'
description: Keep optimistic and authoritative behavior consistent without changing layer ownership.
---

## Status

Accepted. Implementation is staged; the known remaining work is listed below.

## Context

Users can edit downloaded records offline and can change the same records through server actions.
Separate placement, restoration and view assembly implementations can give those paths different
answers. Skills also write note documents and history independently of note services. Repeated
service contracts and copied foreign records require multiple edits for one concept.

The accepted simplification plan preserves offline intent, publication, approval, concurrency and
format-specific layout. It measures simplification by deleted implementations and fewer independent
decisions, as well as line counts.

## Decision

We chose to implement each domain decision once as a typed pure operation. Browser and server
adapters supply resolved facts; the server recomputes the result using authoritative data. An
incomplete cache cannot prove absence or authorize a transition that requires complete inventory.

Generic operations own minimal facts. Aggregate models accept foreign participants instead of
copying full entities. Small named reference projections remain useful for display. Each service
contract has one declaration, and capability factories share reusable service instances.

Controllers retain cross-service orchestration and transaction ownership under ADR 0007. Domain
writes, required secondary writes and sync proof commit together. Models retain their import
boundaries. External data is parsed at the boundary under ADR 0037. The outbox and synchronization
contract in ADR 0040 remain in force.

New abstractions replace existing implementations in the same stage. This decision does not unify
DOCX/PDF layout or the distinct execution inputs in ADR 0034. Proposal reversal and attachment
recovery need explicit behavior corrections; structural extraction alone cannot establish safety.

## Consequences

- Equivalent resolved facts can produce the same optimistic and authoritative decision.
- Model changes no longer require copying complete foreign record declarations.
- Adapters still perform I/O and translate formats. Controllers retain explicit consequences.
- Pure operations need explicit facts, including inventory completeness. This adds adapter work.
- Behavior corrections need durable state and concurrency evidence beyond extraction tests.

## Evidence

- `src/lib/server/services/*/contracts.ts` retains narrow contracts after duplicate implementation
  exports are removed.
- `src/lib/models/projects/index.ts` uses document participants for create/move results and a named
  project-entry reference for tree display.
- `src/lib/server/application.ts` already reuses capability-created note, task and project catalogs.
- Known remaining duplication includes `prepareWorkspaceCommand`, aggregate note models,
  `SkillLibrary` document writes, selection validation, run settlement and browser SSE readers.
  The implementation record in `docs/architecture/domain-model.md` tracks these pending areas.
