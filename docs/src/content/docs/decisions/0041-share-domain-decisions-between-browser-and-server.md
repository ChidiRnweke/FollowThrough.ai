---
title: 'ADR 0041: Use the same rules for offline edits and server writes'
description: Prevent browser and server implementations from making different decisions about the same edit.
---

## Status

Accepted. Revised on 2026-09-19.

The first version placed each shared rule in a model as a pure function. The revision moves shared
rules into shared services. Models now hold only values, types, schemas and constructors. The
guarantees of this decision are unchanged.

## Context

The application lets users edit downloaded notes, tasks and projects while offline. The browser
shows each edit immediately and saves a command to a durable queue. When a connection is available,
the server checks the command against the current saved records and applies it. Agents and external
clients can also change those records through the server.

Before this decision, the browser and server implemented some of the same rules separately. For example,
restoring a note whose parent folder is unavailable requires a decision about where the note goes.
If the two implementations differ, the browser can show a result that the server will never save.
A change to one implementation also leaves the other paths with the old behavior.

Shared rules cannot make the browser's cached records authoritative. A folder missing from a partial
download might still exist on the server. The server must check current data even when the browser
has already shown the edit.

## Decision

We chose to implement each shared domain rule once, in a shared service under
`src/lib/services/<domain>/`. The browser and server call the same service with the facts they have
resolved. The rule returns the proposed change. It does not read storage, write records or call
another feature. The server resolves authoritative facts and computes the change again before
saving it.

Models do not hold these rules. A model holds values, types, Zod schemas and constructors only. It
has no business functions, procedural readers, runtime state or workflow classes. A rule in a model
couples every consumer of a type to that rule. It also hides which layer owns the decision. Rules
that only the server applies live in `src/lib/server/services/<domain>/`.

Each rule takes only the facts needed for its decision. Placement rules, for example, need
entry identities, parents and sibling order; they do not need document bodies. When a decision
requires a complete inventory, the caller must establish completeness. An incomplete offline cache
cannot stand in for an empty collection.

Server services perform storage work around these rules. Controllers continue to coordinate consequences
across features and own their transactions, as described in ADR 0007. The durable queue and conflict
review retain the synchronization contract in ADR 0040.

This decision covers rules whose meaning is the same in both paths. It does not require shared code
for different behavior, such as PDF and DOCX layout, or make server-only actions available offline.

## Consequences

- The same command and resolved facts produce the same domain decision in the browser and server.
- A rule change has one implementation to update and test.
- Callers must provide explicit facts and establish whether required collections are complete.
- Some offline actions must wait for missing facts. The browser retains the user's draft.
- Shared rules reduce duplicated decisions but do not remove conflict checks or server validation.
- The owner of a rule is visible from its import. A consumer that needs only a type does not
  depend on a rule.

## Evidence

- `src/lib/services/memory/edits.ts` defines memory creation and edit rules. The Memory controller
  and browser command preparation both use them.
- `src/lib/services/notes/creation.ts` validates new notes and folders. The Notes, Projects and
  Skills controllers and browser command preparation all use it.
- `src/lib/controllers/workspace/commands.ts` prepares optimistic commands from cached records.
- `src/lib/server/services/notes/catalog.ts` checks current records for note lifecycle operations.
- ADR 0040 defines the durable command queue and review of conflicting edits.
