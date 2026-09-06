# Incremental workspace synchronization

ADR 0040 records the accepted scheme. Worktree: `artifacts/worktrees/incremental-sync`.
Branch: `feat/incremental-sync`. Commit and push each completed, verified checkpoint.

## Acceptance contract

Initial warming downloads all current workspace records and metadata, including saved chats.
Later synchronization compares the complete ID/ETag inventory and downloads only changed bodies.
Lists use local projections. Cached objects open immediately; known-updating objects wait online
and use their previous copy offline. Ordinary edits persist offline and reconcile using ADR 0010.
File bytes, history, generation, uploads, server search, and security operations remain on demand
or online. There are no guessed read windows, silent fallbacks, or automatic conflict merges.

## Execution checklist

- [x] Record the accepted design and implementation checklist.
- [x] Define and test pure cache transitions, inventory reconciliation, and mutation lifecycle.
- [x] Implement the read coordinator, in-memory fakes, IndexedDB cache, and account isolation.
- [ ] Add cross-tab coordination and durable mutation queue persistence.
- [x] Add database sync versions and the complete authenticated inventory repository.
- [ ] Add typed object readers and expose synchronization through controller/remote boundaries.
- [ ] Add atomic guarded mutation replay and durable idempotency receipts.
- [ ] Build shared normalized projections and migrate app routes to browser-shell loading.
- [ ] Wire offline mutations across supported domains and preserve legacy note/skill drafts.
- [ ] Replace private page snapshots with a data-free service-worker app shell.
- [ ] Test database contracts, offline warming/reload/replay, and incremental payload transfer.
- [ ] Pass lint, check, architecture, unit, contracts, docs, and targeted PWA checks.
- [ ] Push final changes, open the PR, and resolve required checks.

## Implementation rules

Pure state rules belong in models, browser I/O in client adapters, and server cross-domain work
in controllers with factory-provided capabilities. Parse external records at their boundaries.
Keep domain mutation rules in their existing services. One assertion per test and shared fakes.
Do not claim a checkpoint complete until its verification passes. Record blockers and remaining
integration explicitly. Do not delete the existing note outbox before migration is verified.

## Verified checkpoints

- `d6b24ef`: ADR and execution checklist.
- `757a77f`: 25 pure cache and mutation behavior tests; type check and architecture checks passed.
- `b7b5313`: 16 coordinator tests and 6 Chromium IndexedDB tests; lint, type check, and architecture checks passed.
- Database version registry and inventory: 12 PostgreSQL contract tests; type check and architecture checks passed.

The version metadata lives in one database registry keyed by resource type and a JSON tuple of
primary-key values. This avoids leaking database synchronization fields into existing domain
serialization. One trigger function covers all registered resources. Inventory reads are a single
SQL statement and fail if a source record lacks its required version. PostgreSQL and PGlite result
formats are parsed at the repository boundary.

The app is not integrated yet. Existing route loaders, note outbox, and service worker remain active
until replacement and migration are tested. No claim of user-facing caching completion is made.
