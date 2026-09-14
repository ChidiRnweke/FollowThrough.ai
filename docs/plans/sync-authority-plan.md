# Blueprint: one authority for workspace synchronization

## Executor instructions

Read this plan before each step. Work in the owned sync-simplification worktree. Preserve native version-6 pending writes, exact receipts, conflict review, recovery exports, and independent read/write progress. Verify each step before marking it complete. Commit conventionally and open a follow-up PR against #37; do not merge it or PR #37. PR #38 has already merged into #37.

## Context and scope

Dexie now owns transactions and cross-tab observation, but `ResourceCache` still merges durable state in memory after both commits and observations. Persisted cache state also encodes freshness and transfer state that can be derived from server versions and live attempts. This duplicates authority and reconciliation.

Make the repository the only owner of version ordering. Keep network attempts in memory and make cache/UI state a projection. Preserve the existing server protocol, native storage migration, and user behavior. Do not add event sourcing: the outbox already uses pure reducers in transactions. Do not replace the outbox with a single large array without measuring write amplification.

## Architecture

Follow ADRs 0010, 0015, 0037, and 0040. All external stored data remains parsed at the repository boundary. Network responses commit before readers see them. Cross-tab reads publish coherent account snapshots. A stale response cannot overwrite a newer body or recovery generation. The client retains offline copies but does not label them current when a newer server version is known.

## Plan

- [x] **Make cache commits commands, not a second publication channel.** In `client/sync/contracts.ts`, make `SyncCacheRepository.commit` return `Promise<void>`. In the IndexedDB and in-memory repositories, retain atomic version guards but remove returned deltas. In `ResourceCache`, read the authoritative snapshot after a commit and replace its durable state. Guard overlapping reads against a newer observation. Verify cache contracts, resource cache/download tests, and cross-tab repository tests.
- [x] **Separate durable knowledge from transfer attempts.** Store a known version and retained snapshot (or an explicit requested/deleted state). Derive public cached/updating states. Remove in-memory version merges and persisted fetching/failure transitions. Preserve legacy schema parsing at the boundary. Verify version-ordering, offline read barriers, corruption recovery, and migration tests.
- [x] **Consolidate account observation and startup.** Remove redundant cache/outbox startup reloads and inject the shared recovery connection where the repository already supplies the same facts. Keep one coherent account projection and transient execution state. Verify drafts, runtime, account isolation, and cross-tab behavior.
- [x] **Measure and validate.** Run lint, check, architecture, unit, full browser, contracts, docs, and production PWA gates. Record actual production line change and removed mechanisms. Update ADR 0040 and prepare the follow-up PR with observed results.

## Verification

Use existing behavior contracts and hand-written fakes. Add regression tests only for newly exposed races or changed storage boundaries. Run `pnpm test:architecture` after structural or test edits. Run scripts with the nvm Node bin directory on PATH. All 26 production PWA scenarios must continue to pass. No performance claim is established by test counts.

## Implementation notes

The resource model now has requested/present/deleted facts. All 169 targeted node tests and 71 browser storage tests pass after this conversion. The stored-row schema is version 3; old row formats are translated only at the storage boundary. Dexie schema version 2 closes older version-1 tabs before new rows are written.

Keep ResourceCache's in-flight pull/warm guards: collection preparation and explicit resource opens can run outside the background runtime. Removing those guards without changing the foreground contract would introduce duplicate transfers. The queue's operation retry deadlines likewise remain distinct from runtime lane retries. These guards protect actual concurrent entry points; they are not a second source of durable truth.

## Delivery

PR #38 merged into #37 while this work was in progress. The owned branch is now `refactor/sync-authority`, based on that merge. Open the follow-up against `feat/incremental-sync` and track required CI checks on that PR. The initial Dexie checkpoint stays unchanged.

## Verified result

The follow-up removes 128 net production source lines. Local validation passed: 3,450 unit tests,
552 browser tests, 194 PostgreSQL contracts, and all 26 production PWA scenarios. Lint, type checking,
architecture, and docs checks passed; docs retain one existing hint. CI remains the delivery gate.

Final ordering review added a regression for a newer recreation notice carrying a retained body
from before a known deletion. The body is dropped. All 72 focused sync tests passed after this fix.
