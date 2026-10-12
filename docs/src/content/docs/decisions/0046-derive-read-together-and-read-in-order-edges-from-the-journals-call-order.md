---
title: "ADR 0046: Derive read-together and read-in-order edges from the journal's call order"
description: Draw which project items the agent reads in the same chats, and in which order, from the journalled tool calls, beside the links the user wrote.
---

## Status

Accepted. Extends ADR 0045.

## Context

ADR 0045 derives what the agent read in a project from the conversation journal. A project page
now also shows a map of connections. Each edge joins two items the agent read in the same chat.
The edge also tells which item the agent usually read first. Beside these edges, the map shows
the links the user wrote: note relationships, skills used in a note, and files attached to a
note. Where the two disagree, the user learns something. A link the agent never follows may be
stale. Two items the agent always reads together, with no link, may need one.

Order needs a total order of calls inside a chat. The journal stamps each `messages` row with
`created_at`, in milliseconds. Two calls can share a millisecond. Most tool rows also carry
`event_cursor`, which points at `agent_run_events.cursor`. That column is one identity sequence
for every run.

## Decision

- The repository orders tool rows by `created_at`, then by `event_cursor` with nulls last, then
  by message id. The cursor breaks ties inside one millisecond, because the sequence increases
  across all runs. The id only makes the order stable for rows without a cursor; it does not say
  which row came first.
- Each call gets an ordinal: the position of its first row in that order. Every item one call
  read carries the same ordinal.
- In each chat, an item's place is the ordinal of the first call that read it. For a pair, the
  chat counts toward the item with the smaller ordinal. When one call read both items first, the
  pair has no direction in that chat. A search returns its hits together, and the rank of a hit
  is the search engine's order, not the agent's.
- Memory is left out of nodes and edges. Project memory loads into every chat, so an edge to it
  says only that a chat happened. The result counts the distinct memory entries read, so the
  page can say what it left out.
- One read-only projection repository reads the authored links from all three sources. Each
  source already has a domain repository that writes it. The map needs one read-side view, with
  both endpoints as whole items, so it can draw an endpoint that the agent never read. Three new
  domain methods would add read paths to three domains for one consumer, and each would return a
  different shape for the service to join. The projection follows ADR 0045: it reads what other
  writers store and writes nothing.
- The rules that read the map — mismatches, ambient items, and the default edge threshold — are
  a shared service with no I/O (ADR 0041). The controller adds their results to the response.

## Consequences

- History that existed before this change has an order, with no backfill. Rows with no cursor and
  the same millisecond keep a stable order that can be wrong. The agent harness writes a cursor
  with each tool row it journals while a run streams. A row with no cursor is older than that
  practice, or is a call abandoned with no result, which does not count as a read.
- A same-call pair adds to the shared-chat count but to neither direction count. The two
  direction counts can therefore sum to less than the shared-chat count.
- An item read in most chats, such as a project brief, joins every other item. The shared rules
  mark such items as ambient so the page can hide their edges.
- A change to one of the three link tables must keep the projection's contract test passing.
