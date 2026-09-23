# Active Inbox lifecycle

## Entry paths and decision

W02.02 provisioning runs in the transactions owned by Workspace, Skills, Agent and Diagrams.
W03.03 reaches Projects.archive, which archives the project record without archiving its children
(ADR 0009). The Inbox can be archived through the existing project command. Provisioning searches
only active projects and creates an Inbox when none exists.

The old unique index included archived Inboxes, so that creation failed even though no active Inbox
existed. The implementation now permits one active Inbox per actor. Archived projects stay archived;
ordinary notes keep their project and lifecycle state. Existing built-in repair moves those special
notes to the replacement Inbox with their identities, authored content and settings intact.

The optional lifecycle question received no answer before implementation. This uses the stated
recommended default: allow archive and provision a new active Inbox. It does not claim an explicit
user choice. No public command or archive gesture changes.

## Owners and persistence

The schema's projects_user_inbox_unique predicate now requires role=inbox and archived_at IS NULL.
Migration 0058 replaces that index. The former constraint is stricter, so existing rows need no data
rewrite. The generated snapshot differs only in that predicate and snapshot identity. Keep the
separate active, case-insensitive project-name constraint.

BuiltInSkills retains the actor provisioning lock and stable project locks. It chooses the existing
active Inbox by role, preserving a renamed Inbox. When it must create one, it chooses Inbox or the
first available numbered name from the complete active inventory. An ordinary project named Inbox
keeps its name and role. No lookup failure is converted to an empty inventory. A new conflicting
project name created after the inventory read still fails the storage uniqueness check; the next
request reads the new inventory. General project create/rename concurrency is a separate review.

The fake enforces the same one-active-Inbox constraint. It already excludes archived projects when
checking name uniqueness and locating an Inbox.

## Test dispositions

Keep simultaneous first provisioning, first browser synchronization and provisioning rollback tests.
Add local cases for replacement with stable built-in identities and occupied Inbox names. The name
collision case failed before the fix with CONFLICT and now provisions Inbox (3), preserving the two
ordinary projects.

PostgreSQL contracts cover two simultaneous replacement requests, archived-project and ordinary-note
retention, unchanged built-in identities, occupied-name replacement, second-active-Inbox rejection
and separate actor Inboxes. They exercise migrated storage and real provisioning transactions.
The existing archived legacy-project contract still checks edited/published built-in preservation.

This resolves the Inbox lifecycle gap recorded in built-in repair. Other project workflows and the
complete per-declaration assessment remain open; passing this migration is not global completion.
