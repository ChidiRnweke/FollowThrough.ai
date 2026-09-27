# Note attachment removal and retained revisions

This continues W14.12–W14.14 under ADRs 0011 and 0016. It does not complete the attachment lifecycle
assessment or establish a garbage-collection policy for retained file versions.

## Observed discrepancy

The visible attachment list calls removeAttachment by attachment ID. AttachmentLibrary.removeById
refuses removal when the current note still embeds the attachment, then detaches an unreferenced note
attachment without deleting its file bytes. Retained note revisions may still need that version.
Project attachments have a separate deletion branch.

The exported removeAttachmentByPath form calls Attachments.remove instead. No current component
imports that form, but it remains a callable request boundary. This path previously cleared the
current version and deleted its object bytes. It also bypassed the embedded-image check. A later
revision restore could restore the database pointer but could not restore the deleted file.

The PostgreSQL repository already keeps attachment versions and only clears currentVersionId for
note-relative removal. NoteRecords.insertRevision records current attachment versions, and
restoreAttachmentSnapshot reinstates those pointers. The destructive discrepancy is in orchestration,
not the snapshot representation or the database schema.

## Repair and ownership

Resolve the relative path to the owned attachment, then use the existing ID-based removal behavior.
An embedded image produces an explicit validation error for the form. A missing path remains an
idempotent no-op. An unreferenced attachment leaves the current note while its bytes remain available
to retained revisions. Return the removed attachment ID so the controller removes its search content
within the same transaction. No independent note revision is created by attachment removal.

This reuses the attachment library's existing decision instead of creating a second removal policy.
The public path form remains available. The controller comment now describes detachment and history
retention instead of incorrectly promising permanent deletion.

## Test dispositions and limits

Repair the existing in-memory attachment repository's path lookup: it previously always returned
undefined and could not expose the path-removal defect. It now returns its stored view only for the
matching note and path. Add three tests for retained bytes, refusal while embedded, and detachment
with its indexing identity. The first two fail before the fix. All 46 focused attachment tests pass.
Retain ID-based reference checks, project-byte deletion, note revision stability and search cleanup.

Add a PostgreSQL contract that finalizes an attachment, snapshots its version, removes it by path,
restores the snapshot, and checks both the restored version and retained object in the storage fake.
Local and CI results are recorded in the PR. This does not use a live object store or OCR/model call.

Project attachment deletion still combines SQL changes and object-store removal without a shared
transaction. Durable object reclamation after deletion, concurrent reference changes, removed-note
retention, and cleanup of replaced/unreferenced versions need their own review. W14.12–W14.14 remain
open; this fix establishes parity for the two note-attachment removal entry points.
