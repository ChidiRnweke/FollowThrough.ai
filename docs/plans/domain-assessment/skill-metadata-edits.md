# Skill metadata edits

W12.08 enters through the catalog's enabled switch, the description editor, the update_skill tool, or
workspace synchronization. The catalog captures the metadata draft before staging a toggle. The editor
stages a changed description before its instruction-body command. Browser preparation and Skills.update
both use applySkillMetadataEdit: omitted fields preserve the current value, a blank description keeps
the current description, and supplied trigger hints trim and remove blanks. Enabled state is separate
from whether a skill exists or can be deliberately opened.

The shared rule previously accepted descriptions longer than the portable limit. Creation, import
and serialization already enforce 1,024 characters, but metadata-only controller edits skip document
validation. A successful ordinary edit could therefore leave a skill that fails later serialization.
Apply the existing limit to supplied trimmed descriptions in the shared metadata rule. The local
command fails before enqueueing, and the server rejects before any companion toggle or other field
commits. An exactly 1,024-character description remains valid. Blank-description retention and
unrelated fields retain their existing semantics. This does not rewrite previously stored metadata.

Skills.update owns a transaction and takes the catalog, note and metadata locks before preparing the
edit. Metadata alone does not advance the note body revision. Synchronization validates the resource
ETag and operation identity, then invokes the same controller; a stale toggle cannot overwrite a
concurrent description. Actor ownership and active skill/project guards remain at the repository and
service boundaries. Retain this division rather than duplicating metadata validation in each UI or
remote schema.

## Evidence and test disposition

Two regressions failed before the fix: local command preparation accepted the oversized description,
and a real controller update replaced its saved description. Both pass after it. Retain existing
normalization, omitted-field, empty-hint and disabled-state tests. Add the exact-length/trim boundary.
The combined body/metadata rejection test now checks the domain failure and unchanged body instead of
requiring the error wording from the later serializer. Add PostgreSQL contracts for direct and
synchronized refusal, including preservation of the companion enabled-state field.

A browser check mounted the actual skill route/editor with real WorkspaceResources and seeded
in-memory sync storage. Valid offline description and body edits remained in two local commands, and
export stayed blocked while they were unsynchronized. For an oversized description, the before state
queued the invalid edit. The after state kept the typed text in the buffer, preserved saved metadata,
queued no writes and displayed the existing save-failure state. Manual retry reported the 1,024-character
limit. Matched captures show this local boundary; they do not claim a live PostgreSQL browser session.

W12.08 is assessed. Ordinary note autosave and reviewed agent body changes remain separate workflows.
