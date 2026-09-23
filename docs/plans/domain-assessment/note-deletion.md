# Permanent note deletion

Notes.deleteForever and Notes.emptyTrash own locked facts, the deletion decision and persistence in
one transaction. The deletion service selects visible trashed descendants in children-first order.
Models retain note values and public request/response types. The old NotePurger workflow port and
catalog workflow methods are removed.

Individual deletion locks the active project before the target note and reads its current trash
inventory. Empty trash locks the selected active projects in stable ID order before reading the
inventory. Projects created later are outside that locked inventory. The existing distinction stays:
individual deletion refuses an active or hidden skill note; empty trash only removes visible trash
and may return an empty result. Archived projects remain hidden under ADR 0009.

The storage delete now requires an actor-owned, archived, non-skill row and returns its actual ID and
title. A row that no longer qualifies aborts the whole deletion transaction. This also protects the
storage boundary when a writer does not share the project lock. No migration is needed.

## Entry paths and test dispositions

Project trash actions call the validated project remote commands, which invoke Notes. Agent tools
delete_note_forever and empty_note_trash invoke those same controller methods. The project UI scopes
empty trash to its displayed project; the agent may request all visible projects. There is no new
offline deletion path or changed confirmation flow.

Keep controller cases for actor scope, hidden skills, descendants, deletion order, revisions and
empty/project-scoped trash. Replace pass-through transactions with the rollback-capable fake. Add
folder and multi-project rollback tests. Make the fake detach surviving children like PostgreSQL's
ON DELETE SET NULL; the legacy active-child case now checks its resulting root placement.

Keep PostgreSQL revision and attachment-history cascade contracts, with archived deletion fixtures.
Keep actor isolation using an archived foreign note so the ownership predicate is actually tested.
Add six deletion contracts for concurrent restores, the inverse delete/restore order, restored child
survival, the storage guard and a PostgreSQL-triggered rollback. Add storage protection for hidden
skills. The tree races share a database harness; they still execute real controllers and repositories.

This continues W04.15–W04.16 and the races left open by
[project tree transactions](project-tree-transactions.md). Built-in repair continues in
[built-in note writes](built-in-note-writes.md). The remaining workflow/declaration inventory still
requires its separate review. Tests and ownership here do not
establish repository-wide assessment completion.
