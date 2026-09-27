# Browsing and reading note history

## W04.08 and W04.09

NoteWorkspace opens history from its menu or the unpublished-change comparison link. The request
boundary validates UUIDs and resolves the actor. Notes.listRevisions reads the owned active note and
its snapshots, returns summaries without document bodies, and marks the current publication.
NoteCatalog turns the repository's ascending revision order into newest-first history. The UI
prefers the published snapshot, then the newest retained snapshot when no publication is marked.
A successful empty result is distinct from a failed read.

Notes.getRevision resolves a snapshot within the requested note.
NoteCatalog first requires the note through the active project and actor-scoped repository read,
then looks for that snapshot in its history. A foreign actor, wrong note, removed snapshot or archived
project does not expose a body. The returned document belongs to the selected immutable snapshot;
the current note remains the comparison candidate. The older readRevision controller method returns text and publication metadata but is excluded from
agent tools. Agents use list_note_versions for summaries and read mounted version Markdown through
AgentVirtualFiles.sed. That path requires the owned note to match the project in the URL, then selects
the exact numeric revision and serializes its stored document. It does not choose the current body.
The virtual directory list uses active projects and notes. General file path and range semantics stay
with the agent-files assessment.

The client previously allowed an earlier selected-version response to replace a later choice. An
earlier rejection could also replace the later successful comparison with a failure state. NoteHistory
now owns the pane's revision requests and rejects results from superseded requests. Reopening clears
old selection; closing the dialog or destroying the pane invalidates its pending request. Only the
latest selection can become the displayed snapshot. This also keeps the selected row and the revision
sent to Restore consistent.

## Restoration feedback

The existing restore caller could stop because the draft was not synchronized, or catch a failed
request, then resolve normally. The dialog treated either outcome as success and closed. Return an
explicit completion boolean and close only after restoration succeeds. Keep the current comparison
available after a blocked or failed attempt. A server restore with later local typing still counts as
completed while preserving those later edits for review. Remove the second synchronization after the
successful reopen; the first synchronization already precedes reading the restored draft.

This does not change server restoration or snapshot policy. The warning from the preceding feedback
fix still states that unpublished changes are replaced. W04.11 and D03 remain separate; do not infer a
new draft snapshot or stale-write policy from this UI result.

## Evidence and test disposition

Two delayed-response regressions fail with the previous request ordering copied into the history
store, then pass when obsolete responses are ignored. Retain cases for older success/failure, a
reopened list, closing during a read, publication preference, newest fallback, empty history, failed
history and clearing stale selection. Browser tests cover both blocked and successful restoration.
Actual styled component captures reproduce a blocked callback closing the dialog before the fix and
retaining it afterward. This uses seeded props, not a successful server restore.

PostgreSQL contracts exercise real Notes, NoteCatalog and repositories: newest-first publication
summaries, full old snapshot content, a different established account, a different note under the same
account, an archived project, and the actual agent version-file read. Existing snapshot retention, missing revision, copy-forward restore,
attachment restoration and indexing tests remain useful. SQL validation runs in CI, not locally.
W04.08 and W04.09 are assessed. W04.10 comparison semantics and W04.11 restoration policy stay open.
