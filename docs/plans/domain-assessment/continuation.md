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
- The task-creation slice in this branch depends on #158. Direct creation, atomic batches,
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
588 tests. Final quality checks and current CI results will be recorded before delivery.

## Unresolved

- The other assessment families, unchecked workflow IDs and unresolved decisions still need their own
  source review and behavior evidence. No global checklist is marked complete here.
- The inherited 79 PRs remain open. This continuation neither merges nor restacks them.
- A03's old implementation description is superseded on these branches, but its delivery remains open
  until the task slices merge. A04's batch implementation is present through open PR #83.
- Other rule placement and workflow findings remain subject to current-source review. Do not infer
  their resolution from the task slices or use the original inventory counts as current measurements.
