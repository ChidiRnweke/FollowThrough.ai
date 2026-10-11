---
title: 'ADR 0045: Derive agent context usage from the conversation journal'
description: Read which notes, files, memory and skills the agent used from the tool calls already stored, instead of recording usage a second time.
---

## Status

Accepted.

## Context

A project page shows what the agent drew on in that project: the items it used most, the items it
never used, files it cannot read, and searches that found nothing. A user acts on this page. They
rename a file the agent never finds, add a note for a search that came back empty, or remove
memory that is out of date.

The agent reads project content only through tools (ADR 0004, ADR 0035). The conversation archive
already stores every tool call as a `messages` row with role `tool`. The row holds the call's
arguments and its result. A `search` result names the source of each hit with its kind, id and
project. A file read names a virtual path that contains the project id. `load_skill` names the
skill.

A second store was considered: a usage table written when a tool succeeds. It would answer the
same questions with simpler queries. It would also record each fact twice, add a second write on
every tool call, and need a backfill for history that the journal already holds.

## Decision

Usage is a read-side projection of the conversation journal. No new table and no new write path
exist for it.

- The `ToolContextLogRecords` repository reads the actor's journalled calls for the tools that read
  context: `search`, `search_note`, `grep`, `sed`, `get_note`, `load_skill` and
  `list_project_memory`. The archive writes a call twice: once with its arguments when the call
  starts, and once with its result when the call settles. The repository pairs the two rows by
  `callId`. Only succeeded calls count.
- Each item is attributed to the project that its own record names, not to the chat's project
  context. A search without a project scope is attributed correctly. A skill belongs to no
  project, so it counts in the project the chat was opened from.
- The repository parses each result with a schema in `models/context-usage` (ADR 0037). It counts
  a call whose stored shape it does not recognise, and the page shows that count. It does not drop
  the call without a trace (ADR 0015).
- The read has no time window or row cap, because no measurement has shown that it needs one.

## Consequences

- History that existed before this change appears on the page, with no backfill.
- The projection depends on the stored result shapes of seven tools. A change to one of those
  shapes shows up as unreadable calls on the page, and the repository's contract test fails.
- The read scans all of the actor's context tool rows. The only index on `messages` is
  `(conversation_id, created_at)`. Add an index, or reconsider a recorded table, when a
  measurement shows that the read is slow.
- Deleting a conversation removes its usage, because the journal is the only record.
