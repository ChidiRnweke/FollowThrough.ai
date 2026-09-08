# Incremental workspace synchronization

ADR 0040 defines the cache, journal, mutation, and conflict invariants. Implementation lives in the
`feat/incremental-sync` branch and its `artifacts/worktrees/incremental-sync` worktree.

## Acceptance contract

The app initially downloads current workspace records, including saved chats and file metadata.
Subsequent synchronization pulls the account journal from a durable cursor, applies tombstones,
and fetches changed bodies. Lists project the shared local records. Cached detail reads return
immediately; a known-updating object waits online and remains readable from its previous copy offline.
There is one resource cache and one durable account outbox. Routes have no separate data caches.

Offline writes use stable IDs, observed server versions, exact operation receipts, and explicit
conflict review. Notes, projects, folders, tasks, diagrams, memory entries, skill metadata, account
preferences, tool overrides, trust policies, export defaults, and chat names use this path.
Legacy unsent note and skill bodies migrate once with their original conflict evidence preserved.

Binary transfers, historical revision retrieval, generated exports, agent execution, and credentials
remain on demand. Compound actions that affect several independently versioned records remain online:
skill creation/import, note moves and history restoration, permanent note/folder/chat removal,
attachment/template/artifact removal, and suggestion acceptance. Their resulting record changes enter
the same journal. They do not have another local cache or an alternate offline queue. This boundary
avoids claiming that a parent version protects unseen changes to its children.

## Completed implementation

- Pure cache, journal, tombstone, outbox, ancestry, and conflict rules have business tests.
- IndexedDB commits records, cursors, queued writes, migration markers, and receipts durably.
- Account writer locks coalesce submission across tabs. Focus, visibility, navigation, and reconnect
  reload durable state. Removed queue entries require exact receipts before an editor shows success.
- Server triggers version all registered resources and produce commit-ordered account cursors.
- Guarded commands apply domain operations and persist their idempotency receipts atomically.
- App routes, lists, editors, saved chat history, and search read normalized shared projections.
- Superseded note/diagram coordinators, transports, repositories, query caches, page loaders,
  suggestion stores, and private service-worker page snapshots are removed.
- The service worker stores public assets and a generated data-free app shell.
- A shared review dialog preserves and downloads base/local/server records before conflict recovery
  or explicit discard. Optional forms cannot turn unknown storage or failed reads into defaults.
- The production PWA harness uses a temporary database and synthetic data, without model calls.

## Final verification

After reconciling current `master`, type and architecture checks passed, including the UI audit.
The unit suite passed 3,322 tests. The preceding production build passed 25 PWA scenarios; these cover
cached navigation, offline edits and creation, reload, replay, deletion, cross-tab discard, and settings.
Final broad browser, database contract, lint, docs, and production PWA runs remain to be recorded.

- [ ] Finish final local gates.
- [ ] Push the final checkpoint and open the PR with durable evidence.
- [ ] Resolve required PR checks.
