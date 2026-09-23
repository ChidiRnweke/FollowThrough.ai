# Diagram trash ownership

## Entry paths and guarantees

DiagramStudio owns archive, restore and permanent deletion for project diagrams, including their
synchronized workspace commands. Offline command preparation calls the same shared trash rule.
Public command and response shapes are unchanged. These paths cover W13.19, W13.20 and W13.22
within P17. Draft saves, publication and revision restoration retain their separate review.

The gallery, project overview and global trash page call changeDiagramTrash. It captures the visible
resource, stages an archive/restore/delete command, reports staging failure and rethrows it. The
workspace mutation remote validates the request and account, then dispatches to DiagramStudio.
WorkspaceViews.trashedDiagrams supplies the cached trash projection. The server trash listing remains
actor scoped and optionally project scoped. Agent tool coverage excludes these methods because they
are user gestures. Reference-count confirmation and embedded diagram removal are distinct workflows.

Each server transition runs in the controller transaction. DiagramLibrary reads the actor-owned
row with a row lock; the controller applies the shared decision to that authoritative value.
Repeated archive and restore requests remain invalid. Permanent deletion requires a trashed row;
the repository also retains its conditional deletion guard. Deleted and foreign-owned diagrams
remain inaccessible. Existing project visibility policy is preserved.

Archive and restore persist resolved archive and update timestamps, then update the search index
before returning the persisted diagram. Offline commands and server commands now agree on updatedAt;
the previous server repository changed only archivedAt. Targeted persistence preserves source,
publication and revision fields. Restoration clears archivedAt. Index failures roll back the write.
Permanent deletion leaves saved note references intact, so those notes show the diagram as unavailable.

## Ownership and tests

Remove DiagramArchiver and DiagramDeleter workflow interfaces and the corresponding Library methods.
The actual Library capability now exposes a locked read, resolved persistence and conditional delete.
Models retain diagram values; the shared diagram trash service owns the transition rule. Factories
and controller dependency bundles name the actual service capability. No migration is required.

Move the old archive listing and visibility cases into the controller trash suite. Retain their
project count, note listing and conversation visibility assertions. The archive assertion now checks
the complete retained diagram and both timestamps. Two library deletion cases move to this same
owner. Repeated-transition cases replace their old equivalents; new cases cover offline archive and
restore parity, deleted identity and actor isolation. Existing controller indexing rollback cases
use the shared transaction fake and now supply the controller clock explicitly.

The PostgreSQL trash contract holds a concurrent archive transaction while another archive waits.
The waiting call must read the committed trash state and reject it. A locking-read contract checks
actor isolation. Existing repository contracts retain restore-before-delete protection and saved
note references; synchronized mutation contracts retain indexing rollback and receipt behavior.
Observed local and CI results are recorded in the dependent PR and continuation register.

Local validation passed 23 focused files and 187 tests, then all 413 unit files and 3,910 tests.
Lint, type checks, architecture audits and documentation checks passed; docs report one existing hint.
PostgreSQL contract results are pending CI because the local Docker socket remains unresponsive.
