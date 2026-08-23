---
title: "ADR 0010: Reject conflicting note edits without rejecting a save that already succeeded"
description: Protect edits from other tabs while making save retries safe.
---

# ADR 0010: Reject conflicting note edits without rejecting a save that already succeeded

## Status

Accepted.

## Context

A user can open the same note in two tabs or on two devices. Each editor can start from the same
version and then make a different change. Silently accepting both saves would let the later save
erase the earlier one.

A save can also succeed while its response is lost. Retrying that save should not create a false
conflict.

## Decision

We chose to send the base version with each note save.

If the saved note changed in a different way, we return the base, local, and remote versions as a
conflict. We do not choose one document for the user.

If the server already contains the same content as the retry, we report success. The lost response
does not turn a completed save into a conflict.

We will keep whole-document conflict handling while notes are saved as whole documents.

## Consequences

- One tab cannot silently overwrite a different edit from another tab.
- Retrying a save after a lost response is safe.
- The client must keep the base and local versions until the save settles.
- A conflict needs a user-facing comparison and resolution flow.
- The system does not merge conflicting rich-text documents automatically.

## Evidence

- `src/lib/server/controllers/notes/controller.ts` returns saved or conflict outcomes.
- `src/lib/server/controllers/notes/save.spec.ts` checks divergent and repeated saves.
- `src/lib/client/notes/sync/coordinator.ts` keeps base, local, and remote versions.
- `src/lib/client/notes/sync/coordinator.spec.ts` checks conflict and retry behavior.
