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

The [diagram-run context disposition](diagram-run-context.md) replaces the ledger's whole-run context
update with controller-owned locking and targeted persistence. General run transitions, chat
preparation and direct diagram run settlement remain unresolved.

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
