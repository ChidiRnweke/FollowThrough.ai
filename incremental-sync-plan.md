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
- [ ] Define and test pure cache transitions, inventory reconciliation, and mutation lifecycle.
- [ ] Implement shared coordinator, in-memory fakes, IndexedDB persistence, and account isolation.
- [ ] Add database sync versions and complete authenticated inventory/object readers.
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
