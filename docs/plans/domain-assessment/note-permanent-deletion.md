# Permanent note deletion

This completes the workflow assessment of W04.15 and W04.16, continuing the
[deletion ownership review](note-deletion.md). The decisions below retain the current
note deletion contract. Object-store reclamation is a separate attachment lifecycle concern.

## Entry points and user intent

Global Trash and project overview pass note and folder entries to TrashList. ConfirmDelete names the
selected item and warns that deletion cannot be undone; a folder warning includes its contents.
Bulk emptying has its own confirmation and is only offered after the local collection inventory is
complete. Project overview passes its project ID; global Trash leaves the scope absent. Agent tools delete_note_forever and empty_note_trash call the same controller methods with a
captured actor and parsed identifiers. Their tool descriptions require user confirmation; emptying
also tells the agent to list the affected trash first. The run's mutation approval mechanism is a
separate authority boundary. The note controller does not infer consent from a UI confirmation.
Agent result presentation names a deleted note from the returned deletedNotes title, rather than
trying to read a record that no longer exists.

ProjectActions calls the authenticated deleteNoteForever or emptyNoteTrash remote command. The
boundary validates UUIDs and obtains the request actor. The commands are online server operations,
not offline queued note edits. The client reports a server rejection and does not invent a successful
delete result. The installed SvelteKit remote transport wraps returned server failures in HttpError;
ProjectActions reads its body.message, preserving the server's reason.

## Decision ownership and persistence

NoteCatalog locks the owned active project and reads authoritative trash state. A global empty locks
active projects in sorted order and excludes projects created after that locked inventory. The shared
prepareNoteDeletion decision rejects active notes and skills, includes visible trashed descendants,
and orders children before their folders. Skills remain excluded because the ordinary trash never
showed them. A visited set terminates malformed cycles. Legacy active descendants survive and the
parent foreign key moves them to the root when their folder is deleted.

Notes.deleteForever and Notes.emptyTrash own the transaction. persistDeletion requires each selected
row to be deleted; an unexpected restored or missing row raises a stale-state failure and rolls back
the batch. The repository independently requires actor ownership, archived state and a non-skill
kind. Results contain the actual deleted identities and titles. An already-empty bulk operation is a
valid empty result, not a failed lookup default. A specific missing note is a failure.

The database owns dependent-row cleanup through its foreign keys: note revisions, anchors,
attachments and associated search rows reference the deleted note or its attachments. This workflow
does not claim to remove S3 objects. Attachment versions and object-store reclamation remain W14.12
and W14.15; they cannot share the note transaction merely because SQL rows cascade.

## Presentation after deletion

ProjectActions waits for the server result, then requests workspace synchronization. The session
synchronizer returns an explicit failure value for a download failure; it does not throw that failure
back as if a committed deletion had failed. Synchronization errors remain available to SyncStatusMenu,
which shows the failure and retry action. The deletion result still reaches the caller. Cached rows
can remain until a successful refresh; this is not presented as a rolled-back server transaction.

Mixed note and diagram emptying is deliberately sequential. Diagrams use their durable workspace
commands first, followed by the atomic note batch. A diagram admission failure stops the sequence and
reports its failure. Earlier accepted diagram commands remain accepted. A note failure shows an error
without undoing earlier diagram commands. The whole mixed operation is not one transaction and has
no all-or-nothing guarantee. The current list reflects staged diagram changes and subsequent downloads.

## Test dispositions and boundaries

Retain all 21 note-deletion decision and controller tests. They cover children-first ordering, nested
folders, legacy active descendants, hidden skills, owned project scope, empty results, actor isolation,
revision removal and rollback when a later deletion fails. Retain the PostgreSQL deletion contracts:
concurrent restore versus individual/bulk deletion, restore after deletion, restored children,
repository guards without the controller lock, and rollback after a real database trigger failure.
The repository suite also checks deletion of a note whose revision snapshots an attachment, including
the restrictive attachment-version foreign key.
Retain the TrashList browser tests for confirmation, action dispatch and kind identity, and the
inventory-readiness tests from the trash review. No new abstraction or mirrored test is needed.

All 21 focused decision/controller tests and all 11 mounted TrashList browser tests passed. Remaining
checks are recorded in the PR. The browser tests mount real components with synthetic data;
they do not claim a live database-backed mixed trash journey. Cross-device unsent edits, physical
object reclamation and diagram reconciliation remain their own workflow boundaries. No application
code or deletion policy changes in this assessment.
