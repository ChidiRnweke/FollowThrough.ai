# Built-in note repair and upgrades

BuiltInSkills coordinates provisioning within the transaction already owned by Workspace, Skills,
Agent or Diagrams. It keeps the existing actor provisioning lock, locks active projects in stable ID
order, then locks each built-in note and its skill metadata before inspecting their current state.
This shares the project
ordering used by placement and empty trash. An Inbox archived while provisioning waits is excluded
before selecting or creating the replacement Inbox.

Repair supplies a resolved NoteBuiltInRepairWrite. Persistence changes only placement, kind, archive
state and its supplied update timestamp. The old general note update did not write projectId, so a
built-in in an archived Inbox could not move to the replacement Inbox in PostgreSQL. The new write
persists that move. It clears unavailable or cross-project parents and resolves the new root position
under the project lock. Authored content, identity, publication, pins and skill settings survive.

Stock upgrades inspect the locked current note and use the existing revision-guarded content write.
An edit that commits while provisioning waits is therefore considered before the stock-version
decision. The stock comparison now also requires the stored document to match the released document;
plain text alone missed formatting-only edits. Deep comparison ignores object-key order from JSONB.
Any changed document shape is preserved rather than treated as an untouched release. A failed
conditional write aborts provisioning. Existing immutable upgrade revisions remain.

## Test dispositions

Two unit regressions failed before the fix: repair retained an old folder when moving projects, and
restoration retained an archived parent. Keep the existing stock-version, published-but-unedited,
renamed, edited, disabled and idempotent provisioning cases.
A third regression reproduced an overwritten formatting-only edit and now preserves its document.
Repair legacy stock fixtures so their document, plain text and initial revision describe the same
released content; the previous-version fixture mixed a current document with retired plain text.

Add PostgreSQL coverage through Skills.list for replacing an archived Inbox while preserving the
built-in identities and edited/published content, a document edit or disable committing while a stock
upgrade waits, and a successful untouched-stock upgrade after JSONB storage. Keep concurrent first provisioning
and first browser synchronization contracts.

This continues W02.02 and built-in placement left open by the tree and deletion slices. The general
NoteRepository.update method now has no production caller; retiring its storage-test setup uses is a
separate cleanup. Broader skill metadata writes and the remaining declaration/workflow assessment
still need review. No migration or public command change is required.
