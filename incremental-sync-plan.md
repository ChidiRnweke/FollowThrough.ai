# Incremental workspace synchronization

ADR 0040 records the accepted scheme. Worktree: `artifacts/worktrees/incremental-sync`.
Branch: `feat/incremental-sync`. Commit and push each completed, verified checkpoint.

## Acceptance contract

Initial warming downloads all current workspace records and metadata, including saved chats.
Later synchronization pulls the compact account journal since a durable cursor, applies explicit
tombstones, and downloads only changed bodies. The initial complete-inventory proposal is superseded.
Lists use local projections. Cached objects open immediately; known-updating objects wait online
and use their previous copy offline. Ordinary edits persist offline and reconcile using ADR 0010.
File bytes, history, generation, uploads, server search, and security operations remain on demand
or online. There are no guessed read windows, silent fallbacks, or automatic conflict merges.

## Execution checklist

- [x] Record the accepted design and implementation checklist.
- [x] Define and test pure cache transitions, journal application, and mutation lifecycle.
- [x] Implement the generic resource cache, in-memory fakes, IndexedDB cache, and account isolation.
- [ ] Add cross-tab coordination and durable mutation queue persistence.
- [x] Add database sync versions and a compact authenticated journal with commit-ordered account cursors.
- [x] Add typed object readers and expose synchronization through controller/remote boundaries.
- [x] Add atomic guarded mutation replay and durable idempotency receipts for the initial command set.
- [ ] Build shared normalized projections and migrate app routes to browser-shell loading.
- [ ] Wire offline mutations across supported domains and preserve legacy note/skill drafts.
- [ ] Replace private page snapshots with a data-free service-worker app shell.
- [ ] Test database contracts, offline warming/reload/replay, and incremental payload transfer.
- [ ] Pass lint, check, architecture, unit, contracts, docs, and targeted PWA checks.
- [ ] Push final changes, open the PR, and resolve required checks.

## Implementation rules

Pure state rules belong in models, browser I/O in ordinary client modules, and server cross-domain work
in controllers with factory-provided capabilities. Parse external records at their boundaries.
Keep domain mutation rules in their existing services. One assertion per test and shared fakes.
Do not claim a checkpoint complete until its verification passes. Record blockers and remaining
integration explicitly. Do not delete the existing note outbox before migration is verified.

## Verified checkpoints

- `d6b24ef`: ADR and execution checklist.
- `757a77f`: 25 pure cache and mutation behavior tests; type check and architecture checks passed.
- `b7b5313`: 16 coordinator tests and 6 Chromium IndexedDB tests; lint, type check, and architecture checks passed.
- `f1de5c0`: database version registry and inventory; 12 PostgreSQL contracts passed. The inventory
  polling path is superseded by the compact journal.
- `32a6307`: conditional typed resource reads and the explicit foreground read barrier; 18 PostgreSQL
  contracts, 45 focused node tests, type check, scoped lint, and architecture checks passed.
- `f26ada5`: compact journal, account cursor, durable tombstones, and offline read-barrier release;
  48 focused node tests, 24 PostgreSQL contracts, and 7 browser persistence tests passed.
- `541d2d5`: shared controller/remote reads and versioned deletion ordering; 51 focused node tests,
  24 PostgreSQL contracts, and 7 browser persistence tests passed.
- `0e86091`: durable operation receipts; 29 PostgreSQL synchronization contracts passed.
- `e92797e`: stable IDs for projects, folders, notes, tasks, and skill notes; creation checks passed.

The initial guarded commands cover project create/rename/archive/numbering; folder creation and
note moves; note create/rename/save/archive/restore/publish/discard/delete/numbering; task
create/update/delete; and skill creation. Each owning controller supplies its existing operation
to the shared transaction service. Further ordinary operations and the browser queue remain to be
connected; this checkpoint does not claim complete offline mutation support.

The version metadata lives in one database registry keyed by resource type and a JSON tuple of
primary-key values. This avoids leaking database synchronization fields into existing domain
serialization. Source triggers cover all registered resources; journal metadata changes in the same
transaction. A per-account head lock prevents commit-order cursor gaps. Tombstones retain ownership
after cascading deletes. PostgreSQL and PGlite result formats are parsed at the repository boundary.
The read cache consumes only journal deltas; it persists each cursor with its invalidations and
tombstones, then downloads bodies. Offline transitions release waiting readers to their saved copy.
The helper is `client/sync/resource-cache.ts`, not an additional architectural layer.

The browser shell now initializes the shared account resource store. Note panes read through its
foreground barrier, and normalized shell/list/note projections have focused tests. Remaining page
server loaders, the legacy note mutation outbox, and the old service worker still need replacement.
This is an integration checkpoint, not completed offline support. Before retiring the old writer,
migrate and test its drafts, including drafts with no synchronization ETag and interrupted sends.

Further verified checkpoints:

- `44226c7`: atomic IndexedDB queue acknowledgement and authoritative cache persistence; 18 browser tests passed.
- `eebadff`: account writer lock, frozen retries, conflict isolation, and logout handling; 8 submission tests passed.
- `a012235`: shared workspace resource entry point and local overlays; browser and model tests passed.
- `54246c0`: explicit edit ancestry, competing-tab conflict protection, and removal of the superseded mutation model; 72 focused node tests and 11 browser tests passed.
- `75a9659`: normalized shell, task, and project projections and stopped-account error handling.
- `e263dd3`: validated bootstrap and server-set account hint; 30 focused configuration/startup tests passed.

The browser shell integration passes type, scoped lint, and architecture checks, 13 focused
bootstrap/view tests, and 5 browser resource-store tests. Full app/PWA validation remains pending.

Legacy migration foundation now retains unversioned base/local/remote copies, excludes unresolved
bases from submission, validates before sending, and imports with atomic durable markers while
keeping the source database. It is deliberately not invoked until the old writer is replaced.
Validation: 42 focused node tests, 15 IndexedDB browser tests, 6 PostgreSQL mutation contracts,
type checking and architecture audits. The contract exposed and fixed numbering persistence in
guarded imported saves.

Shared conflict recovery now persists authoritative conflict bodies/tombstones atomically, exposes
keep-local and exact-set discard through the queue, and refuses to strand unreviewed descendants
or discard unknown submission outcomes. Verified with 40 business tests, 20 browser tests, type
checking, scoped ESLint and architecture audits. Feature conflict UI is still being integrated.
