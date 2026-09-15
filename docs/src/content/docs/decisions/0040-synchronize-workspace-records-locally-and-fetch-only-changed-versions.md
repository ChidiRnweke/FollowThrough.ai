---
title: 'ADR 0040: Synchronize workspace records locally and fetch only changed versions'
description: Make navigation and offline editing use one local copy of workspace records.
---

## Status

Accepted. The unreleased implementation was simplified before deployment. The current decision
below replaces intermediate compatibility, body-download and granular recovery protocols.

## Context

Users need to read and edit downloaded workspace records without a connection. Reopening an
unchanged object should not download it again. Separate route snapshots, note queues and caches
made that behavior inconsistent. The chosen scope is an initial download of current workspace
records, including saved chats and file metadata, followed by incremental synchronization.
File bytes, historical revisions and actions requiring server execution stay on demand.

## Decision

### One local workspace

Each account has one Dexie database with four stores: records, outbox, receipts and metadata.
Lists and details project the cached server records with pending local commands applied over them.
Dexie owns transactions and observation. A readonly live query reads one coherent account
projection; queue settlement and its cached body become visible together. Reads validate external
rows but do not repair, rewrite or remove them. Write operations open only the stores they need.

The outbox sequence uses IndexedDB auto-increment. Operation identity has a unique index.
There are no separate queue heads, import markers, quarantine records or acknowledgements.
The database opens explicitly with automatic reopening disabled. Account stop, reset and version
change end that connection's lifetime permanently. Reset awaits deletion before a new instance opens.

The private app uses a browser shell. The service worker stores a generated, data-free fallback
and public assets, never private HTML or page-data responses. Installation fetches those assets
freshly. Workspace RPCs use uncached SvelteKit remote commands.

### Complete incremental pages

The server journal retains one latest change per account and resource identity. A change records
a cursor, version and upsert/delete disposition. It is replication metadata, not event sourcing.
Initial sync starts at zero; later pulls select changes after the durable checkpoint.

A readonly repeatable-read PostgreSQL transaction reads the head, selected changes and their
exact versioned bodies. A missing or malformed live record fails the page. The browser commits
all page records and its checkpoint atomically. An interrupted page advances neither. There is
no separate notice/body protocol or background body downloader. Pages contain 128 records,
based on the PostgreSQL/PWA measurement of repeated page and projection costs at 32 records.
There is no total inventory cap or excluded type.

Tombstones are explicit and retain their version and account. Absence from a page means no change,
not deletion. A never-known identity differs from a tombstone. Deletion wins over a body of the
same version; newer recreation wins over an older tombstone. Delayed reads cannot undo this order.

Database triggers cover writes from people, agents and workers. Resource versions differ from
published document revisions in ADR 0010. Journal publication runs through a deferred constraint
trigger after domain work. Updating the account head holds its lock through commit, so later
committed cursors cannot skip an earlier unpublished transaction. A sequence alone cannot provide
that guarantee. Guarded mutations flush the trigger before reading their authoritative outcome.

Version metadata retains ownership for cascaded deletions. Account transfer is unsupported and
rejected. The same SQL ownership resolver governs triggers, selected reads and mutation locks;
source lookups compare primary-key columns directly so existing indexes apply. A public field
allowlist still excludes credentials and execution internals. One idempotent
installer serves the initial feature migration and development setup without rewriting SQL text.

### Reads and startup

Cached records open immediately, including during a background pull. Complete pages never expose
a known new version without its body. Uncached detail and conflict refresh use deduplicated targeted
reads; those reads cannot advance or complete inventory. Failures remain explicit, and offline
requests can use a retained copy. Runtime attempts are not persisted as resource state.

Partial inventory never proves absence. Optional preferences use product defaults only after
an authoritative absent/deleted result or completed inventory. Opening a default-valued form does
not stage an operation. Cached startup can render from its known shell records while synchronization
continues; first-ever startup needs the required server records before rendering.

### Durable commands and editor buffers

Single-resource commands enter the outbox before local save succeeds. A shared pure preparation
boundary derives identity, optimistic content, parent references and coalescing from the command
and observed state. UI callers do not construct queue bookkeeping. New objects keep stable
client-generated IDs. Today quick capture uses this same durable creation path.

