# Note draft save ownership

## Meaning and entry paths

Notes.save, rename, discardDraft and restoreRevision use one locked edit path inside the controller
transaction. Reviewed replacements, text replacement and synchronized saves reach that path through
Notes.save. Skills document import, title edit and version restoration use the same shared preparation
rule inside their own controller transaction. Anchor repair, links and indexing retain their existing
atomic outcomes. Skill restoration still records history; ordinary note restoration does not.

NoteCatalog.getForEdit checks actor ownership and reads the authoritative note under a row lock.
The controller applies prepareNoteSave. NoteCatalog.persistEdit receives a resolved note and expected
revision; its repository retains the targeted compare-and-swap guard and active-note condition. The
catalog no longer chooses whether a draft changed or increments its revision. The shared fake stores
those resolved fields instead of duplicating revision and content rules.

Preserve blank-title/document validation, archived-note refusal, project/kind immutability, folder
content restrictions and stale-revision rejection. An unchanged note save still rejects a stale base;
this differs deliberately from diagram unchanged-retry acceptance. A no-op now waits for concurrent
row changes before validating. Authored edits retain authoritative placement and publication facts.
Offline commands use the same authored-field application helper. Their sync protocol continues to
own local revision handling.

applyNoteDraftEdit and sameNoteDraft leave models for the shared edit service. Skills checks its
import base against the prepared document in the controller, so SkillLibrary no longer imports the
comparison rule. The subsequent [diagram-revision slice](diagram-revisions.md) removes the generic
revision decision and keeps the distinct note and diagram retry rules with their owners. The subsequent
[note-publication slice](note-publication.md) covers publication races and targeted writes.

## Test dispositions and remaining review

Move six save guarantees from catalog tests to real Notes/controller/catalog tests. Keep existing
save, indexing rollback, reviewed edits, restore and skill import regressions. The shared draft fixture
now seeds through Notes with the supplied transaction runner, including PostgreSQL contract fixtures.
Its unrelated indexing and link effects are explicitly in memory. Add shared-rule tests for stale
unchanged saves, archived no-ops and authoritative metadata preservation. Add PostgreSQL contracts
that block an unchanged save behind a concurrent archive or edit and verify refusal after commit.

No command or response change or database migration is needed. The dependent PR records validation.
Diagram revision writes and note publication have subsequent dispositions linked above. Folder
lifecycle races and the wider assessment remain open.
