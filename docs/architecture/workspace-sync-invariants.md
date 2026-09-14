# Workspace synchronization invariants

The product contract comes from ADRs 0010, 0015, 0037 and 0040. Tests must verify
observable outcomes, including progress without manual refresh. Passing test counts
are not evidence that an untested workflow works.

| ID              | Contract                                                                                                                                      | Verification boundary                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-ACCOUNT    | Accounts scope data, receipts, recovery and notifications; stopped sessions hide late results while already received success remains durable. | Queue stop/late receipt specs, IndexedDB isolation, shared adapter contracts, account-specific browser channels.                            |
| SYNC-INTENT     | A reported local save survives reload; failures and refresh cannot erase intent.                                                              | Shared fake/IndexedDB outbox contracts, draft reload and PWA offline workflows.                                                             |
| SYNC-AUTHORITY  | Only authoritative receipts settle intent; attempted input is immutable; unknown is not deleted.                                              | IndexedDB normalized input, PostgreSQL cancellation/rollback contracts, route access policy.                                                |
| SYNC-ANCESTRY   | Dependencies retain exact ancestry; missing proof requires an explicit decision.                                                              | Outbox contracts, damaged-ancestor recovery, stale reviewed-set rejection.                                                                  |
| SYNC-DECISION   | Discard never submits; keep/discard affects exactly reviewed intent and dependencies.                                                         | Reconnect/discard draft regression, uncertain cancellation, rendered confirmation/cancel/elsewhere-resolution tests.                        |
| SYNC-PROGRESS   | Eligible work retries as time advances; unrelated work progresses during transport failure or a stalled submission.                           | Manual scheduler transitions, acknowledgement backoff, nonblocking follower ownership, independent read/write lanes.                        |
| SYNC-TABS       | Active clients observe durable changes without manual refresh; notifications carry no record bodies.                                          | Real IndexedDB/Web Locks/BroadcastChannel clients; two-page PWA scenarios.                                                                  |
| SYNC-READ       | Known-newer online reads wait or fail; offline reads may retain a copy; versions and recovery fences never regress.                           | Resource cache races, finite stale-response tests, shared cache repository contracts.                                                       |
| SYNC-DOWNLOAD   | Preparation and warming share bounded body capacity and coalescing, without a total record cap.                                               | 70-record preparation, concurrent warm/prepare capacity, mixed successful/failed batches.                                                   |
| SYNC-READINESS  | Unknown, absent, unavailable and failed differ; actions depend only on relevant data.                                                         | Per-collection readiness, required startup data, rendered memory action during download.                                                    |
| SYNC-RECOVERY   | Damaged content remains exportable; blockers have an explicit durable exit; removed legacy sources cannot resurrect.                          | Real IndexedDB quarantine, scoped blockers, repeat removal, mutable recurrences, legacy source cleanup/fence, rendered export/confirmation. |
| SYNC-CONTINUITY | Recent remains five items; successful decisions remove suggestions; live chats survive hydration; failures remain visible.                    | Today projection, chat decision/live history, offline composer, search failure outcomes, configured model selection.                        |
| SYNC-REVIEW     | Status and actions are honest; destructive decisions require confirmation; hierarchy and accessibility hold across viewports.                 | Rendered decision tests, 1280/400px light/dark review captures, shared type and spacing ladder.                                             |

| SYNC-INSTALL | Installing a release fetches its shell and assets freshly, even when their URLs persist between releases. | Request cache-policy contract and production PWA installation/offline navigation. |

## Execution rules

For each concern, add a compiling behavioral regression, observe its assertion fail,
then change production behavior. Infrastructure failures do not count as red. Existing
correct invariants may pass immediately; do not manufacture failures. Use one expectation
per test and shared fakes. Record commands and observed outcomes below. Preserve these
rules through refactoring and compaction.

Keep the existing PR open and its readiness unchanged. Preserve the online read barrier,
all record types, indefinite deduplication evidence, and legacy database fence. Logout and
device removal are excluded. Include the review redesign and a dedicated CI PWA gate.

## Execution ledger

- Baseline: `56d855c`. Prior gates passed but missed autonomous progress and complete decision workflows.
- The checks below cover the implemented contracts; they do not establish exhaustive correctness.

### First red–green results

All commands use `pnpm exec vitest run` with the named project and spec. Red logs are
in ignored execution artifacts (`/tmp/sync-invariants-*-red.log`); test names below identify
the durable regressions. No infrastructure failure was counted as red.

| Rule            | Regression / observed red                                                                                                          | Green evidence                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| SYNC-DECISION   | `drafts.svelte.node.spec.ts`: queued reconnect/discard changed the authoritative note and failed selection validation.             | node-fast, 18 tests passed.                                              |
| SYNC-PROGRESS   | `mutation-queue.spec.ts`: advancing the manual clock left the failed edit pending.                                                 | node-fast, 21 tests passed including stop and follower ownership.        |
| SYNC-READ       | `resource-downloads.spec.ts`: individual and batch reads exhausted a controlled transport without progress.                        | node-fast with resource-cache, 34 tests passed.                          |
| SYNC-DOWNLOAD   | `resources.svelte.spec.ts`: preparation retained only 32 of 70 records at a 32-read transport budget.                              | browser-focused, all 70 retained.                                        |
| SYNC-READINESS  | `resources.svelte.spec.ts`: missing project body made a known empty attachment collection incomplete.                              | browser-focused, 26 tests passed.                                        |
| SYNC-AUTHORITY  | `transaction-context.spec.ts`: generic runner replaced original constraint errors; sync missing-reference case lacked a rejection. | node-fast with mutation and list specs, 25 tests passed.                 |
| SYNC-CONTINUITY | `lists.spec.ts`: Today returned seven recent notes.                                                                                | Same node-fast gate, five most recent retained.                          |
| SYNC-TABS       | `cross-tab.svelte.spec.ts`: second client retained Project Alpha after an offline rename, with real IndexedDB/locks/channel.       | Real browser clients and both two-page production PWA scenarios passed.  |
| SYNC-RECOVERY   | `storage-recovery.svelte.spec.ts`: exported unknown blocker had no removal path.                                                   | Real IndexedDB recovery and rendered export/removal confirmation passed. |

