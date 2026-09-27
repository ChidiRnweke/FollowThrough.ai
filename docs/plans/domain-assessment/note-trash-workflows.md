# Archive, restore and browse note trash

Assessment: W04.12, W04.13 and W04.14. Permanent deletion and emptying trash remain separate reviews.

## Entry points and state

The note workspace saves dirty content before archive. An unresolved save or conflict blocks the
archive. The project tree and project overview also call ProjectActions.archiveNote. These calls
stage an explicit durable workspace command, preserve the body and publication state, and report
admission failures to the caller. Agent archive_note and restore_note tools use the same server
controller as synchronized browser commands.

Folder archive requires a complete local inventory to establish that no active children remain.
Restore opens the note and its parent first. An unavailable parent is not treated as absent. A
confirmed missing or archived parent moves the note to the root, and this placement requires a
complete root inventory. An active parent becomes a command dependency. Repeated archive or restore
transitions fail explicitly. Browser commands and server controllers share noteTrashChange.

The server locks the owned active project and the note before resolving archive facts. Restore also
locks an existing parent. Targeted writes preserve concurrent content edits. Search indexing removes
archived note chunks and rebuilds restored note chunks. An indexing failure rolls back the note
transition. See [trash ownership](note-trash.md) and [project tree transactions](project-tree-transactions.md)
for the controller, repository and concurrency evidence.

## Browsing and the incomplete inventory defect

Global trash combines notes and diagrams, sorted by archive time. WorkspaceViews excludes archived
projects and skill notes. Project overview uses the same note and diagram views. TrashList retains
separate note and diagram identities and dispatches row actions by kind. Known rows remain useful
while the device finishes downloading its inventory.

The route prepares the local cache but does not require a completed collection download. A device
with cached shell data can therefore open Trash before all records arrive. Previously, zero cached
trash rows produced “The trash is empty”, and a partial list offered “Empty trash”. Neither claim was
supported by the available inventory.

The route now reads collectionReadiness reactively. It shows an availability message until the
inventory is complete, keeps downloaded rows visible, and offers the bulk action only when the
inventory is complete. Once the real cache finishes a download, the normal empty state is shown.
The project trash section receives the same readiness state from its route and withholds its bulk
action until all records arrive. No additional network request or complete-inventory requirement was
added to individual row actions.

## Evidence and test dispositions

Retain the existing controller archive/restore, workspace command trash and inventory admission
suites. They exercise repeated transitions, active folder children, parent dependencies, root
placement, body preservation, actor isolation, local/server parity and index rollback. Retain the
PostgreSQL trash, root-move, tree-transaction and repository contracts: they cover authoritative
concurrent edits, parent archive while restore waits, child creation or movement while a folder
archives, project lifecycle locking and owned active-project filtering.

Add four mounted global route tests using the real resource cache. Two reproduce the previous false empty
state and premature bulk action. The other two preserve known rows and verify the transition to a
confirmed empty inventory. Two additional mounted project overview tests verify that its bulk action requires a complete
inventory. Existing TrashList tests retain row labels, action dispatch and delete
confirmation coverage. No fake represents an unavailable parent as a confirmed missing record.

Matched 1280 × 900 global route captures and 1280 × 1300 project captures in docs/pr-evidence/trash-inventory show the actual Trash route and project overview with an
incomplete inventory before and after the repair. This is seeded component evidence, not an
authenticated database-backed browser run. No live model calls were made. PostgreSQL contracts run
in CI because Docker is unavailable locally. Observed gate results are recorded in the PR.

## Remaining boundaries

W04.15 and W04.16 remain open. A successful permanent deletion followed by a failed client refresh
needs a separate presentation review. Emptying mixed note and diagram trash remains a sequence of
operations, not one atomic transaction. This assessment does not change those contracts.
