# Project rename and retained description

The project tree and rename_project tool send a project ID and a name. The local outbox command
has the same shape. None of those callers asks to change the description. Both the browser projection
and server controller nevertheless normalized an absent description as a cleared value. PostgreSQL
then wrote null, so a name-only rename lost saved project context.

PR #140 intentionally fixed explicit description clearing. That guarantee remains: a supplied blank
description clears storage. The correction distinguishes an omitted field from an explicit clear.
A prepared ProjectRename carries a normalized name and an optional description change: omission
preserves storage, null clears it, and a string replaces it. Creation still uses complete ProjectDetails.
The public request and tool schemas do not change.

The server prepares this change after shared detail normalization. ProjectCatalog checks active
ownership, then the repository updates only requested columns. It does not copy a previously read
description back into storage. The browser's name-only projection preserves the rest of the project,
including its description and inbox role. The two existing project fakes follow those same effects.
No component layout or visible control changes; the lost field is retained data used in project context.

## Evidence and test disposition

Two regressions failed before the fix: the local rename projection and the real server controller/
catalog composition each lost the description. Explicit clearing and replacement controls passed
before and remain required. Keep the original description-clearing SQL contract and extend it with
omission and replacement cases. Keep name trimming, blank-name refusal, active ownership, uniqueness,
archive and inbox-role tests. Do not add a test merely for the new prepared-change type.

W03.02 is assessed through the project tree action, outbox preparation and guarded command, server
controller, agent tool, prepared change, repository and returned project. Save errors retain the
existing explicit command failure behavior. Other project workflows, drag gestures and tree-placement
reviews remain separate.
