# Authored resource references

## Ownership and representation

The note document is the source of truth for its authored note links and diagram references.
The shared note reference service reads the existing ProseMirrorDocument union and returns distinct
identities in document order. Notes and Skills pass note targets to relationship reconciliation.
Diagram gallery and export preparation use the same diagram-reference rule. Repository backlink
rows remain a derived index; this change does not add a second source of truth.

AttachmentLibrary owns its private embedded-image guard next to removal. It continues to refuse
removal when the containing note embeds the exact attachment endpoint. A URL mentioned in prose
does not count as an image. Note-attachment retention and project-file deletion remain unchanged,
including ADR 0016's separation between database state and object storage.

Remove the loose document-view interfaces. Retain NoteLinkTarget with the other note value types
for the editor's target list. The editor adapter's string-ID type remains in place. The archive importer owns its private
wiki-link pattern; ADR 0014's path identity and partial-import behavior do not change. No model
compatibility exports remain for these rules.

## Tests and caller verification

Move seven note-link cases and three diagram-reference cases beside the shared service. Replace
the old unknown-array/object-cast fixtures with typed document nodes. Missing note-link targets
remain legal editor states and are still ignored. Nested references, deduplication and stable order
retain their assertions.

Replace the two isolated attachment-reader cases with removal behavior: the existing refusal test
now uses a nested image, and a new prose-only URL case permits removal. Existing downloadable-file
and retained-byte tests stay with AttachmentLibrary. The focused service/controller run passes 35
files and 250 tests. Component edits only change imports, with no visible behavior change.

This records reference interpretation within note save/restore, imports and resource use. It does
not establish completion of link navigation, export rendering or attachment lifecycle review.
