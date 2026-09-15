# Accounts, synchronization, search, and operations

Snapshot: `74215c9a`. Families 01–02 and 20–26. Static source and test review; no database race,
browser journey or live telemetry reproduction is implied by the named tests.

## Concepts and boundaries

| Concept                 | Invariant                                                                         | Entry and ownership                                                   |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Account/session/token   | Admission, time-bounded session and revocable API authority are distinct          | Auth routes/hooks → identity services/repos; token controller and MCP |
| Offline account binding | Names cached data but does not authenticate a server request                      | Bootstrap/session cookie → account-bound local database               |
| Downloaded workspace    | Known records plus honest completeness                                            | Session/resources/runtime → sync remote/controller → exact page       |
| Pending change          | Durable intent against an observed version                                        | Editor draft → outbox → remote domain synchronization                 |
| Operation proof         | Permanent result of one exact submitted intent                                    | Receipt repository and mutation transaction                           |
| Conflict review         | Decision about specified operations and descendants                               | Resource review/store → keep/discard/cancel → durable outcome         |
| Editor session          | Local buffer lifetime distinct from saved state                                   | Shared dirty generations, checkpoint and guarded adoption             |
| Today/attention         | Triage from supplied date and resolved facts                                      | Parallel server `Workspace` and browser `WorkspaceViews`              |
| Searchable edition      | New lexical content plus last usable semantic content until replacement completes | Index staging → background completion                                 |
| Workbench               | Working set, URL navigation and interaction focus                                 | Shell/commands → store → URL/local layout                             |
| Maintenance lifetime    | Outstanding durable work plus scheduling/drain behavior                           | Worker → scheduler → task discovery and execution                     |

## Findings

### S01 — Session lifetime is implemented twice; tests assert existence

**Static.** `services/identity/sign-in.ts:SignIn` and `identity/sessions.ts:SessionRegistry` each
implement identifiers, thirty-day creation, expiry deletion, fifteen-day renewal and logout.
Their colocated tests only assert that the exported class is a function.

Create one owner of authenticated-session behavior. Provider sign-in resolves account identity then
uses that capability; ordinary requests use the same capability. Coordinate through the appropriate
application boundary instead of introducing forbidden service-to-service imports. Use stateful session
repositories and a controlled clock to test creation, exact expiry/renewal boundaries, logout and failures.
Retain API-token expiry/revocation/admission/plaintext-secrecy tests.

**Policy question:** provider linking by email ignores supplied `email_verified`. Check provider trust,
identity uniqueness and concurrent linking policy before changing behavior. No exploit is claimed.

### S02 — Today and memory attention still have duplicate definitions

**Static.** Module function `toPendingMemoryNotifications` and `WorkspaceViews.shell` separately count and
label profile/project attention. `Workspace.getTodayView` and `WorkspaceViews.today` separately build
date groups, pending counts, pinned notes and five recent notes. PR #47 did not unify these.

Define one Today projection and one attention projection over resolved facts. Keep cache/database
acquisition separate. Server adapters are live: the agent's `get_workspace_context` and `get_today_view`
tools call them. Retain those adapters while sharing decisions. Test local dates, archived
projects, profile/project scopes, incomplete input and existing recent-five presentation. A five-row UI
convention is different from truncating synchronized inventory.

### S03 — Shared rules exist, but workspace modules still collect many responsibilities

**Static design concern.** `models/workspace-mutations/index.ts` combines wire commands, resource
identity, queue metadata, domain decisions and optimistic results. `WorkspaceViews` spans most domains;
sync and write-review models contain user-facing copy.

Move decisions only after each semantic owner is reviewed. Preparation obtains facts and invokes that
owner; command identity/outbox protocol remain centralized. Presentation owns labels. PR #47 already
removed substantial duplicate rules and added completeness tests. Do not reintroduce duplication by
moving only one caller or creating a second pure service implementation.

### S04 — Workbench account ownership and persistence validation are unclear

**Static; cross-account impact unverified.** `IndexedDbWorkbenchLayout` uses global database
`followthrough-note-sync`/key `current` without an account argument, creates a retired store during
upgrade and trusts typed stored values without runtime parsing. `WorkbenchStore` calls local IndexedDB
a cross-device authority.

Choose account-specific versus device-wide working-set ownership before migration. Recommended default:
account-specific resource tabs. Trace sign-out/hydration and compatibility; distinguish URL focus from
interaction focus. Test account transition, malformed stored layout and pending navigation. Fix inaccurate
comments without inventing cross-device synchronization.

### S05 — Accepted attachment content is omitted from search after fifty chunks

**Static.** `EmbeddedAttachmentIndexer.index` slices to `ATTACHMENT_CHUNK_LIMIT = 50` and returns
`truncated`; processing reports `partial`. This is an unexplained content limit, not wholly silent reporting.

