# Memory after project archival

ADR 0009 hides a project's content when its project is archived, while retaining the stored
records. Memory creation and list reads already checked the active project. Existing-entry reads,
edits and removals did not. A pending memory update or removal could therefore change retained
project memory after archival through Suggestions.accept and MemoryLibrary.apply.

MemoryLibrary now checks the resolved entry's project in get, getForEdit and update. Direct
deletion uses get through getActive. Proposed updates and removals use getForEdit. All those
paths share the existing actor-scoped active-project lookup and fail before persistence when
the project is unavailable. Profile memory has no project and remains usable.

The raw repository still reads retained records for history, effect recovery and storage
contracts. No record is deleted by archival. No public shape, migration or trust policy changes.

## Evidence and test disposition

The new project-lifecycle service spec creates valid memory while the project is active, archives
that project, then exercises reads, direct writes and pending changes. Six regressions failed
before the fix. Three controls passed: raw storage retains the entry, profile memory remains
editable and an active project permits edits. All nine pass after the fix. Existing memory scope,
provenance, proposal rollback and controller lifecycle tests are retained; the focused run passed
10 files and 79 tests.

Four PostgreSQL contracts cover application reads, pending updates, pending removals and direct
deletion while confirming that the stored entry survives. Local Docker is unavailable; these
contracts require CI. These cases cover an already archived project, not concurrent archive/write
serialization. Browser memory projections and note-less proposal listing need separate review.

This closes the demonstrated active-project guard gap in W10.11 and W11.03–W11.05. It does not
alone complete those workflow assessments or the remaining memory declaration review.
