---
title: 'ADR 0010: Reject conflicting document edits without rejecting a save that already succeeded'
description: Protect edits from other tabs and from the agent while making save retries safe.
---

# ADR 0010: Reject conflicting document edits without rejecting a save that already succeeded

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
draw.io diagrams. Both name the base version the same way: the document id and the revision it was
read at.

If the saved document changed in a different way, we return the base, local, and remote versions as
a conflict. We do not choose one document for the user.

If the server already contains the same content as the retry, we report success. The lost response
does not turn a completed save into a conflict.

We will keep whole-document conflict handling while these documents are saved as whole documents.

This is about concurrency and publication state only. Whether an agent's proposal may become saved
data at all is a separate question, decided by ADR 0003. A base version says "nobody moved this
under me"; it never says "the user agreed to this".

## Consequences

- One tab cannot silently overwrite a different edit from another tab.
- An agent revising a diagram cannot overwrite an edit the user made in the canvas meanwhile.
- Retrying a save after a lost response is safe.
- The client must keep the base and local versions until the save settles.
- A conflict needs a user-facing comparison and resolution flow.
- The system does not merge conflicting rich-text documents automatically.
- Diagrams have no offline sync layer, so a diagram conflict surfaces at the moment of saving
  rather than being reconciled in the background as a note's is.

## Evidence

- `src/lib/server/controllers/notes/controller.ts` returns saved or conflict outcomes.
- `src/lib/server/controllers/notes/save.spec.ts` checks divergent and repeated saves.
- `src/lib/client/notes/sync/coordinator.ts` keeps base, local, and remote versions.
- `src/lib/client/notes/sync/coordinator.spec.ts` checks conflict and retry behavior.
- `src/lib/models/notes/index.ts` and `src/lib/models/diagrams/index.ts` build the base version the
  same way, in `noteEtag` and `diagramEtag`.
- `src/lib/server/controllers/diagram-studio/controller.ts` takes a base version on
  `saveProjectDiagramDraft`, `publishProjectDiagram`, and the agent's `presentDiagramRevision`.
- `src/lib/server/services/diagrams/library.ts` rejects a stale base version on a diagram write.
