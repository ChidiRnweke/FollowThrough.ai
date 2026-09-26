# Memory read and context review

## Scope and visibility

Memory has two scopes under ADR 0026. A missing project ID means profile memory, not all projects.
A project ID selects only that project's entries. The owner can read private entries; agent tools
and prepared run context include only shared entries. Deleted entries stay out of active lists.
ADR 0009 also requires an active project for project reads.

Memory.list coordinates the application read and its optional shared-only filter. MemoryLibrary
checks the selected project. MemoryRecords filters actor, exact scope and deletion in SQL. Its raw
single-record and maintenance reads retain historical entries; they are not agent list endpoints.
No additional window or result cap is introduced.

The profile page and project memory surfaces use the account's WorkspaceResources projections.
WorkspaceViews.memories selects exact scope and excludes deleted entries. MemoryEntryList renders
saved records separately from pending proposals and sorts by update time. Profile loading retains
the first add action. Project surfaces wait for project context and hide unavailable or archived
projects. The panel gap was repaired in [PR #222](https://github.com/ChidiRnweke/FollowThrough.ai/pull/222).
The server lifecycle correction is [PR #221](https://github.com/ChidiRnweke/FollowThrough.ai/pull/221).

## Agent entry paths

list_user_memory and list_project_memory invoke Memory.list with sharedOnly fixed to true. Their
public input cannot opt into private entries. The result projection contains identity, content,
creation time and project identity only when the entry has one. Both tools use the authenticated
actor. An archived project fails its lookup rather than being interpreted as an empty profile.

Agent.buildContext and Diagrams.buildDiagramContext load profile memory with an empty scope filter.
AgentContext.build filters shared entries and copies only their content into userMemory. Project
memory is absent from standing context and is retrieved explicitly. An empty shared profile omits
userMemory. Lookup failures propagate; there is no successful-empty fallback. The prepared context
is a run snapshot; this review does not promise retroactive removal from historical runs or messages.

Knowledge retrieval follows Retrieval, KnowledgeLookup and KnowledgeIndexRecords. Shared project
memory is indexed; private, deleted and profile entries are excluded, and unsharing removes existing
chunks. Keyword and vector queries now check active project ownership before ranking and limits.
[PR #225](https://github.com/ChidiRnweke/FollowThrough.ai/pull/225) adds that archive boundary with
five passing PostgreSQL contracts for scoped/unscoped reads and retained storage. Delayed embedding
completion updates existing chunk identities and cannot recreate chunks removed by unsharing.

## Test disposition

Keep MemoryLibrary's profile/project separation, deleted-list and project lifecycle tests. Keep
PostgreSQL repository ownership, scope and retained-record contracts. Keep the browser profile-loading test and the
archived-project surface regressions. Keep agent-context tests for shared profile inclusion, private
profile exclusion and project-memory omission. Keep indexing tests that exclude profile/private
entries and remove chunks on deletion or unsharing.

Add three real tool/controller/service composition tests with existing in-memory repositories:
profile and project tools each exclude private, deleted and out-of-scope entries; the project tool
rejects archival. These verify returned records, not calls or parameter forwarding.

W11.01, W11.02, W11.07 and W11.08 are assessed. W11.03–W11.06 and W11.09 retain their separate
mutation, proposal and provenance review requirements. Focused checks passed four files and 55
tests; the full local unit suite passed 448 files and 4,181 tests. Lint, type checking, architecture
and docs checks passed.

## Remaining policy discrepancy

ADR 0026 permits private memory in either scope, and the server honors this. The profile UI hides
the sharing toggle, while the published user guide explicitly describes that omission. This review
preserves the current UI and private-entry filtering. Resolve that interface policy before calling
the direct-edit workflow fully reviewed; the read workflow does not settle it.