Architecture audit passed after the first domain/progress batch; rerun after subsequent structural changes.

### Additional observed regressions

- Imported retry → conflict repeatedly fired an expired deadline. The manual scheduler now becomes idle; acknowledgement backoff also survives independent edits.
- A stopped session lost an already received success during shutdown. The existing durable acknowledgement regression caught this implementation regression; settlement finishes before storage disposal.
- Warming and a simultaneous preparation exceeded the shared 32-body budget. Both now finish under that same capacity (35 cache/download tests passed).
- A damaged ancestor left descendants waiting forever after removal. Descendants preserve their ancestry and require a decision; repeated removal can finish cleanup from a durable removal marker.
- A removed cache recovery item prevented later damage at the same mutable key from being exported. Mutable copies can now be quarantined again; immutable legacy removal proof remains.
- Recovery notifications left the other client's recovery list stale. Both real-browser client tests pass.
- Required startup data could remain unreadable when the session reached rendering. Required collections now fail startup explicitly; optional absent settings still use their established defaults.
- Moving a newly streaming chat into a tab replaced its live question with cached history. The live turn is retained.
- Successful suggestion decisions kept their cards; failed search replacement rejected an unobserved promise; an idle offline composer hid its connection state. These workflow regressions pass.
- The memory loading branch hid its first action despite the earlier readiness fix. A rendered test caught it; the action remains available while bodies download.
- Completed or already aborted transactions threw a second `InvalidStateError` during cleanup. Real IndexedDB regressions exposed event-listener ordering as well: lifetime tracking must run before completion resumes its caller. One shared helper now preserves failure cleanup in both cache and outbox; all 44 targeted storage tests passed.
- Release installation used the default HTTP-cache policy, allowing stable shell URLs to reuse an older representation. The request-policy assertion failed, then passed with explicit `reload`; this is a platform-policy contract, not a simulated HTTP-cache test.
- Shared cache contracts exposed two inaccurate fake behaviors: accepting stale recovery generations and ambiguous duplicate changes. Both adapters now satisfy the same contracts.

### Deliberate boundaries

Collection readiness means usable local membership, not a guarantee that every retained body
is current. Detail reads still enforce the known-newer online barrier. Unknown objects produce
404 online and unavailable offline; authoritative tombstones remain distinct. We do not fabricate
delete receipts. Submission ownership remains exclusive, but followers try without blocking and
migration uses a separate lock. This preserves one sender without blocking another tab's startup.

The claimed trailing-space cancellation defect was not reproduced through the real adapter:
both attempted and retained cancellation inputs are normalized identically. The IndexedDB test
and PostgreSQL normalized-cancellation contract cover that boundary without reparsing historical
cancellation payloads under a newer command schema.

### Local validation at `29185ef`

- `pnpm test:unit`: 301 files, 3,415 tests passed.
- `pnpm test:browser:full`: 63 files, 541 tests passed.
- `pnpm test:contracts`: 30 files, 191 PostgreSQL contracts passed locally.
- `pnpm test:sync:pwa`: all 26 production PWA scenarios passed again after the transaction-lifetime and precache-policy fixes with minted authentication and disposable PostgreSQL. This includes two-page observation without focus and startup while another tab's submission is stalled.
- `pnpm check`: zero errors and warnings.
- `pnpm lint`: passed.
- `pnpm docs:check`: zero errors and warnings, one existing Astro hint.
- `pnpm test:architecture`: zero topology, source, test-quality, Chisel and UI violations after the final test additions.
- Targeted mutation verification: removing automatic retry scheduling, removing shared body capacity, and restoring global constraint translation each failed the corresponding behavioral assertions. After restoring production code, all 66 targeted tests passed.
- [Matching evidence](../pr-evidence/incremental-sync/invariants/README.md): queued, conflict, list and menu states at 1280/400px in both themes. Computed styles verify the detail ladder; visible controls fit the viewport. These seeded component captures are distinct from production PWA verification.

### Remaining limits

Deleting a resource that the server has never known still fails
without a receipt; inventing an authoritative tombstone would violate SYNC-AUTHORITY. A future
change needs an explicit absent-deletion policy. The full PostgreSQL/PWA performance benchmark
also remains unmeasured; the existing 7,000-record result is a client-only measurement.

### Storage and runtime simplification

The Dexie refactor preserves the contracts above. The previous transaction-lifetime helper and
application change channel are replaced by Dexie; their historical results remain recorded above.

- `database.svelte.spec.ts` checks rollback, original failure preservation, native version-6 upgrade,
  pending writes/receipts/recovery retention, blocked upgrades and old-tab closure.
- `workspace-local-repository.svelte.spec.ts` checks coherent settlement, updates across connections
  without a changed row count, observer idleness and account isolation.
- `workspace-runtime.spec.ts` checks late-commit feed discovery, first-failure retries, independent
  work during backoff, startup recovery becoming idle, and clearing errors after automatic recovery.
- Existing fake and real-storage contracts continue to cover ancestry, conflicts, cancellation,
  recovery and version/tombstone ordering. Shared fakes now persist the authoritative body together
  with queue settlement rather than relying on a second callback write.
- PostgreSQL contracts check concurrent/repeated acknowledgement and receipt replay while a source
  row is locked by another transaction.
