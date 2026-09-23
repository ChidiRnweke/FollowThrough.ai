# Note trash ownership

## Workflow and owners

Notes.archive and Notes.restore now own the complete transition: load locked facts, apply the shared
trash rule, persist the resolved note, update its search representation and return it inside the
controller transaction. NoteCatalog only reads facts and persists the supplied result. The old
NoteArchiver port and the catalog's archive/restore workflow methods are removed.

Browser commands use the same noteTrashChange rule. It refuses repeated archive/restore transitions,
refuses to archive a folder with active children, and detaches a restored note from a missing or
archived parent. Detached notes use the existing root sibling count. Explicit archive and update
timestamps now share one value. Restoration clears archivedAt, and root restoration clears parentId.
The inventory admission path retains decideNoteRestore so it can request a complete root inventory
before calculating an optimistic position.

Repository locking reads preserve actor and active-project filtering. Restoration also locks an
existing parent while checking its state. The targeted trash write changes only archive, placement
and update fields; it does not rewrite body content, publication state or numbering preferences.
The controller returns the persisted value. No migration or public command shape changes.

## Test dispositions

Remove seven catalog lifecycle tests from the old owner. Existing controller tests already cover
four of them; move the remaining repeated-archive, all-children-archived and wrong-actor cases to
the archive controller suite. Retain restore placement, missing ownership and indexing tests.
Replace pass-through transaction fixtures with the shared rollback-capable fake, and verify both
archive and restore roll back after indexing failure. Compare actual controller results with offline
commands, including restoration out of an archived parent.

The existing PostgreSQL root-placement and synchronized-retry contracts now invoke Notes rather than
the removed catalog workflows. A new race contract holds an edit transaction while archive waits;
the returned and stored note must include that edit. Another contract holds a parent archive while
restoration waits and verifies placement at the root. Locking-read contracts cover actor isolation
and archived projects. Local focused results and CI results are recorded in the PR.

This records archive/restore ownership, not completion of every trash workflow. Concurrent creation
or movement into a folder and project lifecycle races still need a review across those writers.
Permanent deletion, trash listing and revision restoration retain separate owners and dispositions.
