# Domain assessment continuation

Status observed on 2026-09-23. This register separates delivered changes from implementation on
unmerged branches. The original inventory, findings and workflow checkboxes remain historical
assessment evidence. They do not establish repository-wide completion.

## Merged

- [#57](https://github.com/ChidiRnweke/FollowThrough.ai/pull/57) established the assessment.
- [#64](https://github.com/ChidiRnweke/FollowThrough.ai/pull/64) delivered indexing recovery.
- [#65](https://github.com/ChidiRnweke/FollowThrough.ai/pull/65) delivered shared export preparation.
- [#66](https://github.com/ChidiRnweke/FollowThrough.ai/pull/66) bound approval to reviewed note content.
- [#67](https://github.com/ChidiRnweke/FollowThrough.ai/pull/67) delivered shared note views.

GitHub reported these five PRs as merged during this continuation. Their original validation
belongs to their PRs; this continuation did not rerun those commits independently.

## Open implementation

The inherited stack contains 79 open PRs: #71 through #148 and #157. Their current heads have
not all been revalidated. An implementation note or green check on one head is not evidence that
the entire stack is ready to merge.

- [#157](https://github.com/ChidiRnweke/FollowThrough.ai/pull/157) retains models as values, types,
  schemas and constructors, and places shared rules in services. Both continuation slices use this base.
- [#158](https://github.com/ChidiRnweke/FollowThrough.ai/pull/158) adds controller-owned task edits.
  The controller locks the authoritative active task, applies the shared edit rule, persists the
  resolved task and returns its view in one transaction. Browser commands use the same rule.
- [#159](https://github.com/ChidiRnweke/FollowThrough.ai/pull/159) adds task-creation ownership and
  depends on #158. Direct creation, atomic batches,
  automatic task acceptance, reviewed suggestion acceptance and offline creation use the shared
  creation rule. Persistence receives resolved tasks and retains actor, project and origin checks.
- [#83](https://github.com/ChidiRnweke/FollowThrough.ai/pull/83) already added durable task batches.
  The creation slice preserves that transaction and retry contract; it does not introduce a second path.

Public task commands and responses are preserved. These two slices require no database migration.
They complete the next task-ownership increment only when their required checks pass. They do not
complete the assessment and are not merged by this continuation.

## Observed verification

[PR #207](https://github.com/ChidiRnweke/FollowThrough.ai/pull/207) validates
[source-anchor ranges](source-anchor-values.md). Focused regressions passed 37 files and 298 tests;
the full local unit suite passed 442 files and 4,089 tests. All required checks passed, including
[the standard type check, five PostgreSQL contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35914385627).

The [task calendar disposition](task-calendar.md) records a reproduced UTC/device-date mismatch and
date-only label shifts, with matched captures of the actual task card. Overall task review remains open.

[PR #206](https://github.com/ChidiRnweke/FollowThrough.ai/pull/206) enforces
[task completion values](task-completion-values.md). Focused regressions passed 16 files and 120
tests; the full local unit suite passed 441 files and 4,083 tests. All required checks passed,
including [malformed storage and rollback contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35913315844).

The [source-anchor disposition](source-anchor-values.md) records the next boundary correction:
offsets form a complete valid range or are both absent. Overall workflow reconciliation remains open.

[PR #205](https://github.com/ChidiRnweke/FollowThrough.ai/pull/205) validates resolved promise dates
at the provider boundary. Focused regressions passed 14 files and 105 tests; the full local unit
suite passed 440 files and 4,079 tests. All required checks passed, including
[quality, PostgreSQL contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35911654254).

The [task completion disposition](task-completion-values.md) records the next reproduced mismatch
between documented completion state and accepted stored values. Overall task review remains open.

[PR #204](https://github.com/ChidiRnweke/FollowThrough.ai/pull/204) preserves
[extracted commitment owners](promise-owners.md) through review and automatic acceptance.
Focused regressions passed 17 files and 134 tests; the full local unit suite passed 439 files and
4,073 tests. All required checks passed, including
[both new durable-run storage cases, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35910479107).

Current task reconciliation also reproduced invalid resolved dates crossing the provider boundary.
The [date boundary disposition](promise-date-boundary.md) records the local SDK evidence and
narrowed repository result. Overall task review remains open.

[PR #203](https://github.com/ChidiRnweke/FollowThrough.ai/pull/203) makes
[skill loads and usage recording atomic](skill-loads.md) and excludes archived skills from server
discovery. Focused regressions passed 13 files and 168 tests; the full local unit suite passed
439 files and 4,070 tests. All required checks passed, including
[five new PostgreSQL contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35909507971).

Current task review found that extracted waiting-on owners were dropped at proposal creation.
The [owner disposition](promise-owners.md) records the reproduced loss and the bounded correction;
it does not close the full task workflow or model review.

[PR #202](https://github.com/ChidiRnweke/FollowThrough.ai/pull/202) serializes
[catalog name decisions and sync row locks](skill-name-transactions.md). Focused regressions passed
15 files and 96 tests; the full local unit suite passed 438 files and 4,066 tests. All required checks
passed, including [six new PostgreSQL contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35908382055).
The next slice addresses [skill loading and usage ownership](skill-loads.md).

[PR #201](https://github.com/ChidiRnweke/FollowThrough.ai/pull/201) gives prepared edits one
candidate note and records [skill value dispositions](skill-values.md). Focused regressions passed
14 files and 84 tests; the full local unit suite passed 438 files and 4,066 tests. All required checks
passed, including [PostgreSQL contracts, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35907346172).
The next slice reviews [catalog name transactions](skill-name-transactions.md).

[PR #200](https://github.com/ChidiRnweke/FollowThrough.ai/pull/200) resolves
[skill pin scope and transaction ownership](skill-pins.md). Focused regressions passed 22 files
and 152 tests; the full local unit suite passed 438 files and 4,066 tests. All required checks passed,
including [PostgreSQL races, full browser tests and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35906703676).
The next slice resolves the prepared candidate note and records [skill value dispositions](skill-values.md).

[PR #199](https://github.com/ChidiRnweke/FollowThrough.ai/pull/199) resolves
[skill metadata persistence](skill-metadata-persistence.md). Focused regressions passed 17 files
and 106 tests; the full local unit suite passed 436 files and 4,057 tests. All required checks passed,
including [PostgreSQL contracts and full browser tests](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35904019727).
The next slice addresses [skill pin ownership and catalog scope](skill-pins.md).

[PR #198](https://github.com/ChidiRnweke/FollowThrough.ai/pull/198) resolves
[active Inbox lifecycle](inbox-lifecycle.md). Focused regressions passed 21 files and 96 tests;
the full local unit suite passed 436 files and 4,056 tests. Lint, type checks, architecture audits and
documentation checks passed. All required checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35903013438).
The next slice addresses [resolved skill metadata persistence](skill-metadata-persistence.md).

[PR #197](https://github.com/ChidiRnweke/FollowThrough.ai/pull/197) addresses
[skill edits and restoration](skill-edits.md). Focused skill tests passed 15 files and 75 tests;
remote/offline metadata tests passed 2 files and 8 tests. The full local unit suite passed 435 files
and 4,054 tests. Lint, type checks, architecture audits and documentation checks passed. All required
checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35902022859).
The next slice resolves [active Inbox lifecycle](inbox-lifecycle.md).

[PR #196](https://github.com/ChidiRnweke/FollowThrough.ai/pull/196) retires
[whole-note persistence](note-write-retirement.md). Focused regressions passed 38 files and 323 tests;
the full local unit suite passed 435 files and 4,053 tests. Lint, type checks, architecture audits and
documentation checks passed. All required checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35901659391).
The next slice addresses
[skill edits and restoration](skill-edits.md).

[PR #195](https://github.com/ChidiRnweke/FollowThrough.ai/pull/195) contains
[built-in note repair and guarded upgrades](built-in-note-writes.md). Three regression cases fail
against the previous implementation and pass with the fix. The full local unit suite passed
435 files and 4,053 tests; lint, type checks, architecture audits and documentation checks passed.
All required checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35897326447).
The next slice retires
[the general note write](note-write-retirement.md).

[PR #194](https://github.com/ChidiRnweke/FollowThrough.ai/pull/194) contains
[permanent note deletion](note-deletion.md). Local focused tests passed 29 files and 263 tests;
the full unit suite passed 434 files and 4,050 tests. Lint, type checks, architecture audits and
documentation checks passed. All required checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35895034747).
Its implementation remains open. The next slice records
[built-in note repair and upgrades](built-in-note-writes.md).

[PR #193](https://github.com/ChidiRnweke/FollowThrough.ai/pull/193) contains
[project tree transaction coordination](project-tree-transactions.md). Local focused tests passed
43 files and 344 tests; the full unit suite passed 433 files and 4,046 tests. Lint, type checks,
architecture audits and documentation checks passed. All required checks passed, including
[quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35894040521).
Its implementation remains open on the dependent stack.
The next slice records [permanent note deletion](note-deletion.md).

[PR #192](https://github.com/ChidiRnweke/FollowThrough.ai/pull/192) passed all required checks,
including [quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35891955643).
Its editor recovery implementation remains open. The next slice coordinates
[project tree transactions](project-tree-transactions.md).

[PR #191](https://github.com/ChidiRnweke/FollowThrough.ai/pull/191) passed all required checks,
including [quality, unit/browser tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35890893695).
Its export typography implementation remains open. The next slice records
[editor content recovery and retained document value queries](editor-content.md).

For #158, local lint, type checks, architecture audits and documentation checks passed. The unit
suite passed 411 files and 3,895 tests before three added parity cases. The final complete-edit suite
passed all 7 tests. After correcting a nullable access in that test, local type checks and architecture
audits passed again.

[CI on the final edit head](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35827417884)
passed quality, unit (including full browser tests) and PostgreSQL contracts. `commitlint` and
`pr-title` also passed. The PostgreSQL suite passed 52 files and 293 tests. The concurrent-edit scenario
holds a task row while independent title and description edits wait; both changes survive. Deleted
identity reads, deleted locking reads and stale writes remain rejected.

Local contract attempts on both slices could not start because the Docker socket did not answer;
each full local contract command was stopped after 30 seconds without test results. CI provides the
PostgreSQL evidence.

The creation slice's focused controller and service regressions passed 21 files and 143 tests.
They cover offline parity, blank-title rejection, actor and project ownership, completion timestamps,
suggestion acceptance, and batch rollback and retry behavior. The full unit suite passed 412 files and 3,907 tests. The full browser suite passed 73 files and
588 tests. Local lint, type checks, architecture audits and documentation checks also passed. Documentation
reports one existing hint. The corrected suggestion suite passed all 16 tests after replacing an
unsupported completed-task proposal fixture with the supported open-task state. Current CI results
are linked from [PR #159](https://github.com/ChidiRnweke/FollowThrough.ai/pull/159/checks).

## Further continuation on 2026-09-23

The current check summaries for all 81 PR heads (#71–#148, #157–#159) reported success when
queried during this continuation. This is a check-status observation, not a new execution of every
head or a semantic review of every workflow. The PRs remain open.

[PR #160](https://github.com/ChidiRnweke/FollowThrough.ai/pull/160) contains the
[relationship-write disposition](relationship-writes.md) and implementation.
RelationshipGraph now decides created, modified and unchanged results under the caller's transaction;
the repository only locks and persists. Local lint, type checks, architecture audits and docs checks
pass, with one existing documentation hint. All 413 unit files and 3,910 tests pass. The focused
relationship, suggestion and note suites pass 29 files and 200 tests. PostgreSQL contracts are part of
the dependent PR's CI because the local Docker socket remains unavailable.

## Remaining work

[PR #190](https://github.com/ChidiRnweke/FollowThrough.ai/pull/190) passed all required checks,
including [quality, unit/browser, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35890155796).
It remains open on the dependent stack.

The [export-typography disposition](export-typography.md) resolves common heading spacing in the
existing preparation owner. PDF and DOCX consume the same required resolved values.

[PR #189](https://github.com/ChidiRnweke/FollowThrough.ai/pull/189) passed all required checks,
including [quality, unit/browser label parity, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35889311627).
It remains open on the dependent stack.

The [export-geometry disposition](export-geometry.md) retains canonical geometry constructors and
fixes SVG number parsing and overflowing column normalization. Typography ownership remains separate.

[PR #188](https://github.com/ChidiRnweke/FollowThrough.ai/pull/188) passed all required checks,
including [quality, unit/browser, PostgreSQL provenance/content contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35888362067).
It remains open on the dependent stack.

The [diagram-label disposition](diagram-labels.md) separates boundary decoding from shared label
normalization, search text and edit comparison, with browser/server parity coverage.

[PR #187](https://github.com/ChidiRnweke/FollowThrough.ai/pull/187) passed all required checks,
including [quality, unit/browser, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35887084121).
It remains open on the dependent stack.

The [diagram content disposition](diagram-content.md) replaces the remaining general update,
persists generated provenance and aligns fake persistence with PostgreSQL.

[PR #186](https://github.com/ChidiRnweke/FollowThrough.ai/pull/186) passed all required checks,
including [quality, unit/browser, PostgreSQL Mermaid publication races and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35886073293).
It remains open on the dependent stack.

The [retired diagram-write disposition](diagram-legacy-writes.md) removes unused last-save-wins
surfaces and moves their useful guarantees to the active revision/publication API.

[PR #185](https://github.com/ChidiRnweke/FollowThrough.ai/pull/185) passed all required checks,
including [quality, unit/browser, PostgreSQL publication contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35884778949).
It remains open on the dependent stack.

The [Mermaid revision disposition](mermaid-revisions.md) covers peer edits and archives during
generation. Remaining general diagram writes and obsolete controller surfaces still need review.

[PR #184](https://github.com/ChidiRnweke/FollowThrough.ai/pull/184) passed all required checks,
including [quality, unit/browser, PostgreSQL revision/rename contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35883902639).
It remains open on the dependent stack.

The [note-publication disposition](note-publication.md) covers locked ETag validation, snapshot
atomicity and targeted publication writes. Project/folder lifecycle coordination remains separate.

[PR #183](https://github.com/ChidiRnweke/FollowThrough.ai/pull/183) passed all required checks,
including [quality, unit/browser, PostgreSQL concurrent-save contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35882401268).
It remains open on the dependent stack.

The [diagram-revision disposition](diagram-revisions.md) covers controller-owned revision writes,
rename indexing and nullable restoration. Note publication is covered above; legacy whole-diagram
updates remain a separate review item.

[PR #182](https://github.com/ChidiRnweke/FollowThrough.ai/pull/182) passed all required checks on its
corrected head, including [quality, unit/browser, PostgreSQL canvas contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35881623469).
The first contract run found conversation-ID collisions in the new fixtures; fresh UUIDs fixed that
test setup. The PR remains open on the dependent stack.

The [note-save disposition](note-save.md) covers locked draft writes through Notes and Skills, shared
authored-field rules and resolved persistence. Diagram revisions and note publication are covered above.

[PR #181](https://github.com/ChidiRnweke/FollowThrough.ai/pull/181) passed all required checks,
including [quality, unit/browser, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35879911330).
It remains open on the dependent stack.

The [canvas-result disposition](canvas-results.md) removes payload parsing from canvas selection and
preserves ordering, account isolation, corruption handling and the unbounded transcript guarantee.

The [web-research disposition](web-research.md) covers frozen settings, configuration boundaries,
reference transport and bootstrap ownership. Provider session representation still needs review.

[PR #180](https://github.com/ChidiRnweke/FollowThrough.ai/pull/180) passed all required checks,
including [quality, unit/browser, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35877558164).
It remains open on the dependent stack.

The [run-images disposition](run-images.md) records native/fallback selection, shared channel budgets
and explicit runner inputs. Web research configuration is covered above; remaining agent declarations
still need review.

[PR #179](https://github.com/ChidiRnweke/FollowThrough.ai/pull/179) passed all required checks,
including [quality, unit/browser, PostgreSQL output reconstruction and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35875779030).
It remains open on the dependent stack.

[PR #178](https://github.com/ChidiRnweke/FollowThrough.ai/pull/178) passed all required checks,
including [quality, unit/browser, PostgreSQL settlement/stream contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35875005430).
It remains open on the dependent stack.

The [run-output disposition](run-output.md) moves reconstruction out of event persistence. Provider
session encoding and remaining agent declarations still require review; image preparation is covered
above.

[PR #177](https://github.com/ChidiRnweke/FollowThrough.ai/pull/177) passed all required checks,
including [quality, unit/browser, PostgreSQL checkpoint contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35873158609).
It remains open on the dependent stack.

The [terminal-settlement disposition](run-terminal-settlement.md) replaces the remaining generic
transition API and fixes PostgreSQL checkpoint clearing. Event-output reconstruction and the wider
P17 workflow/declaration review were identified separately; output reconstruction is covered above.

The [claim/checkpoint disposition](run-claims-checkpoints.md) records explicit write ownership and
atomic approval publication. The terminal-settlement slice completes that API replacement.

[PR #176](https://github.com/ChidiRnweke/FollowThrough.ai/pull/176) passed all required checks,
including [quality, unit/browser, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35871771564).
It remains open on the dependent stack.

The [pending-call cleanup disposition](run-pending-cleanup.md) records corrected terminal snapshots,
queued-checkpoint cleanup and removal of whole-run replacement.

[PR #175](https://github.com/ChidiRnweke/FollowThrough.ai/pull/175) passed all required checks in
[CI](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35870333337), including PostgreSQL
contracts and full browser tests. The first unit job hit an IndexedDB cleanup failure; the unchanged
browser file passed all 13 tests locally, and the failed job passed on retry. The PR remains open.

The [chat-preparation disposition](agent-preparation.md) records targeted locked writes, atomic
context/start events and cancellation without a local abort signal. The subsequent cleanup slice
covers pending-call abandonment.

[PR #174](https://github.com/ChidiRnweke/FollowThrough.ai/pull/174) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35868931988).
Its direct diagram run implementation remains open on the dependent stack.

The [direct diagram run disposition](direct-diagram-runs.md) records atomic creation, locked
publication/settlement, lifecycle timestamps and removal of unused ledger capabilities. The subsequent
chat-preparation slice covers preparation; generic run transitions remain unresolved.

[PR #173](https://github.com/ChidiRnweke/FollowThrough.ai/pull/173) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL races and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35867425253).
Its diagram context implementation remains open on the dependent stack.

The [diagram-run context disposition](diagram-run-context.md) replaces the ledger's whole-run context
update with controller-owned locking and targeted persistence. The subsequent direct-run slice
covers settlement, and the chat-preparation slice covers chat context writes. General run transitions
remain unresolved.

[PR #172](https://github.com/ChidiRnweke/FollowThrough.ai/pull/172) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL races and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35866176971).
Its approval implementation remains open on the dependent stack.

The [run-approval disposition](run-approvals.md) records controller-owned locking and requeue,
whole-batch validation and atomic decision/event writes. General run transitions remain unresolved.

[PR #171](https://github.com/ChidiRnweke/FollowThrough.ai/pull/171) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL races and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35865285609).
Its cancellation implementation remains open on the dependent stack.

The [run-cancellation disposition](run-cancellation.md) records a reproduced duplicate terminal event,
controller-owned locked cancellation and concurrency/rollback coverage. The subsequent approval slice
covers requeue; general run transitions remain unresolved.

[PR #170](https://github.com/ChidiRnweke/FollowThrough.ai/pull/170) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35863719473).
Its model-choice implementation remains open on the dependent stack.

The model-choice slice shares precedence rules and fixes rejection of explicitly selected deployment
defaults omitted by the provider catalog. It retains role checks, provider metadata and loud lookup
failure. See the [model-choice disposition](agent-model-choice.md).

[PR #169](https://github.com/ChidiRnweke/FollowThrough.ai/pull/169) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL races and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35861816871).
Its preference-write implementation remains open on the dependent stack.

The agent preference slice removes the service-owned read-apply-write workflow. It serializes first
creation and later edits, shares timestamp/nullable edit rules with offline commands and requires model
capability validation. See the [agent-preference disposition](agent-preferences.md).

[PR #168](https://github.com/ChidiRnweke/FollowThrough.ai/pull/168) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35860550944).
Its diagram trash implementation remains open on the dependent stack.

The diagram trash slice continues P17 with controller-owned transactions, actor-scoped row locks,
shared browser/server transitions and targeted persistence. See the
[diagram-trash disposition](diagram-trash.md) for entry paths and test decisions.

[PR #167](https://github.com/ChidiRnweke/FollowThrough.ai/pull/167) passed all required checks,
including [quality, full browser/unit tests, PostgreSQL contracts and sync PWA](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35859106685).
Its implementation remains open on the dependent stack.

[PR #161](https://github.com/ChidiRnweke/FollowThrough.ai/pull/161) contains the
[note-change preparation disposition](note-change-preparation.md) and implementation:
targeted replacement and revision-text comparison now belong to focused server services. The
controller still owns preparation, approval and persistence. Focused regression results are recorded
in that disposition; the public behavior is unchanged.

[PR #162](https://github.com/ChidiRnweke/FollowThrough.ai/pull/162) contains the
[note-reading disposition](note-reading.md) and shared-service slice for reading
estimates, outlines and section numbering. Browser/server rules stay shared, and model types retain
their existing meaning. Its focused regression run passes 38 files and 289 tests.

[PR #163](https://github.com/ChidiRnweke/FollowThrough.ai/pull/163) contains the
[agent tool-recovery disposition](agent-tool-recovery.md) and server-rule slice.
Name ranking belongs to the recovery formatter; the unused matching API and algorithm-only tests
are removed. Formatter tests retain the ranking and discovery guarantees.

All checks passed on [#162](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35855343605)
and [#163](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35855886034), including
PostgreSQL contracts, full browser tests and PWA checks. Their PRs remain open.

[PR #164](https://github.com/ChidiRnweke/FollowThrough.ai/pull/164) contains the
[note-trash disposition](note-trash.md) and controller-owned archive/restore transitions,
shared offline rules and targeted persistence under row locks. Its remaining cross-writer race
review is explicit; this does not close the whole trash family.

[PR #165](https://github.com/ChidiRnweke/FollowThrough.ai/pull/165) contains the
[authored resource-reference disposition](note-resource-references.md) and shared typed
note/diagram discovery and the attachment-removal guard. Tests move to the responsible services,
and the old loose document views are removed. The editor's link-target value type is retained.

All checks passed on [#164](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35856890560),
including the new note-edit/archive and parent-archive/restoration PostgreSQL races.

[PR #166](https://github.com/ChidiRnweke/FollowThrough.ai/pull/166) contains the
[note-comparison disposition](note-comparison.md) and separate shared owners for version
review and live revision highlights, typed document inputs and paired comparison titles.

All checks passed on [#165](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35857611509),
including PostgreSQL contracts, full browser tests and PWA checks.

The [synchronization-state disposition](sync-state.md) records shared queue/cache rule ownership,
separate indicator presentation and removal of unused granular ancestry repair. Existing persistence
and transport boundaries retain the ADR 0040 protocol.

- The other assessment families, unchecked workflow IDs and unresolved decisions still need their own
  source review and behavior evidence. No global checklist is marked complete here.
- The inherited 79 PRs remain open. This continuation neither merges nor restacks them.
- A03's old implementation description is superseded on these branches, but its delivery remains open
  until the task slices merge. A04's batch implementation is present through open PR #83.
- Other rule placement and workflow findings remain subject to current-source review. Do not infer
  their resolution from the task slices or use the original inventory counts as current measurements.
