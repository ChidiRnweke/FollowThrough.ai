# Workspace synchronization invariants

ADRs 0010, 0015, 0037 and 0040 define the product contract. The table identifies
observable guarantees and their verification boundaries. Passing counts alone do not
establish workflow correctness.

| ID              | Contract                                                                                                             | Verification boundary                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| SYNC-ACCOUNT    | One database and runtime per account. Stopped sessions cannot expose late results.                                   | Database lifetime, account isolation, queue stop and browser session tests.   |
| SYNC-INTENT     | A reported local save survives reload. Refresh and failure retain unsent intent.                                     | Shared outbox contracts, editor sessions and production PWA workflows.        |
| SYNC-AUTHORITY  | Attempted input is immutable. Only authoritative outcomes settle intent.                                             | Normalized input, PostgreSQL replay, cancellation and rollback contracts.     |
| SYNC-ANCESTRY   | A descendant uses only its exact predecessor's applied version. Missing evidence requires review.                    | Outbox ancestry, lost-response proof and mounted-draft tests.                 |
| SYNC-DECISION   | Discard does not submit. Decisions affect exactly the reviewed operations and dependents.                            | Stale-review rejection, cancel/send races and rendered confirmation tests.    |
| SYNC-PROGRESS   | Eligible work retries automatically. Failed or stalled writes do not block unrelated reads or edits.                 | Runtime deadlines, independent operations and stalled-writer PWA tests.       |
| SYNC-TABS       | Active tabs observe durable updates without focus or manual refresh.                                                 | Real Dexie/Web Lock clients and two-page PWA scenarios.                       |
| SYNC-PAGE       | Complete versioned records and the checkpoint commit together. Failed pages advance neither.                         | Repeatable-read PostgreSQL contracts and IndexedDB rollback/version ordering. |
| SYNC-PROJECTION | Queue settlement and its cached body become visible together.                                                        | Atomic repository projections and offline project/note creation PWA test.     |
| SYNC-READINESS  | Cached records open immediately. Partial inventory never proves absence.                                             | Cached startup, explicit inventory barriers and optional preference tests.    |
| SYNC-RECOVERY   | Malformed storage blocks the account and remains exportable. Reset requires confirmation and closes old connections. | Real IndexedDB malformed export, blocked deletion and rendered reset tests.   |
| SYNC-CONTINUITY | Editor buffers survive overlapping saves and refreshes. Live chats keep authority over cached history.               | Shared editor session, note/skill/todo and chat hydration tests.              |
| SYNC-INSTALL    | Release installation fetches the shell and assets freshly. Private HTML and page data are never cached.              | Service worker request policy and production offline navigation.              |

## Storage and execution

Four stores hold records, ordered outbox entries, exact local receipts and account metadata.
Dexie owns transactions and readonly live queries. Reads validate but never repair or delete
rows. Narrow write transactions compose the stores needed for each operation. A complete
account projection is the UI authority; execution helpers cannot publish partial settlement.

The server retains small permanent applied/cancelled proofs. It does not retain response
bodies or wait for client acknowledgements. A replay can supply the original body only if
that exact version is still current. Otherwise the proof prevents reapplication while local
descendants retain their content for review. Current content never substitutes for old proof.

One runtime schedules pulls and submissions. Each operation has independent retry eligibility.
Web Locks serialize senders without making another tab's startup wait for the writer.

## Scope and evidence

The feature is unreleased. There is no compatibility, legacy import, quarantine or granular
repair protocol. Account reset removes local records and unsent work after confirmation;
server data remains. The guarded outbox handles single-resource commands. Compound operations,
binary transfers, historical retrieval and agent execution remain online.

See the [implementation plan](../plans/workspace-sync-simplification-plan.md) for execution
results. The [earlier client-only benchmark](../pr-evidence/incremental-sync/performance.md)
does not establish PostgreSQL or production PWA performance. Historical review captures live
in [the earlier evidence](../pr-evidence/incremental-sync/invariants/README.md); their granular
storage-recovery behavior has been superseded by account export/reset.
