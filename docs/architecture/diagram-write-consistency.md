# Diagram writes and search consistency

The studio controller commits each draft save, archive, or restore together with its search index
changes. Publication and revision restoration already use this transaction boundary. If indexing
fails, the operation fails and PostgreSQL retains both the previous diagram and previous search rows.

Draft edits still leave the published revision unchanged. The base version remains the concurrency
guard: an old canvas or agent edit cannot overwrite a different saved revision, while a repeated
save of the same source succeeds. This follows ADR 0010 and ADR 0011.

Three stateful regressions reproduced the earlier failure: the operation rejected after changing
the stored draft or trash state. PostgreSQL contracts now fail after actual search writes and verify
that those writes and the diagram change roll back together. Existing mutation contracts retain
lost-response replay, stale edits, publication history, and deletion tombstones.

The gallery already warns that moving a referenced diagram to the trash makes it unavailable in
notes until restored. This change does not establish a new deletion policy. Rendering after permanent
deletion remains a separate P17 scenario to verify.
