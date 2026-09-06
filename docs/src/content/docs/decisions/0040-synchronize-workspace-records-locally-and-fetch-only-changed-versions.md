---
title: 'ADR 0040: Synchronize workspace records locally and fetch only changed versions'
description: Make navigation and offline editing use one local copy of workspace records.
---

## Status

Accepted design. Implementation in progress.

## Context

Opening an already downloaded object should not require downloading it again. Users also need
to read and edit their workspace without a connection. Today, server route loaders, page
snapshots in the service worker, and the note write queue each own part of this behavior.
They do not provide a shared read lifecycle.

The user chose an initial download of all current workspace records, followed by incremental
synchronization. This includes saved chats and file metadata. File bytes and historical
revisions remain on demand. Actions that need server execution remain online operations.

## Decision

We chose one account-scoped local store of normalized records. Lists and detail views are
projections of these records, with pending local edits applied over the last server copy.
The private app renders through a browser shell so route navigation does not wait for a server
loader. The service worker stores the shell and assets, not private page-data snapshots.

The server returns a complete inventory of object identities and entity tags (ETags). An ETag
identifies a stored version. The client compares this inventory with its own. It fetches only
new or changed records. A matching tag never schedules a payload download. Only a successful,
complete inventory can establish that a previously present record was removed.

Database-maintained synchronization versions cover writes from humans, agents, and workers.
They are distinct from the document revisions in ADR 0010. A note revision does not describe
every field of a note, and cannot describe related tasks or inherited preferences.

The read lifecycle has three states:

- **Uncached:** no server copy is stored locally.
- **Cached:** a server copy is stored and no newer version is known.
- **Updating:** a newer version is known, or an initial fetch is in progress. The previous copy,
  if present, remains stored. Queued, fetching, and failed attempts are explicit substates.

Cached records open immediately, including while an inventory check is running. Opening a
known-updating record online promotes or joins its fetch and waits for the live copy. Offline,
the previous copy is available. An online failure is reported and never makes an old copy current.
There is one in-flight fetch per object, and obsolete responses cannot replace newer state.

The write lifecycle is separate. Ordinary creates, edits, moves, publication, archive/restore,
and deletions enter a durable local queue before being sent. Dependent operations retain their
order. Conflicts block dependent work, not unrelated objects. A refresh cannot erase a draft.
The base/local/server comparison and safe-retry policy follow ADR 0010, extended to these
ordinary workspace mutations. We ask on divergence rather than merging fields automatically.

The server checks the base version, applies the domain mutation, and stores an operation receipt
in one transaction. Retrying the same operation returns its receipt. An operation identifier
cannot be reused for different input. Client-generated identities let offline-created objects
refer to each other without changing identity after synchronization.

Account changes stop synchronization and remove access to the previous account's local records.
Unsent changes remain recoverable after that same account authenticates again. Invalid storage,
failed downloads, and unavailable server actions are explicit failures under ADR 0015.

## Consequences

- Subsequent synchronization transfers changed content only; it still reads the identity inventory.
- Normalized records prevent a task change from requiring another download of an unchanged note.
- The first download and browser storage use grow with the current workspace.
- First-ever startup needs JavaScript and a network connection before workspace data can appear.
- Pending writes require durable receipts and visible conflict resolution across editable objects.
- Offline availability is limited by completed downloads and the browser's available storage.
- AI runs, generated exports, uploads, credentials, and security changes remain server operations.
- We keep this design while the complete version inventory is practical. Any inventory partition
  or data limit requires measurement and an explicit completeness contract; it cannot silently
  omit workspace content.

## Evidence

- ADR 0007 governs controller orchestration; ADR 0009 governs project archive visibility.
- ADR 0010 defines document conflict and retry behavior; ADR 0037 governs parsed storage boundaries.
- `src/lib/client/notes/sync/coordinator.ts` currently preserves note base/local/server versions.
- `src/routes/(app)/notes/[id]/+page.server.ts` currently requires a live view before local drafts load.
- `src/service-worker.ts` currently uses network-first private page snapshots. This violates the
  target design until the browser shell and object synchronization replace that path.
- `incremental-sync-plan.md` tracks implementation and verification; acceptance of this decision
  does not claim that the existing application already implements it.
