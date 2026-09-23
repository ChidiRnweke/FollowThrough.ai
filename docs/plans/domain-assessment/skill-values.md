# Skill value declarations and prepared edits

Reviewed against the branch following PR #200. This is a declaration disposition, not a claim that
all skill workflows are complete. ADRs 0037 and 0041 retain schemas and values in models and put
workflow rules in shared or server services.

## One candidate note

PreparedSkillEdit previously carried both skill.note and document. Title edits put the old note in
the first field and the candidate in the second; imported edits put the same candidate in both.
The controller depended on that convention. Each arm now carries its candidate only in skill.note.
The document arm retains the portable manifest used for validation before any save. The metadata
arm retains the current note; its controller does not write the note or create a revision.

Skills.update compares the reviewed base with that candidate, saves it when appropriate and replaces
it with the actual persisted note before committing metadata. The controller still owns the transaction,
body consequences and rollback. This changes no public request, response or storage format.

## Current declaration dispositions

| Declarations                                                                      | Disposition and evidence                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand, local ProjectId/NoteId/ProvenanceId/DateTime, exported SkillUsageId        | Retain identity values. Local declarations keep the model domain self-contained; repositories and controller inputs use the branded IDs. They do not decide behavior.                                                                        |
| TextSelection                                                                     | Retain the complete reviewed selection: note, revision, offsets and text. Selection-origin validation consumes all five facts for skill creation.                                                                                            |
| Skill                                                                             | Retain one instruction note with metadata. The required resolved fields and independently optional license/compatibility are reviewed in skill-metadata-persistence.md.                                                                      |
| skillMetadataSchema                                                               | Retain boundary validation of author-chosen string keys and values. DB mapping uses it; it is not an orchestration workflow.                                                                                                                 |
| SkillManifest, skillFrontmatterSchema, SKILL_PORTABLE_LIMITS, SKILL_PORTABLE_NAME | Retain portable values, syntax and constraints. The remote manifest reader parses frontmatter; shared manifest validation and serialization consume the same constraints. Optional source metadata becomes a required resolved map.          |
| SkillEditInput                                                                    | Retain independent patch fields. Display name, description, trigger hints and enabled state can each change alone. Optional content is a discriminated request with its required base revision and either instructions or a parsed manifest. |
| SkillSummary, SkillPinChange                                                      | Retain resolved catalog and project pin values; see skill-pins.md. Source project and selected-project pin are separate facts.                                                                                                               |
| SkillUsage                                                                        | Retain stored history. Context and provenance are independently nullable foreign keys with set-null deletion behavior. A context-free load still supplies provenance, and either referenced row can later be deleted.                        |
| LoadSkillInput                                                                    | Retain required provenance for a new load and optional context. This request is intentionally stronger than the historical SkillUsage record after referenced rows are deleted.                                                              |
| CreateSkillInput                                                                  | Retain request optionality. A caller may supply an ID, parent, description or trigger hints independently. Project is required; creation resolves the complete note and metadata before storage.                                             |
| CreateSkillFromSelectionInput/Output, CreateSkillOutput                           | Retain selection creation's complete inputs and the two established command response shapes. Controllers and remote commands consume them.                                                                                                   |
| RestoreSkillVersionInput, GetSkillViewInput                                       | Retain explicit revision selection versus current-note identity. Restoration and reading have different required facts.                                                                                                                      |
| NoteRef, SkillUsageView                                                           | Retain the optional joined context-note display value. Its containing object keeps ID and title together. A stored usage can outlive an accessible context note.                                                                             |
| SkillView, ListSkillsOutput                                                       | Retain complete controller response values consumed by remote commands and the editor/catalog. Empty usage or skill arrays are valid collections.                                                                                            |
| PreparedSkillEdit                                                                 | Change to one candidate-note authority as described above. Keep the tagged arms because they select metadata-only, title and validated content-save behavior.                                                                                |

There are no exported workflow functions left in this model file. Creation, naming, metadata edits,
portable validation/serialization, pinning, provisioning and usage rules have explicit service owners.
Their placement does not itself prove those workflows correct.

The companion built-ins.ts model retains BuiltInSkillDefinition as released data. Its optional version
supports historical unversioned definitions; its independent optional surfaces selects automatic
screen requests. FollowThrough's versioned definition has no surfaces, while Diagramming has both.
BuiltInSkills uses versions to identify stock metadata; built-in-definitions uses surfaces to select
requested skills. Neither optional field is a substitute for a missing resolved installation value.

## Verification and remaining work

Retain existing controller tests for title persistence, metadata-only history, imported body state,
validation-before-save, stale bases, identical retries, current metadata and rollback. Retain reviewed
skill-edit, offline metadata, manifest and PostgreSQL concurrent edit contracts. They observe the
saved result rather than the removed duplicate field; no test is added merely to mirror this shape.

[Portable-name concurrency](skill-name-transactions.md) has a separate transaction review; legacy
collisions remain open. Usage ownership/atomicity and archived skill discovery still require workflow
review. Preserve the tested restoration snapshot distinction while D03 remains unresolved.
The old workflow ledger is not closed by this declaration review.
