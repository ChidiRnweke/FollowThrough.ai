# Archived project context in retained records

ADR 0009 defines project archive as a visibility boundary. Built-in skill recovery can move a skill
out of an archived Inbox into a new active Inbox. Relationships created while both notes belonged to
the original Inbox remain stored. This is a valid route to an active note whose related note belongs
to an archived project; ordinary relationship creation still requires the same project.

The server note read uses RelationshipGraph.readContexts. NoteRecords hides notes in archived
projects, so the retained relationship previously made the whole active note read fail. Omit contexts
whose endpoints are unavailable, while propagating repository failures. The browser projection has
both raw note records and must check their projects before assembling a backlink. Neither read path
deletes the relationship or changes either note's lifecycle.

Pending suggestions have a similar distinction between storage and visibility. SuggestionRecords.list
already excludes archived origin projects and archived project payloads. Cached projections did not:
a profile-memory proposal derived from an archived note remained visible and contributed to shell
and Today attention counts. Use the same known-archive checks for pending suggestion projections,
including note widgets and memory notifications. Profile memory without an archived origin remains
independent of project visibility. Missing project metadata keeps the existing partial-cache behavior.

## Evidence and test disposition

The focused regression cases reproduce unavailable relationship endpoints, a relocated built-in's
cached backlink, and archived-origin or archived-payload suggestion counts. Positive cases retain
active contexts and suggestions. Separate assertions retain the raw relationship and proposal records.
The SQL contract creates a real built-in, creates a same-project relationship, archives the Inbox,
runs built-in recovery, and reads the retained relationship through the production repositories.

Seeded browser captures render the actual NotePane and MemoryEntryList with WorkspaceResources and
an in-memory offline cache. The note capture shows the archived backlink before and its absence after.
The profile-memory capture shows the archived-origin proposal before and its absence after. The partial offline cache still reports that memory is downloading;
this capture does not establish that the full profile inventory is empty.
These are component checks with synthetic data, not authenticated end-to-end database checks.
Temporary fixture modules are restored before validation and commit.

W03.03 remains open until the remaining child read/write paths receive a complete caller review.
