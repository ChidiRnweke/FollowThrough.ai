---
title: 'ADR 0010: Reject conflicting document edits without rejecting a save that already succeeded'
description: Protect edits from other tabs and from the agent while making save retries safe.
---

## Status

Accepted. Extended to diagrams.

## Context

A user can open the same note in two tabs or on two devices. Each editor can start from the same
version and then make a different change. Silently accepting both saves would let the later save
erase the earlier one.

A save can also succeed while its response is lost. Retrying that save should not create a false
conflict.

Diagrams have the same problem and the same shape. A draw.io diagram is a whole document with an
ordered revision history, editable in the studio canvas and in the gallery. The agent is a third
writer: it revises a saved diagram in the middle of a conversation while the user may have the
canvas open. "The version I read is still the current one" is the same question there as in a note.

## Decision

We chose to send the base version with each save of a whole document. This covers notes and
draw.io diagrams. Direct document operations use an identifier and document revision. Workspace
commands use the resource version and permanent operation identity defined in ADR 0040. A resource
version and a published document revision describe different things and are not interchangeable.

If the saved document changed in a different way, we return the authoritative remote version as
a conflict. The client retains its base and local edit for comparison. We do not choose one
document for the user.

Direct document saves can recognize an already-present requested result. Workspace command retries
instead use the exact stored operation proof, so later edits cannot erase evidence of a completed
save. If its original version is no longer current, the proof establishes completion without
substituting a newer body. ADR 0040 defines this retry and descendant-edit contract.

We will keep whole-document conflict handling while these documents are saved as whole documents.

This is about concurrency and publication state only. Whether an agent's proposal may become saved
data at all is a separate question, decided by ADR 0003. A base version says "nobody moved this
under me"; it never says "the user agreed to this".

Reviewed note-body tools retain the base from their saved approval rather than loading a
new base at execution. ADR 0003 defines that approval contract. A requested result already
present in the note is unchanged; a different result against a stale base requires new review.

## Consequences

- One tab cannot silently overwrite a different edit from another tab.
- An agent revising a diagram cannot overwrite an edit the user made in the canvas meanwhile.
- Retrying a save after a lost response is safe.
- The client must keep the base and local versions until the save settles.
- A conflict needs a user-facing comparison and resolution flow.
- The system does not merge conflicting rich-text documents automatically.
- Notes and diagrams both use the workspace outbox for supported offline edits. Conflicts remain
  queued for explicit review. Server-only generation and compound operations remain online.

## Evidence

- `src/lib/server/controllers/notes/controller.ts` applies guarded document edits.
- `src/lib/server/controllers/notes/save.spec.ts` checks stale revisions and no-op saves.
- `src/lib/client/sync/mutation-queue.ts` retains pending intent and authoritative outcomes.
- `src/lib/client/sync/mutation-queue.spec.ts` checks conflicts and retries with stable identities.
- `src/lib/server/services/workspace/mutations.spec.ts` checks exact operation replay, divergent
  resource versions, cancellation and rollback when a receipt cannot be stored.
- `src/lib/components/shared/workspace-write-review.svelte.spec.ts` checks conflict comparison
  and protects dependent edits from an outdated discard decision.
- `src/lib/models/notes/index.ts` and `src/lib/models/diagrams/index.ts` build the base version the
  same way, in `noteEtag` and `diagramEtag`.
- `src/lib/server/controllers/diagram-studio/controller.ts` takes a base version on
  `saveProjectDiagramDraft`, `publishProjectDiagram`, and the agent's `editDiagram`.
- `src/lib/server/services/diagrams/library.ts` rejects a stale base version on a diagram write.
