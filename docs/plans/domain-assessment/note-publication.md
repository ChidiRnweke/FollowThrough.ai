# Note publication ownership

## Meaning and entry paths

Notes.publish owns the transaction used by the public publish command and workspace publication.
It locks the actor-owned note before checking the requested ETag. The shared publication rule refuses
archived notes and resolves the exact revision and timestamps. The controller records that same note
and then persists publication fields. NoteCatalog no longer rereads a possibly different revision or
updates the whole note to mark it published.

The targeted repository write compares the expected document revision and active state, changes only
publishedRevision/publishedAt/updatedAt, and returns the saved note. A failed guard is a stale-revision
error. Snapshot creation, attachment snapshotting, history retention and publication remain in the
same transaction. Existing repeated-publication timestamp behavior is preserved; this change does not
introduce a new no-op rule. Models contain the resolved write value. The shared fakes consume it.

## Confirmed fixes and test dispositions

A controller regression reproduced publication of an archived note. It now reports validation failure.
Previously a concurrent edit could commit after the controller checked the ETag and before the catalog
reread or whole-note update. Publication could then name a revision other than its snapshot or overwrite
the peer's fields. PostgreSQL contracts hold an edit or archive open while publication waits, then verify
refusal, preserved peer state and no new history. Another contract rejects the publication update after
snapshot creation and verifies rollback of both. The unit suite also covers that rollback.

Keep existing publication snapshots, stale ETags, attachment versions and retention tests. The skill
import test now publishes through the real Notes controller instead of calling catalog workflow methods.
No command/response change or database migration is needed. Observed validation belongs to the PR.
Project/folder lifecycle coordination and the remaining workflow/declaration inventory remain open.
