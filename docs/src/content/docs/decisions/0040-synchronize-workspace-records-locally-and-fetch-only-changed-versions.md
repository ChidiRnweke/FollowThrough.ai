---
title: 'ADR 0040: Synchronize workspace records locally and fetch only changed versions'
description: Make navigation and offline editing use one local copy of workspace records.
---

## Status

Accepted.

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
loader. The service worker stores a generated, data-free SPA fallback and public assets. It never stores private HTML or page-data responses; activation deletes the superseded page caches. Synchronization RPCs use uncached remote commands so the shared resource cache is the sole owner of refresh and request coalescing.

The server keeps a compact synchronization journal: one latest change per account and resource
identity, containing a cursor, an upsert or delete operation, and the resource version. This is
metadata for synchronization, not application events or event sourcing. Initial synchronization
starts at cursor zero; subsequent pulls return only entries changed since the client's cursor.
The client downloads new or changed bodies. A matching ETag never schedules a body download.
Deletion is an explicit durable tombstone, including for objects this device never downloaded;
absence from a change batch means nothing changed. A never-known identity remains distinct from
a deleted identity. Recreating an identity replaces its tombstone with an upsert.
Tombstones retain the deleted resource's ETag. A deletion wins over an upsert of that same
version, while a newer recreation wins over the old tombstone. Delayed batches and reads cannot
undo this ordering.

Cursors are account-scoped decimal integers. Updating an account's head row acquires a lock held
until the domain transaction commits. Later writers for that account cannot commit a higher
cursor ahead of it. Head and journal are read in one database statement snapshot. Using a
sequence alone would be incorrect: a client could observe a later committed transaction and
permanently skip an earlier, still-uncommitted one. The resource version sequence is safe for
ETags but is deliberately not a change cursor. Account ownership is retained in version metadata
so cascading deletes can record tombstones after their owning parent disappears.
The application has no transfer-between-accounts operation. The database rejects changes to a
resource's owning account, protecting inherited child membership. Supporting account transfers
later would require journaling both removal from the old account and all newly visible children.

The browser stores a batch's invalidations, tombstones, and cursor in one IndexedDB transaction.
Bodies can arrive afterward: interrupted downloads remain updating and resume after reload.
Failed storage never advances the durable cursor. The journal retains tombstones without a
guessed expiry; future pruning would require an explicit cursor-expiry and full-reset protocol.

Database-maintained synchronization versions cover writes from humans, agents, and workers.
They are distinct from the document revisions in ADR 0010. A note revision does not describe
every field of a note, and cannot describe related tasks or inherited preferences.

The read lifecycle has three states:

- **Uncached:** no server copy is stored locally.
- **Cached:** a server copy is stored and no newer version is known.
- **Updating:** a newer version is known, or an initial fetch is in progress. The previous copy,
  if present, remains stored. Queued, fetching, and failed attempts are explicit substates.

Cached records open immediately, including while a change pull is running. Opening a
known-updating record online promotes or joins its fetch and waits for the live copy. Offline,
the previous copy is available. An online failure is reported and never makes an old copy current.
There is one in-flight fetch per object, and obsolete responses cannot replace newer state.

Resource identity, durable cache metadata, and the optional in-flight operation belong to this
generic mechanism. Routes and features request resources through it; they do not choose their
own freshness policy. Updating is a foreground read barrier, not permission to render stale
content while fetching. A change pull by itself does not make every cached record
updating: only evidence of a changed tag does. This preserves immediate navigation for unchanged
objects. Offline access to the retained copy is the explicit exception to that barrier.

Losing connectivity releases an already-waiting reader to its retained copy, or reports that no
offline copy exists. A transient online failure preserves the previous copy and reports failure;
it does not falsely transition to cached. A later foreground request or synchronization retries
the transfer. There is no separate fresh state, and no busy retry loop on failure. Optional records use the same read barrier. A completed journal can prove that an override is absent; an unknown inventory or a known record without its body cannot. Features may apply product defaults only for proven absence or deletion, never for a failed download. Optional forms use the same rule when creating an override: a default-valued draft starts only after proven absence or deletion. It does not become a cached server object or a queued creation until the user saves. If another client creates the override first, the absent-base write conflicts rather than overwriting it.

The write lifecycle is separate. Ordinary creates, edits, moves, publication, archive/restore,
and deletions enter a durable local queue before being sent. Dependent operations retain their
order. Conflicts block dependent work, not unrelated objects. A refresh cannot erase a draft.
The base/local/server comparison and safe-retry policy follow ADR 0010, extended to these
ordinary workspace mutations. We ask on divergence rather than merging fields automatically.
New local objects have stable client-generated identities and no server base; dirty existing
objects retain their server base; local deletions retain that base with a deletion intent.
These facts belong to pending mutations, independently of the cache lifecycle and server
tombstones. A server deletion must not discard a conflicting local draft.

Queue entries preserve their command, base, local representation, and preceding operation IDs.
Unsent document edits can coalesce. A definitively rejected document may also be replaced by a
new operation from the same observed edit, provided no other queued edit depends on it. This lets
corrected content be submitted without retrying invalid input. Once submission starts, its operation identity and input
remain immutable, including after a transport failure. Publication and other distinct operations
preserve their positions between edits. Queue order and edit ancestry are distinct: a draft names
its pending local base with `basedOn`. Successful acknowledgement supplies a new server base only
for edits made against that local version. Competing tabs retain their original server bases and
therefore conflict instead of silently rebasing over each other. Coalescing requires that exact
local predecessor and no dependent entries; it replaces the superseded operation identity so a stale
tab cannot mistake changed local content for the version it edited. Acknowledgement, cached body, and queue settlement commit atomically. The device retains one exact
applied receipt per account/resource, independently of subsequent cache refreshes. Appending a late
descendant checks that receipt inside the same storage transaction: only its exact operation ID can
supply a new base. Content equality and queue disappearance never prove acknowledgement. A newer
local receipt may replace the proof; an older editor then retains its original base and can conflict
conservatively. This bounds retained snapshots by resource count rather than autosave count. A deleted
outcome preserves later edits as conflicts instead of authorizing recreation. Mounted drafts retain
their own observed content, and explicit keep-local adopts only the replacement operation it reviewed. References to locally created parents wait for those parents' acknowledgement.
Conflicts retain dependent entries while unrelated resources remain sendable.

