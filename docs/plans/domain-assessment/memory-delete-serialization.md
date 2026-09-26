# Direct memory deletion and concurrent edits

Direct memory deletion previously loaded an unlocked entry and wrote that whole snapshot back with
a deletion timestamp. If another transaction edited the entry while deletion waited for its row,
deletion could overwrite the newer content and sharing choice with its stale snapshot.

Deletion now uses the same locked active-entry read as direct editing and proposed removal. The
Memory controller already owns the surrounding transaction. Once a concurrent editor commits,
deletion reads its resulting entry and marks that version deleted. Existing project availability
checks and index cleanup still apply. Proposal validation remains a read, without an unnecessary
write lock.

Add a PostgreSQL contract that holds the entry lock, starts direct removal, observes the removal
waiting for the row, then commits changed content and sharing before releasing it. The retained
soft-deleted row must preserve the newer content and private setting. This requires a real database;
a fake that reproduces lock ordering would test its own locking implementation.

Keep direct-edit, deletion/index cleanup, proposal replacement and archived-project regressions.
This addresses one W11.03 concurrency path. Concurrent project archival and the complete memory
family review remain separate. Local Docker is unavailable; the SQL regression requires CI.
