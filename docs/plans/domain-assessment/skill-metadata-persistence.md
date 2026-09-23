# Resolved skill metadata persistence

Skill metadata has three authorities before persistence: SkillLibrary.create resolves new values,
BuiltInSkills supplies released values, and Skills.update applies shared edits and prepared manifest
values to the locked current skill. Storage receives those resolved values.

The stored Skill type now requires slug, metadata and allowImplicitInvocation. Migration 0009 made
all three columns non-null, and toSkill already returns all three. All production constructors also
supply them. The optional fields described test shortcuts, not a production state. Test records now
include those values; the mention fixture no longer hides missing fields behind an object assertion.
The creation fake returns a complete valid skill record without an extra display-name authority.

SkillLibrary's portable projection and the agent catalog consume those required values. They no longer
invent a portable name or invocation setting for a supposedly resolved stored record. Request parsing
still supplies supported manifest defaults at the boundary. No database migration is needed.

## Storage behavior

SkillRecords.insert now inserts and rejects an existing metadata row. SkillRecords.update requires
the row to exist. Neither silently changes the operation into an upsert. Both check note ownership
and use the stored note title for the existing title projection. The fake follows the same ownership,
duplicate-insert and missing-update behavior.

Persistence converts absent license and compatibility to explicit SQL NULL. The previous update set
passed undefined, which Drizzle omitted, leaving earlier values in place when a complete imported
manifest omitted them. The metadata map, portable name and invocation flag are persisted as supplied;
the repository no longer generates names or fills business defaults.

## Declaration and workflow dispositions

- Skill's license and compatibility remain independent optional values: an imported manifest can
  supply either, both or neither. Metadata is a required possibly-empty map; its keys are author data.
- SkillManifest already requires the three resolved values. The frontmatter schema's optional metadata
  is a boundary input; manifest-reader produces the required map and invocation flag. Retain that
  distinction between request syntax and resolved values.
- W12.06 manifest import clears absent optional portable fields while retaining an explicit false
  invocation policy. The controller's document-base validation and transaction remain unchanged.
- W12.03 and W12.01 creation/installation supply the complete metadata value before storage. Duplicate
  insertions fail; update does not recreate a row lost after a stale read.
- SkillSummary inherits the required portable name and invocation flag. Its project/pin optionality
  and pin workflow are reviewed in [skill pins](skill-pins.md). PreparedSkillEdit's duplicate document
  payload, usage workflows and portable-name concurrency still need separate review. This is not a
  complete disposition of the skill namespace.

## Tests retained and added

Keep skill creation, built-in upgrades, import validation, shared metadata edits, agent catalog
selection, title projection, restoration and concurrent edit contracts. Existing fixtures supply the
same concrete default metadata that production creation supplies.

Add a controller import test for absent license/compatibility, an empty metadata map and an explicit
false invocation flag. PostgreSQL contracts verify that same stored result, duplicate insertion,
missing-row update and foreign-note refusal. These contracts distinguish the SQL writer from the
old fake's whole-object replacement. The SQL regression's before state is established from the old
writer; it was not executed locally because Docker is unavailable.
