# Task surface workflow dispositions

Current assessment of W09.10–W09.13 on the open continuation stack. The task commands, reads and
model declarations have separate dispositions. This review retains presentation and interaction
responsibilities instead of moving them into task persistence.

## W09.10 — Board and table

Workspace and project task routes supply current WorkspaceViews.todos results to TodosWorkspace.
The URL selects board or table and shareable filters; title search is a local lens. Both surfaces
receive the same visible tasks. TodoTable owns its display ordering and responsive stacked/table
markup. Its status, priority, category, date, responsibility and source fields use the common command
path. Project names are display context, not a second task identity.

KanbanBoard groups all five valid statuses but renders the configured columns, normally backlog,
open, in_progress and done. Cancelled is still a valid task visible in the table. A collapsed column
shows five cards with an expand affordance; it retains the complete list and hidden tail. This is a
presentation limit, not a capped storage read. Empty-state copy and project labels remain UI concerns.

Retain todo-sort.spec.ts and todo-filter.spec.ts for ordering and title matching, lists.spec.ts for
active project/deletion scope, and todo-card.svelte.spec.ts for displayed card facts. Existing
responsive and todos e2e cases cover table overflow and compact surfaces; those non-CI suites were
not rerun locally. Retain the shared view input and the separate table/board renderers.

## W09.11 — Move between statuses

KanbanBoard.handleConsider owns transient drag placement. handleFinalize commits only the target
zone's drop and only when status changed. withHiddenTail preserves cards omitted from a collapsed
drag zone, and visibleItems keeps its transient shadow/settled item visible. TodoWorkspace.move sends
status intent through TodoUpdates.setStatus and reports a failed local save.

The temporary board override lasts through the animation and then yields to current workspace data;
a timeout returns to current data if no update arrives. It is not a second saved task status or a
persistent within-column order. Completion timestamps and responsibility rules still belong to the
shared task edit rule. Retain this UI timing logic rather than extracting a new
domain mutation service.

Retain the browser cases commits a tail drop when the collapsed target items omit the dragged todo,
commits a cross-column drop only from the target finalize event, does not commit a drop into the todo
current status, and keeps the tail placeholder rendered in a collapsed target. The shared completion
and persistence tests reviewed in task-commands.md cover the resulting command.

## W09.12 — Details and return navigation

TodoWorkspace.open and embedded task links call openTodoSurface with the originating path/query.
When the docked panel fits, RightPanel.openTodo stores the task identity. Otherwise navigation opens
/todos/:id with returnTo. The route parses the identity, opens the workspace record and validates
returnTo through safeReturnUrl. The return URL accepts an application-relative path/query/hash and
rejects absolute or protocol-relative external destinations. The page uses it for Back and after
deleting the task.

TodoDetailPanel observes task and project resources, reports loading/failure/unavailability and uses
the same task projection as lists. The archived-project defect and actual component captures are
recorded in task-detail-visibility.md. Selecting no task has different copy from an unavailable task.
The raw inventory remains available for sync recovery; it is not active detail authority.

Move the three return-navigation tests from the generic utils.spec.ts to the return-url boundary
without changing their behavior. Retain the task visibility tests for active, archived, missing
project and deleted-record cases. The recent real-component capture verifies archived-project detail
controls; it does not claim full authenticated navigation was replayed. Retain responsive routing and
return-path validation in their existing client owners.

## W09.13 — Embedded tasks

TodoNodeBase persists an atomic todoNode with its task identity, with HTML and Markdown readers/writers
for stored or imported references. It does not duplicate task fields inside note content. The live
NoteEditor and read-only NoteDiffEditor attach the same TodoNode view. No active toolbar caller of
insertTodoNode was found. Remove that unused insertion command and its type augmentation; retain
the node schema, readers, writers and views required by stored content.

With per-note context, TodoNode reads the account workspace and uses the shared active task projection.
Its checkbox submits done/open and its title opens the task surface. Unavailable or archived-project
tasks show the unavailable label. Without per-note context, such as an isolated review preview, the
node shows Linked todo instead of claiming that the task was deleted. Review editors are created
read-only; the node's controls use that fixed editor lifetime to remain disabled when a view exists.

Retain note Markdown round-trip tests for task references, task visibility tests, shared completion
rules and NoteVersionDiff's read-only editor test. Add an actual-component browser case showing both
preview panes render passive Linked todo labels with no completion controls when workspace context
is absent. This verifies the context-free preview branch; it does not pretend to exercise a live
workspace checkbox in an authenticated app. No production rendering behavior changes in this slice.

Focused regressions passed five files and 59 tests, including actual browser rendering and the
server Markdown round trip. Full gates and required CI are recorded in the continuation register.
These dispositions leave extraction, provenance, screenshots and exports for their own review.

The full local unit suite passed 444 files and 4,099 tests. The new preview case also passed in the
focused browser run above. Lint, type checks, architecture audits and documentation checks passed.
