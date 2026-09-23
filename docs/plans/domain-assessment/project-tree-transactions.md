# Project tree transactions

Notes.create and the import folder path now hold a controller transaction around creation facts and
insertion. Projects.createFolder does the same. Skills creation already owns that transaction.
Creation facts lock the actor's active project before reading a parent and sibling count.
Selection-based skill creation validates the source first, creates under that project lock, then
records its anchor and provenance. This prevents the anchor's note foreign-key lock from preceding
the project lock. The whole operation still rolls back together.

Projects.move locks the same project before reading the tree. The controller applies the existing
placement rule and sends resolved order changes to persistence. The former ProjectEntryMover
workflow port and its duplicate workflow in the fake are removed. Read and ordering persistence
remain in ProjectCatalog. Move remains a server command; the existing offline creation and trash
rules are unchanged.

Note archive and restore acquire this project lock before locking the note or its parent. Creation,
movement and these trash transitions therefore use one order: project, then notes. Project archive
updates that same project row. A waiting creation rechecks the active-project predicate before it
can insert. Per-project serialization is an invariant lock, not an arbitrary read cap.

## Guarantees and test dispositions

Move the three service placement cases to controller tests using the real catalog and repository
fake. Keep descendant refusal, source-gap closure and subtree preservation. Keep existing controller
ownership, root movement, folder creation, note creation, skill and import regressions. Test helpers
now supply a transaction runner explicitly; PostgreSQL helpers use the real contextual runner.

Six PostgreSQL races hold an actual controller operation open until its competitor reaches a lock.
They cover creation after folder archive, folder archive after child creation, opposite moves that
would form a cycle, sibling creation order, creation after project archive and movement after folder
archive. Existing authoritative edit/archive and archive/restore races remain.

This slice covers W03.04, W03.06–W03.07, W04.01 and the placement part of W04.12–W04.13. It does not
complete those workflow assessments. Permanent deletion and empty-trash races continue in
[note deletion](note-deletion.md). Built-in skill provisioning still has general note writes; its placement and
repair semantics need a separate disposition. No database migration or public command change is
required. These limitations remain implementation work, not user-approved deferrals.
