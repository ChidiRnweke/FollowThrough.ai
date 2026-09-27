# Publishing notes and discarding drafts

## Publish: W04.06

NoteWorkspace saves a dirty editor buffer before staging publication. A failed save or unresolved
conflict blocks publication. Offline saves and publication remain separate dependent outbox commands:
publication follows its observed save, and later edits remain after publication in the queue. The UI
says publication is saved on this device; this is distinct from server synchronization. The shared
unpublished-change rule considers command order, not only cached revision numbers.

WorkspaceDraft captures the displayed resource base and stages a publishNote command against that
identity. Synchronization checks the resource ETag and operation identity, then Notes.publish takes
the note lock and checks the authoritative ETag. The agent publish_note tool supplies an explicit
baseEtag to the same controller. The shared publication rule rejects archived content and resolves
publication fields from the locked note. Snapshot creation, attachment snapshotting, retention and
the publication write share one transaction. See [publication ownership](note-publication.md) for the
original race and rollback evidence. Retain repeat-publication timestamp behavior; this review does
not invent a new no-op policy.

## Discard: W04.07

The editor saves first and requires a synchronized draft. It reads the observed published snapshot,
then WorkspaceDraft checks that the snapshot belongs to this note and matches its published revision
before staging discardNoteDraft. A later editor generation prevents an earlier response from replacing
new typing. The server synchronization boundary checks the observed ETag. The agent's discard_note_draft
mutation invokes the same controller directly and means the latest published version at execution.

Notes.discardDraft previously read the publication pointer and selected a snapshot before acquiring
the note's write lock. A competing publication can advance publishedRevision without changing
currentRevision. After waiting for that publication, the late lock therefore did not stop discard
from copying the older snapshot over the newly published content.

Acquire the existing note edit lock before reading the publication pointer and selecting its snapshot.
The real NoteCatalog and repository then keep publication selection, copied content, attachment
restoration, anchor/link repair and indexing inside one transaction. A discard that waits for a newer
publication sees that publication when it acquires the note. Missing history remains a not-found
failure; a failed consequence rolls the write back. The operation preserves publication identity and
history rather than deleting snapshots. A meaningful copied body advances the working revision; an
already matching body does not invent another content revision.

## Evidence and test disposition

A real Notes/NoteCatalog composition regression failed before the lock change and passes after it.
The in-memory repository pauses its next locking read so a real publication can finish before discard
acquires the note. Add a PostgreSQL counterpart with separate publishing/discarding connections and
an observed lock wait; it checks both the returned and persisted content. Existing publication tests
cover stale ETags, archived notes and rollback after snapshot creation. Existing discard tests cover
missing publication, the published snapshot versus a later legacy snapshot, restored attachments and
failed-index rollback. Retain those distinct consequences.

Seeded browser verification mounted the actual note pane and editor with real WorkspaceResources and
an in-memory offline transport. Editing then publishing queued saveNote → publishNote with a dependency.
Later typing queued another dependent saveNote and stayed in the buffer. This proves local command
ordering and retention, not server publication from the browser. Temporary fixture/session changes
were removed. SQL evidence comes from CI, not a local database run.

W04.06 and W04.07 are assessed. History selection/review and restoration remain separate workflows.
The history dialog currently promises that an unpublished draft remains in history when restoring,
but ordinary note restoration does not snapshot that draft; correct the user-facing promise without
silently changing the unresolved restoration-policy distinction recorded in D03.
