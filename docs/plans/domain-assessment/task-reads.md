# Task category and list reads

Assessment completed for W09.07 and W09.09 on this continuation branch. This covers current callers,
rules, read boundaries and returned values; it does not mean the dependent PRs are merged.

## W09.07 — Discover and reuse categories

The category field offers existing labels and submits edits through TodoUpdates and workspace
commands. The shared task edit rule trims an assigned category and treats blank/null as clearing it.
WorkspaceViews.categories derives distinct sorted labels from visible tasks. Server listCategories
uses actor-owned, nondeleted tasks in active projects and excludes null categories. Categories remain
user text; no new case folding or taxonomy is introduced.

Retain controller category discovery/edit tests, workspace list tests and the PostgreSQL repository
contracts for sorted distinct categories, foreign ownership and clearing. Those test category values
and persisted outcomes rather than service call counts.

## W09.09 — List, filter, sort and count

Workspace and project routes parse URL status, responsibility, project and category through
readTodoListFilter. The workspace projection filters account-scoped records by active project and
task deletion state. Agent list_todos parses its supported fields at the tool boundary and calls the
Todos controller. PDF export also uses the server list path.

TodoRecords.list and count share predicates for actor, active project, deletion, status,
responsibility, category, due-before and extraction-note filters. A note with no anchors produces an
empty result, not an unrestricted query. The note filter follows extraction anchors; selecting a
different display source does not rewrite origin. There is no result cap in these reads.

The shared assembleTodoView rule returns selected source, origin, anchor and provenance facts.
Browser and server callers use that rule. Default list order is due date followed by update time;
undated tasks follow dated tasks. The table owns optional presentation ordering, with absent values
last in either direction. The title search is a local case-insensitive substring filter. These
presentation choices do not belong in storage or task value constructors.

Retain URL refusal/empty-filter cases, table ordering and title-filter tests, controller list/count
tests, workspace lists and Today parity, and PostgreSQL actor/project/deletion/filter contracts.
The unused due/source service contracts are retired as recorded in [the model review](task-values.md).

## Remaining task coverage

Creation and edits are reconciled in [the command review](task-commands.md), task surfaces in
[the surface review](task-surfaces.md), extraction/source changes in [the origin review](task-origins.md)
and exports in [the export review](task-exports.md). The archived-project detail defect is fixed in
the open stack. Screenshot completion (W09.16) still needs its own disposition. These workflow
decisions do not follow merely from this read review or the namespace declaration review.
