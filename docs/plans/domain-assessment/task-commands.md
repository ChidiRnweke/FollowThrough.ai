# Task command workflow dispositions

Current assessment of W09.01–W09.06 and W09.08 on the open continuation stack. Assessment does not
mean merged delivery. The task model declaration review is in [task-values.md](task-values.md).

## W09.01 — Create individual tasks

Entry paths are TodoUpdates.create through the workspace outbox, the create_todo agent tool through
Todos.create, and suggestion acceptance through the same shared creation rule. The caller supplies
intent and project context. Todos.create resolves actor, identity and time; decideTodoCreation trims
the title, defaults status to open, resolves completion time and removes a counterparty from personal
work. Waiting-on work can lack a named counterparty. Description, deadline and origin are independent.

TodoCatalog.create validates the resolved actor and active project, plus supplied anchor/project and
provenance ownership. TodoRecords.insert receives resolved values. The browser keeps the generated
identity through synchronization; its local save is durable intent, not server approval. A stale
project choice can be refused by the server and remains a sync outcome rather than a false server
success. The controller returns the saved task; the tool projects its write result and workspace
synchronization returns the authoritative resource receipt.

Retain create.spec.ts, including stores the same initial task as the offline preview, preserves the
final identity assigned before synchronization, blank-title refusal, unavailable project refusal and
cross-project anchor refusal. Keep catalog.spec.ts for resolved actor ownership and the actual tool
boundary tests in agent-tool-factory.spec.ts. Suggestion review/acceptance has its own workflow review;
this entry only establishes its reuse of the task-creation decision. No new creation abstraction is
needed.

## W09.02 — Create task batches

The create_todos tool parses createTodoBatchSchema and calls Todos.createBatch. A request ID belongs
to an actor and immutable batch input, not to an individual task. TodoBatchReceipts locks that key and
classifies missing, saved or changed input; changed input throws before another task is inserted.
The controller creates all tasks in order and stores the result in one transaction. Database-only
retry does not rerun model calls. A saved result remains the original batch outcome after later edits.

Retain create-batch.spec.ts for later-insert rollback, receipt rollback, lost-response replay and
changed-input refusal. Retain batches.contract.spec.ts for concurrent duplicate deliveries, account
isolation, unreadable saved outcomes, JSON key-order independence and edited-task replay. Keep the
tool approval-card tests that show every batch title: array contents are part of the approval, not
an implementation detail. Retain the current receipt service and controller transaction; no second
batch creation rule is needed.

## W09.03 — Quick entry

KanbanBoard.addTodo and TodosWorkspace.addListTodo use TodoUpdates.create. The board chooses its
column status; the list chooses open. The quickTodo URL opens the board input. A supplied project is
kept; global creation finds the active inbox by role and fails explicitly if it is unavailable.
Forms retain their title after failure and clear it only after a local durable save. The command
palette does not introduce another task creation path.

Retain the board browser tests for focus and Escape and the production PWA case retains an offline
task through reload and submits it on reconnect. The latter exercises the actual quick-entry input,
reload, outbox and server receipt. tests/e2e/todos.e2e.ts also covers the quickTodo URL focus; that
separate non-CI suite was not rerun locally because PostgreSQL is unavailable. Retain these distinct
interaction and persistence checks; a new wrapper around TodoUpdates would add no ownership.

## W09.04 — Text and description edits

TodoTextField and TodoDescriptionField own interaction buffers, Enter/Escape behavior and Markdown
presentation. They capture a WorkspaceDraft and use EditorSession to preserve later typing and
failure state. Text fields commit on blur/Enter; description Enter remains a newline and Ctrl/Meta
Enter commits. Blank description becomes null. A blank title remains invalid. Sanitized Markdown
rendering, image zoom and screenshot upload are separate concerns; attachment completion is W09.16.

