# Direct skill creation

W12.03 starts in the skills catalog wizard, the project tree, or the create_skill agent tool. The
catalog names its known Inbox project and accepts an optional description and initial instructions.
The tree supplies the selected project and optional folder, then opens the returned skill note. The
agent tool uses the explicit project-selection rules recorded in the project selection review.
Remote input is parsed before the controller; the authenticated actor is supplied by the boundary.

The wizard previously created an empty skill and then called saveSkillDraft. A blank optional
description was accepted by creation but rejected by that second command. The UI reported failure
after the empty skill had committed. Retrying the same name then failed catalog uniqueness.

Creation now accepts optional initial instructions. Skills.create locks the actor's catalog, resolves
note placement through NoteCatalog and the shared creation decision, inserts the skill note and
metadata, and saves the supplied body in the same transaction. It reuses saveDocument for note
persistence, anchor repair, link reconciliation and indexing. The returned skill contains the saved
note. A failure rolls back the creation. Callers that omit instructions retain empty-note creation.
The wizard calls this operation once, preserves its fields on failure, and opens the returned ID on
success. Navigation failure after a committed creation remains a separate UI failure case.

SkillLibrary normalizes the portable name, rejects an occupied active catalog name and validates the
description. A blank description deliberately produces the existing human-readable description;
this is a product default, not recovery from a failed lookup. Catalog locking prevents concurrent
imports and creations from bypassing the name decision. Active owned project and folder requirements
come from note creation. SkillRecords stores actor-scoped metadata attached to the owned note.
Retain these shared decisions and locks; the wizard must not recreate them in a second write.

## Evidence and test disposition

Replace the creation suite's skill-creator double with real SkillLibrary, NoteCatalog and repository
fakes. Retain stable identity, name, folder placement and invalid-name cases. Add initial instructions
with a generated description, rollback on indexing failure, and rollback on invalid metadata. Two
cases failed before the fix; all eight creation cases pass after it. Add SQL contracts for the saved
body/description and rollback of the candidate note and metadata. Existing name-transaction contracts
cover competing creation/import and actor scope. PostgreSQL contracts run in CI.

The browser evidence uses the real catalog component, remote commands and controller/services with
seeded in-memory repositories. It reproduces the old wizard error and verifies successful creation
with the fix. The after image shows the reopened catalog. It does not claim a browser-to-PostgreSQL
round trip or real detail-page navigation; controller and SQL assertions verify the stored body.

W12.03 is assessed. Selection-based creation, editing, portable imports, restoration history and
legacy names that predate built-in installation remain separate workflows or policy questions.
