# Skill catalog name transactions

W12.03 creation and W12.06 imported edits reject a portable name already in the actor's active skill
catalog. SkillLibrary checked the catalog before writing, but two edits of different skills could
both pass that check before either committed. The existing SQL index contains note_id and slug;
it does not enforce catalog-wide uniqueness.

Skills.create, createFromSelection and update now acquire the actor's catalog advisory lock at the
start of their transactions. BuiltInSkills uses the same lock and retains its existing namespace.
The lock precedes project, note and metadata locks. A waiting import checks the committed catalog,
so it rejects a newly occupied name or accepts a name the prior transaction released. Public error
semantics, portable formatting and actor scope remain unchanged. No database migration is needed.

Skills.synchronize takes this lock before receipt preparation, because receipt preparation itself
locks the target metadata row. The sync repository now locks a skill's owned note before metadata,
matching direct edits, provisioning and the title projection trigger. This preserves ordinary
conflict responses when a concurrent rename changes the skill ETag. Locking does not reinterpret
a missing or deleted row as a successful write.

## Evidence and test decisions

Retain shared metadata, reviewed edit, creation, selection provenance, import validation, stale-body,
identical retry, snapshot and provisioning tests. The fakes retain no-op lock methods; database
contracts establish concurrency rather than pretending an in-memory fixture proves row ordering.

Five name contracts run controller transactions across actor projects: competing imports, creation
followed by import, reuse of a released name, built-in provisioning followed by conflicting creation,
and the same name for distinct actors. Rejected imports retain the original document and metadata;
rejected creation leaves no candidate note. A sixth contract holds a note row, starts a real sync
write, then renames the note. It requires the rename to commit and sync to return a conflict with the
description unchanged. The harness disables transaction retries, so they cannot hide a lock cycle.

The name race's before state follows from the two unlocked catalog reads and the absence of an
actor-wide SQL constraint. PostgreSQL is unavailable locally; the old SQL scenario was not executed
locally, and the new contracts must pass in CI before they count as observed evidence.

This change serializes the existing decisions. It does not rename preexisting duplicate catalog
entries or settle an authored name that predates installation of a built-in with that name. Built-in
reconciliation and legacy collision policy remain explicit follow-up work. Usage and archived skill
discovery also remain separate review items.