One account runtime owns pull/send wakeups, lane failures and per-operation retry eligibility.
A failed operation blocks its dependents, not unrelated work. A Web Lock serializes senders;
followers do not wait for that lock to initialize. Accepted mutations request another pull to
include secondary records absent from the primary response.

Attempted operation identity and normalized input are immutable. Unsent compatible edits can
coalesce only when their exact ancestry permits it. Mounted drafts retain their observed base;
queue order, equal content and a disappeared entry do not prove acknowledgement. Locally created
parent references wait for the parent's applied result. A shared editor session tracks dirty
generations, serializes local persistence and guards adoption against later typing, replacement,
account changes and closed panes. Editor-specific serialization and selection remain local.

The client atomically commits settlement, its body and an exact receipt. It keeps the latest
local receipt per resource to resolve late descendants. Only the exact predecessor operation
can supply a new base. Missing evidence preserves the original content for explicit conflict
review. Server deletion never silently authorizes recreation.

### Permanent server proofs

The server operation lock, version guard, domain mutation and permanent applied/cancelled proof
share one transaction. The proof stores operation identity, normalized request hash and outcome
version, without a response body. Reusing an identity with different input fails. Retrying cannot
apply the operation again. There is no acknowledgement endpoint or receipt compaction lifecycle.

Normal success includes the authoritative body. Replay returns that body only if the original
version is still current; otherwise it returns the application proof. A newer body cannot stand
in for the original result. Descendant edits without exact local evidence retain their content
and enter review. Cancelling an uncertain operation acquires the same operation lock. If application
won, cancellation returns its proof instead of pretending to undo the mutation.

Review captures exact operations and dependents. Keep uses the reviewed server version and a new
operation identity. Discard refuses unreviewed descendants and resolves uncertain submission first.
Published-note discard requires the actual loaded published body. Compound operations such as
recursive deletion, note moves and skill import stay online because one parent ETag cannot guard
all children. Historical restore, binary transfers, generation and security actions also stay online.

### Account identity and damaged storage

A validated bootstrap retains deployment-dependent defaults and model metadata for offline startup.
It contains no workspace page snapshots. A readable account-hint cookie must match before restore;
the server sets it only after authenticating and clears it on invalidation/sign-in/sign-out.
The hint is not a credential. Every server request still authenticates the session and account.
Clearing the hint blocks offline reopening without deleting unsent work.

Malformed local storage blocks the account and leaves raw rows untouched. A separate export path
uses lazily loaded dexie-export-import without normal startup. Confirmed account reset removes
local records and unsent work, then downloads server data again. Other tabs must release their
connections. No legacy migration, old-tab compatibility, granular quarantine or ancestry repair
protocol is required for this unreleased feature.

### Dependencies

Dexie supplies transaction and live-query mechanics; dexie-export-import supplies raw chunked
export. Existing Svelte state, PostgreSQL constraints and Web Locks cover the remaining coordination.
The selected design needs atomic multi-store updates, explicit version conflicts and independent
follower progress. Adding a replication service or another client state framework would require
adapting those semantics and another operational boundary. No additional framework is introduced.

## Consequences

- Subsequent sync transfers changed records only. There is one durable body/version representation.
- Initial transfer and browser storage grow with the workspace. Cached startup need not repeat it.
- Small server operation proofs grow with accepted/cancelled operations. They have no guessed expiry.
- Journal retention grows with distinct resource identities, including tombstones. Pruning requires
  an explicit cursor-expiry/reset protocol.
- Journal publication serializes per account at commit; unrelated accounts do not share the lock.
  Declared database-only transactions may retry transient failures after rollback. Callbacks with
  external effects do not opt into replay.
- Browser storage loss cannot be eliminated. Raw export and confirmed reset replace complex partial
  repair, while valid unsent edits, exact ancestry and cancellation safety remain protected.
- The generic mechanism stays under the existing client, model, repository, service and controller
  layers. No new architecture layer or client-side event-sourcing system is added.