Index accepted extracted content through bounded provider batches without discarding its tail. Keep
partial extraction distinct from partial indexing. Test more than fifty chunks with unique relevant
tail text. Preserve source continuity and provider batch constraints. Measure cost; do not guess a larger cap.

### S06 — Controller instrumentation begins after invocation

**Static ordering defect.** `instrumentedController` calls `Reflect.apply` before opening its span.
The synchronous prefix and any child work start outside the boundary; synchronous throws bypass its
handler. The implementation comment acknowledges part of this tradeoff. The test “logs info before the
method body runs” records a `.then` callback rather than body entry and cannot prove its title.

Instrument an explicit public asynchronous capability surface before invocation. Preserve synchronous
private helper contracts; do not discover async methods by executing them first. Test body-entry ordering,
child parentage before the first await, synchronous throw from declared async capability, rejection and
existing synchronous-helper behavior. Live Phoenix verification is still needed for a telemetry claim.

### S07 — Maintenance has a budget but no demonstrated fairness

**Static risk, not observed starvation.** `listPendingSources(limit)` uses distinct sources with no
ordering/fairness cursor; repeated failures stay pending. A selected failing set could consume every tick.

Test independent-source progress with more sources than the per-tick budget and persistent failures.
Choose explicit bounded traversal/fairness if the test establishes a gap. A work budget postpones work;
it is not equivalent to the attachment cap dropping content. Keep scheduler non-overlap and drain semantics.

### S08 — Documentation and feedback comments overstate contracts

ADR 0010 still refers to retired note synchronization paths and says diagrams lack offline sync;
ADR 0040 and current commands supersede that. Feedback comments promise fire-and-forget/non-failure,
while the remote awaits repository persistence. Define failure as retryable submission failure without
disrupting the originating action; do not swallow errors to satisfy an inaccurate comment.

## Why the synchronization machinery exists

Migrations `0050_workspace_sync_versions.sql`, `0051_workspace_sync_changes.sql` and
`0052_workspace_sync_receipts.sql` distinguish resource version, account checkpoint and operation proof.
Sequence allocation alone does not prove commit order. Account-head locking and deferred journal
publication preserve ordering; page reads use repeatable-read and fail rather than fabricate missing bodies.

Retain PostgreSQL contract tests:

- “does not advance the visible cursor past an uncommitted change”
- “assigns cursors at publication so a later transaction can commit first without hiding changes”
- “includes the current body with the journal version in the same page”
- “fails a complete page when a selected live resource lost its version metadata”
- “does not add an account-head deadlock to overlapping resource writes”

Account ownership comes from actual parent rows and retained deletion metadata. Reads, source locks,
receipts and journals remain account-scoped. Keep tests for foreign objects/receipts/tombstones, rejected
owner transfers, cascading deletion and every synchronized resource's registration.

Cancellation and execution take the same operation lock. A cancellation proves nonexecution or returns
the already-applied proof; it never undoes a saved edit. Canonical request hashing prevents changed input
under one identity. A later body cannot masquerade as the original successful result.

Keep cancellation/receipt tests for normalized input, lost responses, pre-submission cancellation,
late cancellation, rollback on proof failure and no document bodies in the permanent ledger.

The client must preserve these distinct facts:

- Partial inventory cannot establish absence.
- Attempted operation identity/input are immutable.
- Queue disappearance is not acknowledgement.
- Failure blocks dependent changes, not unrelated work.
- Later typing, account changes and closed panes invalidate old save adoption.

Exact useful tests include “does not treat disappearance from another writer’s discard as acknowledgement”,
“does not submit after logout while loading a queued write”, “continues unrelated writes after a conflict
without discarding the conflicting edit”, “keeps downloads responsive while submission waits for a response”,
and “does not adopt a save after its account lifetime ends”. Their quantity is not evidence of waste.

## Recovery, PWA, search and workers

Raw damaged-data export/reset intentionally bypasses normal parsing. An account-bound connection lifetime,
disabled auto-open and reset generation prevent old activity from repopulating a reset database. Preserve
tests for malformed raw export, another account remaining intact, reset completion and old network responses.

`tests/e2e/pwa.e2e.ts` provides production journeys: no private responses in Cache Storage; unvisited cached
routes offline; stable IDs through offline creation/reload; diagram trash operations; another tab discarding
an open editor's write; and independent tabs while submission waits. These were inspected, not rerun here.
Service-worker caches contain public assets and a data-free shell. Do not replace account-bound resource
storage with cached private page responses.

Search staging keeps new text lexically available and previous semantic content usable. Preserve
“keeps answering semantically when a further edit lands mid-backfill”. Scheduler isolation/draining and
the separate web/worker build are legitimate mechanisms under accepted ADRs.

Remaining scenario verification: real account-switch/logout with PWA, upgrade from older caches,
provider identity-linking policy, fairness under persistent failures and actual telemetry delivery/shutdown.
