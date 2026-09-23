# Diagram revision write ownership

## Meaning and entry paths

DiagramStudio coordinates draft save, rename, publication and revision restoration inside its
transaction. Agent editDiagram and workspace synchronization reach these same methods. The controller
locks the authoritative diagram, applies the shared rule, persists resolved fields, records a snapshot
only for a new publication, and indexes the saved diagram. DiagramLibrary no longer orchestrates those
workflows. Its read, guarded persistence and snapshot operations are called explicitly.

The shared diagram rule preserves identifier-bound ETags, archived/unsupported-kind refusal, trimmed
nonblank rename titles and whole-document conflicts. A completed identical request is acknowledged
against its original base. Repeating a publication preserves its original preview and snapshot. An
unchanged unpublished draft is not an already completed publication. Restoring a snapshot creates a
working draft without moving publication state.

The old generic revision helper is removed from models. Diagram and offline revision decisions share
their owner. Note saves keep their existing stricter base check in their own edit rule, without a
configurable boolean that combines two distinct retry contracts. Models retain change/write values
and the ETag constructor. No service imports another service to achieve this ownership.

## Confirmed fixes and test dispositions

A controller regression reproduced a rename committing while search updates were configured to fail:
rename skipped indexing entirely. Renames now index inside the same transaction and roll back on
failure. PostgreSQL guarded writes now send explicit nulls for absent title/preview values. This lets
restoring an untitled publication clear a later title instead of leaving a value the fake had cleared.

Move the eleven publication and two rename cases from DiagramLibrary to the real DiagramStudio with
the real library and shared repository/index fakes. Stale writes assert the public conflict result.
Add the rename rollback regression and focused shared-rule cases. Existing offline command cases keep
the same revision results. PostgreSQL contracts cover untitled restoration, rename/index rollback and
an unchanged save waiting behind a concurrent archive. The previous archive-lock contract remains.

ADR 0010 still defines safe retries and authoritative conflict views. No public command or response
shape changes or database migration are needed. The PR records observed validation. Legacy whole
diagram updates, note publication, folder lifecycle races and the wider assessment remain open.