A shared review dialog exposes pending writes, rejection reasons, and the retained base/local/server
copies. Review captures the exact operation identities, including all dependent edits. Discard refuses
unknown send outcomes and any newly added, unreviewed descendants. A download preserves the reviewed
records before an explicit discard. Keeping a conflict replays its original command against the
reviewed server version; creation conflicts and server-deleted items require explicit recreation.
Mounted editors require an exact durable receipt before treating a removed queued operation as
acknowledged. A discard in another tab therefore retains the editor buffer with an error until
reopened. A superseded receipt also requires reopening; queue absence never proves success.

The guarded outbox operates on one independently versioned resource per command. A parent ETag
cannot protect changes to its children. Compound operations such as skill import, recursive removal,
and note moves therefore remain online operations; their resulting changes use the same journal.
Binary transfers, historical revision retrieval, generation, and credentials also remain on demand.
This scope does not introduce a second cache or an alternate offline mutation path.

The server checks the base version, applies the domain mutation, and stores an operation receipt
in one transaction. Retrying the same operation returns its receipt. An operation identifier
cannot be reused for different input. Client-generated identities let offline-created objects
refer to each other without changing identity after synchronization.

Deployment model metadata and resolved deployment-dependent defaults are not database resources.
A small, validated bootstrap binds the active account and retains deployment defaults and the
model catalog for offline startup. User preferences, tool overrides, and trust policies are ordinary
synchronized records; deleting an override immediately restores its deployment or product default. It is refreshed on app start and never contains workspace page snapshots. A readable,
non-secret account-hint cookie must match before cached bootstrap data can be restored. The server
sets that hint only after resolving the actor and clears it when sign-in starts, the session is
invalid, or the user signs out. It is not an authentication credential; synchronization requests
still validate the real session and account. Clearing the hint blocks offline reopening without
deleting unsent drafts from IndexedDB. Ordinary workspace records and mutation intents remain in account-scoped IndexedDB.

Account changes stop synchronization and remove access to the previous account's local records.
Unsent changes remain recoverable after that same account authenticates again. Invalid storage,
failed downloads, and unavailable server actions are explicit failures under ADR 0015.

Legacy note drafts retain their original base, local content, and any observed conflict copy.
Their old revision validator is not a workspace version: an imported existing base explicitly
has an unknown sync ETag until an authoritative read validates it. An absent base still means a
new local object. Unvalidated imports cannot be submitted. Matching the original content and
revision, or finding that the desired content already reached the server, supplies the real
validator; divergence retains a conflict. Only metadata actually changed offline is submitted.
The import marker and queued draft commit atomically, so restarting migration cannot resurrect
an acknowledged draft. The original database is retained and upgraded to exclude old writers;
a blocked upgrade explicitly asks the user to close older tabs before retrying.

Conflict responses persist the authoritative body or tombstone alongside the retained local edit.
Keeping an edit uses a new operation identity guarded against the reviewed server version.
Discarding removes exactly the reviewed set: an attempted write first needs receipt recovery,
and every dependent edit must be included explicitly. This prevents an apparently local discard
from silently destroying or unblocking work the user did not review.

## Consequences

- Subsequent synchronization transfers changed identities and content only.
- Normalized records prevent a task change from requiring another download of an unchanged note.
- The first download and browser storage use grow with the current workspace.
- First-ever startup needs JavaScript and a network connection before workspace data can appear.
- Pending writes require durable receipts and visible conflict resolution across editable objects.
- Writes in one account serialize when advancing its cursor. Long transactions delay that
  account's later writers; normal database deadlock/serialization failures must retry the whole
  unacknowledged operation. Other accounts do not share this head lock.
- Offline availability is limited by completed downloads and the browser's available storage.
- AI runs, generated exports, uploads, credentials, and security changes remain server operations.
- The first pull includes the compact journal's retained tombstones as well as live identities.
  Journal retention grows with distinct resource identities, not the number of edits.

The first draft used a complete ID/ETag inventory on every sync. The compact journal replaces
that choice because it communicates explicit deletion and avoids retransmitting unchanged
identities. The generic client remains an ordinary module under `client/sync`; server code uses
the existing repositories, services, controllers, and factories. No architectural layer is added.

## Evidence

- ADR 0007 governs controller orchestration; ADR 0009 governs project archive visibility.
- ADR 0010 defines document conflict and retry behavior; ADR 0037 governs parsed storage boundaries.
- `client/sync/legacy-notes.ts` preserves the historical base/local/server format during the one-time
  migration. The old note coordinator, repositories, transport, and sync inventory API are removed.
- The note route now opens through `stores/workspace/resources.svelte.ts`; its former server loader
  required a live view before local drafts could load.
- `src/service-worker.ts` serves the generated SPA fallback during offline workspace navigation and removes the old private page snapshots. All private page loaders now open from the shared workspace records.
- `docs/plans/incremental-sync-plan.md` tracks implementation and verification; acceptance of this decision
  separates implementation coverage from final validation results.
