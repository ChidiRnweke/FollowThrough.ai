# Task extraction and source dispositions

Current assessment of W09.14 and W09.15 on the open continuation stack. A task's extraction origin
and a later selected display note are separate facts. The task model review preserves that distinction.

## W09.14 — Extract commitments from a selection

NoteWorkspace.runAction requires a captured selection and synchronizes the note before submitting
its revision. NoteActions.extractPromises uses SelectionSubmissions to retain an account-scoped
request identity until acknowledgement. The validated remote calls Todos.startExtractPromises, which
persists the selection and generation settings with the queued run. Recovery does not depend on the
original browser callback or current model configuration.

Todos.executePromiseRun claims the durable request, validates the selection before extraction and
resolves it again before saving results. SelectionOrigins owns actor/note/revision/text agreement and
source-anchor creation. The provider repository parses structured output, including real ISO calendar
dates; PromiseDiscovery maps the narrow response into candidate values and rejects missing parsed
output. DeterministicPromiseExtractor remains a separate configured implementation. Both use the
stored request time for relative-date interpretation. That server policy is distinct from the device
calendar used for today's task display.

The controller records pipeline provenance, filters a requested responsibility, creates suggestions
and evaluates trust. Automatic acceptance uses the shared task creation rule and records its created
effect; reviewed acceptance uses the same rule through Suggestions. Another person's extracted name
becomes waitingOn, while personal work does not retain it. Confidence and promise strength describe
the extraction, not task priority or completion.

Run settlement claims terminal authority before proposals/tasks and the result event commit together.
Cancellation winning in flight leaves no proposals; an event failure rolls back accepted tasks and
origin records. The note action stream synchronizes workspace resources before delivering workflow
results. Replayed results go through registered handlers, which report proposed suggestions and auto-created tasks, and
the note renders the persisted suggestions. Extraction does not insert an embedded task node as a
second creation path.

Retain durable-promises.spec.ts for persisted settings/time, queued recovery, changed selections,
cancellation, event rollback and duplicate execution. Retain extract-promises.spec.ts for order,
responsibility filtering, owner preservation, trust and provenance. Keep selection-origin.spec.ts
for the authoritative source boundary and suggestions/lifecycle.spec.ts for reviewed creation.
Retain promise-runs.contract.spec.ts for separate-connection duplicates, cancellation and result-event
rollback, and classification.spec.ts for the actual SDK against local HTTP fixtures with malformed
dates. Promise rules and discovery tests cover deterministic interpretation and response mapping.
No live model call or new extraction abstraction is required for this ownership review.

## W09.15 — Preserve origin through source changes

TodoSourceField offers active ordinary notes in the task project and a clear/original-source option.
It submits linkedNoteId intent through TodoUpdates. Todos.update validates explicit new assignments,
locks and edits the task, and returns the shared assembleTodoView result. Existing archived links do
not block unrelated edits, as fixed in task-link-lifecycle.md.

The shared view uses the selected linked note as its display source when available and retains the
extraction anchor, original note and provenance separately. Clearing the selected note reveals the
original source again. Browser and server readers supply the same facts; partial browser arrival can
leave an anchor available before its note, so the view does not invent missing titles. Task detail
shows the original quote separately from the selected note link. Source-anchor ranges remain paired
and validated at boundaries, as recorded in source-anchor-values.md.

The selector renders sourceTitle and hasOrigin; it never reads its old value prop. Remove that unused
input from the field and its table/detail callers. Require the origin flag that every caller already
resolves. Keep linkedNoteId on the actual task and command:
it is the persisted selection, not redundant model state. No visible rendering or mutation behavior
changes, and no new source identity type is needed.

Retain presentation.spec.ts for selected-source precedence and origin fallback, view.spec.ts for
clearing a link in the returned controller view, workspace lists.spec.ts for the browser projection,
and edit-rules.spec.ts for active assignment and archived-link behavior. Retain archived-links and
source-anchor PostgreSQL contracts for persisted lifecycle and range rules. These tests assert domain
facts and outcomes; no test is added solely to mirror removal of the unused component input.

## Remaining coverage

Screenshot completion is W09.16 and has [its own disposition](task-screenshots.md) and attachment lifecycle boundaries. This review
does not substitute task-origin tests for file completion or claim that all repository workflows have
been reconciled. The implementation PRs remain unmerged.

Focused regressions passed 11 files and 83 tests. The full local unit suite passed 444 files and
4,103 tests. Lint, final type checks, architecture audits and documentation checks passed. Required
CI supplies PostgreSQL and PWA validation; local PostgreSQL was unavailable.
