# Skill history reads

W12.13 enters through the list_skill_versions agent tool. The boundary accepts a skill note identity;
the controller first loads the owned active skill, then reads immutable note revisions. The tool
projects revision content through the same note revision format used elsewhere. This is an on-demand
server read, not another collection in the current-record workspace cache. Empty history is a valid
result for a skill that has only unpublished drafts.

NoteRecords orders snapshots by increasing revision. NoteCatalog.revisions reverses that order so
history reads show the newest snapshot first. Skills.listVersions reversed the service result again,
returning the oldest snapshot first. Remove that second reversal and keep ordering at the existing
revision reader. The service and repository keep ownership and active-project checks; SkillLibrary
also refuses an individually archived skill before history is read.

## Evidence and test disposition

A regression composes Skills with real SkillLibrary and NoteCatalog over repository fakes. Two stored
snapshots were returned as 1, 2 before the fix; the required newest-first result is 2, 1. The regression
now passes alongside archived-skill refusal and empty-history cases. Fixtures keep immutable snapshot
content separate from the current unpublished draft.

Add a PostgreSQL contract that creates and publishes two skill snapshots through real controllers,
saves a later unpublished draft, and reads history. Only the two snapshots return, newest first. A
second contract refuses another actor's skill history. Keep existing snapshot immutability,
publication, ownership and restoration tests. No test asserts implementation shape or the absence of
a reversal call.

W12.13 is assessed. This changes only read order. It does not settle D03's distinction between ordinary
note and skill restoration history or change which operations create immutable snapshots. W12.14
remains open for that decision. No visible skill history page is introduced; the existing tool returns
the corrected order.
