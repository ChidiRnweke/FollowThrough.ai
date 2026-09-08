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

The branch includes current `master`. Local validation passed:

- `pnpm lint`
- `pnpm check` — zero errors and warnings
- `pnpm test:architecture` — topology, source, test quality, Chisel, and UI audits
- `pnpm test:unit` — 3,325 tests
- `pnpm test:browser:full` — 487 tests
- `pnpm test:contracts` — 181 tests
- `pnpm docs:check` — zero errors and warnings, one Astro hint
- `pnpm test:sync:pwa` — 25 production scenarios
- Conventional Commit validation for the task branch

The final unit and full browser suites passed serially. PWA evidence was refreshed from the final
production run and committed under `docs/pr-evidence/incremental-sync/`. Its four commit-pinned
image URLs returned HTTP 200. No live model calls or remote storage operations were used.

[PR #37](https://github.com/ChidiRnweke/FollowThrough.ai/pull/37) contains the final scope, evidence,
and required CI status. The worktree remains available for review; this task does not merge the PR.
