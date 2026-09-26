# Retiring whole-note persistence

NoteRepository.update, the PostgreSQL implementation and the fake's public whole-note update are
removed. Built-in repair was their last production caller. Document edits and stock upgrades use
revision-guarded writes; publication, trash, built-in placement and section numbering each use their
existing targeted write. The fake's trash implementation now stores only its resolved trash fields
directly, preserving the current document and publication state.

The agent-file markdown adapter now names Note.document directly instead of extracting that type
from the removed repository method. The architecture navigation map points task edits, note saves,
trash and tree moves to their current controllers and shared rules.

The remaining general writes were storage-contract setup. They now use replaceNoteFixture in the
integration database harness. It installs an explicit complete fixture and fails if the owned row is
missing. It is not a production repository capability. All contract operations and assertions still
exercise the real repository or controller under test.

## Test dispositions

Keep the existing save, publication, archive/restore, permanent deletion, stock upgrade, revision,
attachment-history and diagram-reference contracts. No behavior test is replaced with a helper-call
assertion. No new tests are needed for removing an unused production interface; the retained tests
verify its actual replacements. The fixture helper restores known setup states, including explicit
clearing of nullable fields.

This closes the whole-note write retirement identified by
[built-in note writes](built-in-note-writes.md). [Inbox lifecycle](inbox-lifecycle.md) is addressed in
a later slice. Skill metadata workflows and the repository-wide declaration inventory remain separate.
