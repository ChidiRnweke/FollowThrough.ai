# Skill creation from selected content

W12.04 enters through create_skill_from_selection. The tool exists only when the agent request has a
selection. The model supplies the name, description and trigger hints; the factory supplies the
captured note ID, revision, offsets and text from request context. The tool is classified as a
mutation and follows the shared authorization/approval path. It does not ask the model to reconstruct
the source identity. The result carries skillNoteId and sourceNoteId. The client result reader maps
the skill identity to the actionable skill link, keeping the source separate.

Skills.createFromSelection owns one transaction. It locks the actor's catalog, validates the owned
source selection, then obtains the project/tree facts and inserts the candidate skill note beside the
source. SelectionOrigins resolves the selection again before inserting the source anchor and user
provenance. Exact text, integer offsets and current revision must agree. The controller saves the
selected text through the common note edit/index path, then creates skill metadata. The returned ID
belongs to that skill. Invalid metadata or a duplicate portable name rolls back the candidate note,
anchor and provenance. The project lock precedes the anchor's source-note foreign-key lock; retain
that ordering and the catalog lock established by the name transaction review.

NoteRecords scopes source reads to the actor and an active project. Folder placement follows the
shared note-creation rules. The source anchor records the observed range and quote; provenance names
Create Skill From Selection. There is no new public source-lineage field on the skill itself. This
review preserves that existing storage contract and the separate usage-provenance model. The generic
source reader can read individually archived notes in active projects; this review does not change
that common selection policy. An archived project cannot supply the destination.

## Test disposition

Replace the controller suite's selection and skill service doubles with real SelectionOrigins,
SkillLibrary and NoteCatalog against repository fakes. Correct the fixture document so it matches its
plain text. Retain content, project placement and invalid-name behavior. Assert a populated source
anchor/provenance pair, stale/mismatched/out-of-range refusal, and atomic rollback after metadata
validation fails. Repository fakes now support transaction snapshots of their stored records.

Add four PostgreSQL contracts for the saved skill and source evidence, duplicate-name rollback,
foreign-source refusal and stale-revision refusal. These use actual repositories and controller
transactions; they do not treat fake snapshot behavior as database proof. Add a presentation case
that opens the new skill rather than its source note. Keep the generic selection-origin validation
and agent approval suites. PostgreSQL verification runs in CI.

W12.04 is assessed. No production behavior or visible UI changes are introduced in this review.
Skill editing, import/export and restoration remain separate workflows.
