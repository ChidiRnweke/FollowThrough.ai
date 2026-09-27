# Archived projects in cached collections

ADR 0009 makes the project archive the visibility boundary for its children. The browser note/task
lists already apply this rule. Diagram galleries, diagram trash, artifact galleries, attachment lists
and scoped memory reads did not. A retained project selection or the global Trash page could expose
rows from an archived project even though the project was absent from normal navigation.

Apply the active-project check in WorkspaceViews before returning those collections. Scoped memory
suggestions use the same boundary. Profile memory and its suggestions remain independent of any
project. Attachment rows carry their project identity even when the owner is a note; filter on that
identity before joining the current version. Diagram trash now follows the same active-project rule
as note trash. Gallery search/order and artifact staleness remain separate presentation rules.

This changes projections only. It does not archive, delete or rewrite child records, clear local
outbox entries, or change the project's stored lifecycle. Missing projects do not establish active
visibility, consistent with the existing note/task collections. Existing positive fixtures that had
children but omitted their active project now supply that project; their expected behavior is intact.

Callers include gallery routes with a retained selectedProjectId, project capability counts and tabs,
the project diagram picker, attachment lists, memory lists, and the global Trash page. Project and
memory panels already have their own guards, but those guards did not establish a consistent shared
read boundary. Keep the filtering in the projection instead of relying on every caller to repeat it.

## Evidence and test disposition

Five cached collection regressions failed before the repair. Positive cases for those same collections
passed before it. Both sides pass after it, with additional active/archived memory-suggestion cases.
Retain the profile-memory separation, attachment/version join, diagram search, note trash and artifact
staleness tests. Retain existing SQL active-project visibility contracts; this patch changes no server
repository query and adds no duplicate SQL assertion.

A seeded browser check rendered the actual Trash route, PageShell and TrashList with real
WorkspaceViews. Before, both an active project's diagram and an archived project's diagram appeared
with restore/delete actions. After, only the active project's row and restore action remained. Matched
captures use the same viewport and data. The temporary surface fixture was restored. No live database
or destructive trash action was used.

This advances W03.03 but does not complete it. Direct diagram-editor recovery, cross-project backlink
presentation and the other child read/write paths still need their own complete caller review.
