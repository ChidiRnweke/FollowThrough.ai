# Incremental synchronization fixes — PR #37

## Contract

Implement the reviewed audit on `feat/incremental-sync`. Preserve ADR 0040's shared cache,
account outbox, exact edit ancestry, and ordinary conflict review. Logout and device removal
are excluded by the user. Retain indefinite deduplication evidence; compact only acknowledged
receipt payloads, and document continuing operation-row growth. Never recreate an old receipt
from a current resource. Retain all synchronized types and the legacy database version fence.

## Execution

Read this file after compaction. Complete and verify each concern before marking it done.
Use the existing linked worktree and PR; do not merge. Commit only task changes conventionally.
Run focused behavioral checks as work progresses and all final gates before completion.
Blocked or incomplete steps remain unchecked with an explanation.

- [x] Capture matching starting/result UI evidence and measure the 7,000-record client fixture.
- [ ] Run the full 5,000-message/2,000-provenance PostgreSQL/PWA benchmark. Local Docker is unavailable; the client measurement and its limits are recorded in the evidence document.
- [x] Queue recovery: failed writes cannot starve independent work; attempted input stays
      immutable; retry backoff and explicit retry; preserve dependencies and authentication stops.
- [ ] Race-safe discard: cancel under the submission operation lock; retain cancellation proof;
      already-applied edits settle from server evidence; revalidate reviewed descendants.
      Implemented and unit-tested; real SQL contracts await CI.
- [ ] Publish the journal with a deferred constraint trigger, then retry declared database-only
      outer transactions on deadlock/serialization failures after checking
      callback replay safety; nested transactions share attempts and errors remain visible.
      Implemented and unit-tested; real SQL contracts await CI.
- [ ] Compact server receipt snapshots only after durable client settlement and retryable client
      acknowledgement; retain operation/hash/resource/original-version proof indefinitely.
      Implemented and unit-tested; real SQL contracts await CI.
- [x] Recover malformed IndexedDB rows individually with atomic quarantine, direct refetch for
      damaged cache bodies, inventory generation protection, and honest dependency blockers.
      Preserve legacy markers/fences, repair bootstrap online, expose recovery offline.
- [x] Superseded editor ancestry stages a normal conflict with original base/local content;
      neither queue absence nor a changed cache proves acknowledgement. No automatic rebase.
- [x] Page journal pulls with partial checkpoints and explicit inventory completion; batch body
      reads with independent failures; preserve coalescing/version barriers; memoize projections.
      Choose read sizes from recorded benchmark evidence, never truncate total results.
- [x] Replace status strip with sidebar/mobile utility indicator and pure indicator model.
      Rebuild review around decisions, meaningful fields, faithful diffs, dependencies,
      accessible actions, quarantine downloads, and the established empty state.
- [ ] Exhaustive command routing, rolling account-cookie renewal without per-request writes,
      repeatable push-managed development SQL setup, and corrected browser inspection docs.
      Implemented; repeatable setup contract awaits CI.
- [ ] Update ADR 0040, design rules, and audit classifications; validate all new contracts.
- [ ] Capture matching before/after desktop/mobile light/dark evidence; publish conventional
      commits to PR #37, update its four-section body, and wait for required CI checks.

## Required verification

Use one expectation per test and existing InMemory fakes. Contract tests use real PostgreSQL.
Cover independent/dependent queue failures, lost responses, cancel/send races, transaction retry,
receipt compaction, corrupt rows and cross-tab recovery, superseded/removed ancestry, pagination
with concurrent changes, interrupted persistence, mixed-success batches, and stable autosave layout.

Prepend `/home/chidi/.nvm/versions/node/v22.22.0/bin` to PATH before pnpm scripts.
Final gates: `pnpm lint`, `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`,
`pnpm test:contracts`, `pnpm test:browser:full`, `pnpm test:sync:pwa`, `pnpm docs:check`.
Selected screenshots belong under `docs/pr-evidence/incremental-sync/`; use synthetic data,
1280×720 and approximately 400px viewports, both themes, and commit-pinned PR image URLs.

## Observed validation

- `pnpm test:unit`: 296 files, 3,354 tests passed. The added account-only recovery export test
  also passed in the focused six-test storage recovery suite.
- `pnpm check`: zero errors and warnings, including the tooltip accessibility fix.
- `pnpm lint`: passed; focused lint covers the later tooltip/test edits.
- `pnpm test:architecture`: all audits pass at zero violations.
- `pnpm docs:check`: zero errors, zero warnings, one existing Astro hint.
- `pnpm test:browser:full`: 59 files, 494 tests passed, including all six review tests.
- `pnpm test:contracts` and `pnpm test:sync:pwa`: local Testcontainers cannot start because
  Docker integration is unavailable. Do not report these as local passes.
