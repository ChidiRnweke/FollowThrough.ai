# Project selection and initial provisioning review

## Destination ownership

W03.10 starts with the caller that knows where new work belongs. Project-tree actions pass the selected
project and folder into creation. Today quick capture, the workspace strip and the global Skills
catalog deliberately choose the active Inbox by its stored role. Task quick entry uses its supplied
project or that same Inbox role. Renaming the Inbox or creating an ordinary project named Inbox does
not change these destinations. Missing local Inbox data produces an explicit unavailable/error result;
no writer chooses the first project or invents a new one as a fallback.

Agent note, skill and standalone diagram creation use requireProject at the tool boundary. Their
schemas allow absence only so the adapter can explain which projects are available. The actual
controller inputs require an explicit project. An ambient run project or a single available Inbox
does not silently choose for those tools. Task, folder, memory and other scoped creation commands
carry their explicit scope; content-derived work inherits the validated source's project. Profile
memory deliberately has no project under ADR 0026.

Controllers and repositories still validate actor, active project and parent agreement. The shared
note-creation decision receives the resolved project and validates that a requested parent is an active
folder in that project. Browser command preparation requires known project/parent records and complete
inventory where sibling placement needs it. Choosing a project does not bypass these checks.

## Initial provisioning

W02.02 follows Workspace's first change-page pull and shell context, Skills listing, Agent preparation
and Diagram generation into BuiltInSkills.ensure. Each caller owns a transaction around provisioning.
The service locks the actor's skill catalog and active projects in stable identity order, then chooses
or creates the Inbox by role from that inventory. The partial unique index permits only one active
Inbox per actor. An occupied display name causes a numbered name, not a role change on an ordinary
project. Archiving the old Inbox permits provisioning a new one; ordinary children remain attached to
the archived project.

Each active built-in definition has a stable key. Provisioning locks its note, creates missing note/
skill/revision records, and repairs archived or invalid placement while retaining identity and authored
content. Moving a built-in out of an archived project uses the replacement Inbox. Existing metadata,
enabled state and content remain protected by the released-version comparison and guarded writes.
The detailed upgrade semantics remain in the skill-family review; initialization is not a blanket
completion of that family.

The resulting records reach the browser through complete synchronization pages and the account-scoped
projection. A cached shell requires an Inbox and known preferences before startup is complete. A failed
provisioning operation rolls back instead of returning a successful shell with invented defaults.
This review does not promise that archiving an Inbox in an already-running browser immediately runs
provisioning; that archive/startup transition remains part of the wider lifecycle review.

## Obsolete paths and test disposition

Source and test searches found no production callers of ProjectRepository.findFirstActive or
findInbox. Provisioning already reads and locks the full active inventory; browser callers select
from that same kind of inventory. Remove both unused repository methods and their fake implementations.
Existing provisioning tests now observe the retained listActive capability. They keep their original
ownership, role, retained-record and built-in identity assertions.

Keep the initial/concurrent provisioning and transaction-rollback contracts, archived-Inbox replacement,
occupied-name, separate-actor and active-Inbox uniqueness cases. Keep note/folder creation ownership,
placement and partial-inventory tests. Add six real agent-tool/project-controller cases: note, skill and
diagram creation each report an empty inventory or require an explicit choice even when a renamed Inbox
and ambient run project exist. These verify the failure returned to the caller, without a model call.
The focused provisioning/workspace/tool suite passed ten files and 40 tests.

W02.02 and W03.10 are assessed. The retained choice is explicit caller-owned project selection and
transactional provisioning. Broader project archival, drag/drop, built-in upgrades and account startup
retain their own workflow reviews.
