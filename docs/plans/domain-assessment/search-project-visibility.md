# Archived project knowledge search

ADR 0009 hides a project and its content while retaining the stored child records. Project archival
changes only the project row. KnowledgeIndexRecords searched retained chunks by actor and optional
project ID without checking that the project was active. Both keyword and vector searches could
therefore return archived notes and project memories, including through agent knowledge retrieval.

Both search queries now require an active project owned by the actor. The predicate runs in SQL
before ranking and the existing result limit. It applies to scoped and unscoped searches. Storage
and maintenance reads still retain archived chunks; this does not turn archival into deletion or
change embedding policy.

Add PostgreSQL contracts that index two projects for one actor, including note and memory chunks,
then archive one project. Both search modes must return only the active project's note. Explicitly
scoping either search to the archived project must return no matches. A storage control confirms
that the archived memory chunk still exists. Keep existing ownership, vector scope, deferred index
and attachment-tail contracts. Local Docker is unavailable; these SQL contracts require CI.

This closes an active-project boundary gap shared by W03.03, W11.08 and knowledge-search workflows.
It does not finish the search family assessment or change the lifecycle of individual child records.
