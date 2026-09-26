# Skill edits and restoration

Skills.update and Skills.restoreVersion own their existing transactions. They now obtain the current
skill through SkillEditor.getForEdit before making a metadata, content or restoration decision.
SkillLibrary locks the actor-owned note first, then its metadata. Missing notes or metadata fail;
archived notes and non-skill notes cannot receive skill edits.

The earlier unlocked load let independent metadata edits overwrite each other. Restoration also
carried old metadata through a later locked document save. The current read now supplies both records
before applySkillMetadataEdit, prepareEdit and the reviewed document-base check. The save and metadata
write remain in the same controller transaction, including restoration's immutable snapshot and
attachment consequences. Public commands and responses are unchanged.

## Workflow entry paths and retained decisions

- W12.08 and W21.21: the catalog toggle and skill-detail workspace stage updateSkill; synchronization
  dispatches to Skills.update. Browser command preparation and the locked server edit both apply
  applySkillMetadataEdit. An omitted field keeps its current value; an empty description keeps the
  current description; supplied trigger hints trim and remove blanks. Metadata alone does not advance
  the document revision. Keep command-skills.spec.ts and import-document.spec.ts normalization cases.
- W12.06 and W12.09: importSkillMarkdown parses the manifest at the remote boundary; saveSkillDraft
  supplies instructions and a base revision. Skills.update checks portable validity and the current
  document base before saving. A stale different document fails; an identical draft remains a no-op.
  Keep manifest-reader and import-document behavior tests. Duplicate portable-name race handling
  remains a separate persistence review.
- W12.14: the restore_skill_version agent tool calls Skills.restoreVersion. The selected immutable
  snapshot supplies only document fields. Current metadata survives; attachment restoration and the
  new revision commit together. Preserve the existing skill-history behavior identified in D03;
  this change does not equate it with ordinary note restoration.

The note-before-metadata order matches built-in provisioning. Migration 0057's skill-name trigger
reads the note FOR SHARE when writing metadata, while note title changes update that metadata. A
metadata writer must not take its row first and then wait for a note held by provisioning or rename.
The controller read takes both locks before any such write. Creation owns its newly inserted note;
built-in upgrade already locks its note and metadata.

## Test dispositions

The archived metadata regression failed before the change: disabling an archived skill returned a
successful view. It now rejects with VALIDATION. Keep existing shared metadata normalization,
manifest import validation, stale-base checks, unpublished title edits, failed-metadata rollback and
restoration/history coverage.

PostgreSQL contracts run competing real controller transactions. They cover independent metadata
edits, rename followed by metadata edit, metadata edit followed by restoration, stale instructions,
and disable followed by provisioning. The first controller transaction stays open until the second
connection reaches a database lock. Assertions inspect the saved state or returned domain outcome.
They do not count repository calls. Storage contracts are verified in CI; Docker is unavailable in
the current local environment.

This continues the skill edit and version workflows. [Resolved metadata persistence](skill-metadata-persistence.md)
removes repository defaults and upsert semantics. [Skill pins](skill-pins.md) reviews project pin writes,
and [skill values](skill-values.md) records declaration dispositions. Portable-name conflict handling
and usage writes still need separate review. This slice does not establish
repository-wide completion.
