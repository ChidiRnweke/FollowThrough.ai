# Built-in skill provisioning and user-preserving upgrades

W12.01 and W12.02 follow the active and retired definition registry through BuiltInSkills into the
owned project, note, revision and skill records. The registry keeps released bodies because an upgrade
must recognize what the user actually received. Version absence represents an early release; surface
bindings are independent metadata. A matching display name alone never claims a custom note.

Workspace's initial synchronization and shell preparation, Skills.list, Agent context preparation and
Diagram generation each call ensure inside a controller-owned transaction. Provisioning holds the actor
catalog lock, then active project locks in stable order. It selects the Inbox by role, creates it if
needed, and locks each built-in note before its metadata. Stable built-in keys retain identity through
renames and repairs. Missing metadata is reconstructed; archived or invalid placement is repaired
without overwriting authored content, publication, pins or enabled state. The initial note revision
is written with installation. Failures roll back the transaction.

## Upgrade boundary

An existing guide upgrades only when its title, plain text, document, slug, description, trigger hints,
implicit-invocation setting and metadata match a released definition. Document comparison ignores JSONB
object-key ordering and still preserves formatting edits. A user edit to either content or metadata
prevents automatic replacement. Publication and revision count alone do not prove an edit; publishing
untouched instructions does not freeze the old release. Disabled state is preserved independently and
does not prevent a safe content upgrade.

An upgrade uses a conditional note-revision write, appends an immutable revision and updates only the
released skill metadata. The existing note identity, publication and enabled choice survive. Repeated
provisioning does not add duplicate revisions or skills. Conditional-write failure aborts the operation.
This retains the immutable-history approach documented in ADR 0011; explicit user restoration remains
its own workflow.

## Returned and displayed results

Skills.list reads summaries after provisioning. Initial browser synchronization includes the created
Inbox, skill notes and metadata in the account-scoped records used by the catalog. Agent preparation
reads enabled skills after ensure. Diagram generation loads its named built-in and reports a disabled
guide instead of silently substituting instructions. The broader surface-name resolution and lazy
loading review remains W12.15; provisioning does not establish every execution-path guarantee.

## Test disposition

Keep current first-install, repeated-install, renamed/custom-note, published/edited, formatting-only,
disabled and immutable-history cases. Keep SQL coverage for concurrent initial provisioning, initial
browser synchronization, Inbox replacement, legacy-project repair, an edit or disable that commits
while an upgrade waits, and untouched-stock upgrades after JSONB storage. These are distinct storage
and concurrency contracts; the pure definition text checks are not evidence of execution behavior.

Add real controller/library/provisioner cases that install a released guide, edit it through Skills.update,
then trigger provisioning through Skills.list. Description and trigger-hint edits retain the released
body and revision. A disable preserves false while untouched content upgrades. Add the two metadata-edit
cases against PostgreSQL as well. These fixtures are produced through the same write operations rather
than by pairing current documents with retired plain text. The focused unit suite passed 22 tests.

W12.01 and W12.02 are assessed. This completes the workflow trace around the earlier
[built-in note repair](built-in-note-writes.md) and [project selection](project-selection.md) work.
No production behavior, released instructions or UI controls change. Metadata editing, explicit version
restoration, surface discovery and execution retain their separate workflow assessments. Local SQL
execution is unavailable; CI runs the database contracts.
