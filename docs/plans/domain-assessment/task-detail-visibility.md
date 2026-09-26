# Task detail visibility after project archival

The sync inventory retains actor-owned archived records. List views already excluded tasks whose
projects were archived, but task details and embedded task nodes assembled a view from any retained
nondeleted task. Archiving a project offline therefore removed a task from lists while leaving its
open detail form editable.

WorkspaceViews.todo now checks the task deletion state and its current project record before
assembling a view. Lists use the same projection. Detail panels observe the project resource so a
missing project is downloaded through the existing resource view; loading and failure states remain
visible. An archived project or deleted task produces the unavailable message. Embedded task nodes
use the same projection and their existing unavailable state. Raw sync records remain available to
storage, history and queued-write recovery.

## Reproduction

The real TodoDetailPanel and application CSS ran in the existing component fixture server. The
fixture seeded one active project and one task into the existing in-memory workspace repositories,
opened the task, went offline and archived the project through WorkspaceDraft.stage. Playwright used
a 1000 by 1000 viewport, light mode and reduced motion. The captured surface is 672 pixels wide.

Before, the archived project still showed editable title, description and properties, plus task
actions and the live-region message Todo saved. After, the same state shows This todo is no longer
available. The screenshots are committed under docs/pr-evidence/task-detail-visibility. Temporary
fixture routes and session injection were removed before publication. Local PostgreSQL is unavailable;
this is a seeded actual-component reproduction, not authenticated whole-app navigation.

## Verification boundary

Three new regressions failed before the change: offline project archival, missing project context
and a deleted task retained in the inventory. The active-project control passed. The four tests use
real workspace resources and the existing repository/transport fakes. Focused regressions passed
three files and 31 tests, including task list and controller behavior. No database change is required.
This resolves the observed visibility defect; it does not certify the entire detail or embedded-task
workflow, and the repository-wide assessment remains open.

The full local unit suite passed 444 files and 4,099 tests. Lint, type checks, architecture audits
and documentation checks passed. PostgreSQL and production PWA checks run in required CI.