TodoUpdates.save stages the partial command. The sync boundary validates it, then Todos.update locks
the current task, applies applyTodoEdit, persists it and returns its assembled view in one transaction.
Independent concurrent edits therefore use current fields rather than a stale whole-task snapshot.
Null clears a supported field; omission leaves it unchanged. Tool edits use the same controller.

Retain controller.spec.ts for trimming, blank refusal, nullable clearing and partial-edit preservation;
complete-edit.spec.ts for rollback and a resolved atomic result; concurrent-edits.contract.spec.ts
for two independent edits waiting on one row. Retain EditorSession tests for later typing, failed
persistence and ended account lifetimes. These are buffer/state tests, not a claim that every keyboard
interaction was replayed in a full authenticated app. Retain the buffer/command separation.

## W09.05 — Status and completion

Status fields, board movement, card/embedded controls and update_todo all submit status intent through
the shared edit path. Valid statuses are backlog, open, in_progress, done and cancelled. Todo is a
resolved union: done requires completedAt; every other status has no completion time. Entering done
uses the resolved edit timestamp; editing an already completed task preserves that time; reopening
clears it. Displaying a cancelled task differs from including it in the four-column board.

Retain edits.spec.ts and edit-rules.spec.ts for transitions, complete-edit.spec.ts for preserved
completion time and storage failure, and completion-values.contract.spec.ts for invalid persisted
states and rollback. The DB mapper and sync record reader validate completion consistency. Existing
malformed historical rows are not silently repaired; the earlier completion-value slice documented
that boundary. Retain the shared decision and resolved union.

## W09.06 — Responsibility, priority, category and deadline

The corresponding fields submit narrow selections or explicit null. Category/counterparty text is
trimmed; blank category clears it. Returning responsibility to mine removes waitingOn. Waiting-on
work need not name a counterparty. Priority and category are independent optional classifications.
The date picker supplies a calendar date, and clear submits null. Device calendar labels and overdue
comparison use the corrected local-date behavior in [task-calendar.md](task-calendar.md); timestamps
and original extracted deadline wording have different meanings.

Retain controller.spec.ts, edit-rules.spec.ts and edits.spec.ts for clearing and responsibility rules,
plus the local-calendar tests for opposite sides of midnight. Category discovery is W09.07 and its
own reviewed read path. Fields decide how to collect intent; the shared task rule decides its final
meaning. No new field-specific persistence service is needed.

## W09.08 — Delete tasks

ConfirmDelete calls TodoUpdates.remove. The outbox publishes a local removal; a successful local
stage closes a matching right panel. The synchronized command uses Todos.remove, which verifies
actor-scoped active existence and delegates the soft deletion. TodoCatalog resolves the deletion
time. TodoRecords stores only that deletion column, and task reads exclude deleted records.
A stale edit cannot resurrect the task because both the locked read and the update predicate exclude
deleted tasks. Sync receipt replay is distinct from directly deleting an already missing task.

The repository deletion input now requires DateTime. All production callers already resolve it.
Previously its optional type allowed PostgreSQL to invent a clock value while the fake stored an
absent deletion time. Remove that unsupported input state and fallback; keep the existing targeted
write. There is no API or database migration.

Retain controller.spec.ts for removed-list visibility, missing identity and foreign ownership;
catalog.spec.ts for deletion visibility; deleted-tasks.contract.spec.ts for identity, locked read and
stale-write refusal; and task-visibility.svelte.node.spec.ts for retained deleted records in views.
No test is added solely to mirror the narrowed parameter type.

## Remaining task review

Board layout/movement, detail return navigation, embedded-node interaction, extraction, source changes,
attachments and exports retain their separate workflow entries. Implementation evidence and passing
checks do not substitute for those dispositions. This review does not close the task family or the
repository-wide assessment.

Focused validation passed eight files and 65 tests. The full local unit suite passed 444 files and
4,099 tests. Lint, type checks, architecture audits and documentation checks passed. PostgreSQL
contracts and production PWA behavior are verified by required CI; no local PostgreSQL run is claimed.
