# Task board export dispositions

Current assessment of W09.17 and W09.18 on the open continuation stack. Export rendering is separate
from task persistence. This review includes a confirmed missing-project fallback defect.

## W09.17 — Markdown

TodoExport.exportMarkdown receives the visible task views from TodosWorkspace, including its local
title search. It supplies generation time and optional project labels to the shared boardMarkdown
rule, then downloads the resulting UTF-8 Markdown through a temporary object URL. The browser owns
the download and clock; the renderer owns column order, task-list syntax and compact metadata.

The export uses backlog, open, in_progress and done in board order and omits empty columns and
cancelled tasks. Done cards are checked. Titles collapse to one list line; priority, date, category,
project and counterparty facts remain independent. A generation date is not a task completion time.
The filename slug has a deliberate generic label for empty display text, not a substitute for a
failed project lookup.

Retain services/todos/board-export.spec.ts for column ordering, cancelled exclusion, checked states,
metadata, overdue comparison and filename formatting. Retain the shared renderer instead of copying
it into the component or PDF controller. No new Markdown export behavior is introduced here.

## W09.18 — PDF

TodoExport.exportPdf submits project, responsibility and category filters through the validated
exportBoardPdf remote command. Local title search is deliberately absent from this server request.
Todos.exportBoardPdf reads actor-scoped tasks and active projects, resolves display views, uses the
shared boardMarkdown rule, converts the result to the editor document and invokes the common export
preparer and PDF generator. It returns base64 bytes and a filename; the browser owns the download and
reports generation failure. Shared PDF layout remains with the existing export system.

A supplied project filter must identify an available project. Previously a missing, archived or
foreign project produced an empty successful PDF named as an all-projects export. The controller now
rejects that unresolved project before view and document preparation. No project filter still means
all active projects, and an empty active project remains a valid empty export under its own name.
No new query cap, persistence interface or database migration is needed.

The device clock generates Markdown export metadata; the server clock generates PDF metadata.
Neither request currently transmits a user time zone. This review retains that existing distinction
and does not claim that the earlier browser calendar fix changed server export dates.

## Evidence and test disposition

Three new controller regressions failed before the fix: selected missing, archived and foreign
projects all resolved successfully. They now reject with NOT_FOUND. A new empty-active-project control
continues to return its project filename. The existing filtered-export fixture now contains the
active project it claims to export; it no longer models tasks whose owning project is absent.

Retain board-export.spec.ts in the controller for filtered content, title settings, project labels,
base64 bytes and filenames. Its typed recording closures verify prepared document inputs; they do
not claim real PDF layout or storage behavior. Focused regressions passed three files and 46 tests.
The shared renderer tests cover content semantics; the export system's own tests retain layout and
format-specific guarantees. No visual component change or live model call is involved.

Task extraction, source changes and screenshot completion remain separate review entries. Completion
of these two assessments does not mean that their implementation PRs have merged or that the repository
assessment is complete.

The full local unit suite passed 444 files and 4,103 tests. Lint, type checks, architecture audits
and documentation checks passed. Required CI supplies the PostgreSQL and production PWA checks;
local PostgreSQL was unavailable.
