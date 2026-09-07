---
title: 'ADR 0037: Parse external data at the boundary and keep resolved types total'
description: Why weakly typed values may not cross into models, services, and controllers.
---

## Status

Accepted.

## Context

External data enters the application in weak shapes: request bodies, database JSON columns,
provider stream items, tool-call arguments, and browser storage. This data was carried inward as
`unknown` and `Record<string, unknown>`, and each consumer narrowed it again for itself.

This had three confirmed costs. Every consumer added its own probes, so the code grew without
adding behavior. Two consumers of the same value narrowed it differently, so the shapes drifted
apart: the codebase grew two `isRecord` guards with the same name and different behavior. And a
wrong guess about a shape compiled clean and failed at runtime: a required `conversationId` was
fed an optional one and failed against the database on every new chat's first message.

The audit found that most weak types traced to two untyped producers: the ProseMirror document
node type, and the agent run context. Fixing consumers one by one does not stop such a producer.

Humans and agents both change this code. ADR 0001 requires important rules to have deterministic
checks. A deterministic check must not produce false positives, so only a pattern that is always
wrong can become a mechanical rule.

## Decision

We chose to parse external data into narrow types at the boundary where it enters, and to keep
resolved types total inside the boundary. A type is total when every value it admits is a value
the code can act on.

Parsing happens only in named parse zones:

- the remote functions (`src/lib/remote/`), for request data;
- the database mappers and repository read paths, for stored rows and JSON columns;
- model-local parser functions, for schemas that several zones share;
- co-located external-provider adapters and event mappers, for provider responses and LLM stream
  items;
- the client event and storage readers, for server events and persisted browser state.

A schema lives next to the type it produces in `src/lib/models/`, as pure logic with no I/O. A
service or controller never parses: it receives narrow values from the remote functions above it
and from repositories or provider adapters below it.

Strictness is a per-boundary choice, and it follows who owns the producer and who can act on a
failure. A list read returns an explicit fallback arm for a row that fails to parse, because no
consumer can act on one bad row among many. A single-row read or a write fails, because the caller
can act. A boundary whose producer is a third party we do not pin, such as a provider SDK, keeps a
fallback arm, because a closed union would turn any upgrade that adds a shape into a data
incident. A fallback arm is a named union member that no reader can mistake for parsed data. It is
never a silent passthrough or a weaker result under ADR 0015.

A schema is tested against real producer output and real stored rows. A schema and its fixtures
written from one mental model agree with each other and with nothing else.

The source audit enforces the patterns that are always wrong, with zero false positives: weak
`Record` value types, `unknown` type positions in models, services, and controllers, boolean
record guards, casts to inline object types, casts on `JSON.parse` results, and non-narrowing
schema calls. These checks are staged: each rule lands only when its current-worktree baseline
reaches zero. The `audit-allow` comment with a reason remains the escape hatch for
framework-forced cases. Rules that need judgment stay in `AGENTS.md` and the pattern catalog in
`docs/architecture/type-narrowing.md`.

This decision does not govern genuine key-to-value maps with concrete value types, `instanceof`
checks on error or DOM classes outside models, or optional fields in request-shaped types where
the caller genuinely may omit a value. Model-layer `instanceof` is prohibited by a blanket
guardrail; unavoidable Error or framework checks need a reasoned allowance.

We will keep this decision while external data enters in weak shapes and its producers can change
without changing this repository. We will revisit a specific boundary only when parsing there
costs more than the failures it prevents, and we will record that boundary as a reasoned
allowance rather than weakening the rule.

## Consequences

- A wrong assumption about external data fails at the boundary with a reported error, under ADR
  0015, instead of producing a wrong value deep in a service.
- Consumers of a parsed value share one type, and duplicate narrowing code is deleted.
- Each new external shape needs a schema at its boundary. We accept this duplication, as in ADR 0034.
- The schema is a new artifact that can be wrong. A schema stricter than its producer rejects
  valid data, and a list read maps every row, so one mismatch can take a whole page down. This
  happened on `/today`; see Evidence.
- Operations that read weak stored data can now fail loudly where they previously guessed.
- Parsing every stored row adds runtime cost to list reads. We have not measured this cost.
- Some SDK typings force a weak generic type. These carry an `audit-allow` comment with a reason
  until they can be narrowed.

## Evidence

- `src/lib/models/notes/index.ts` declared document content as `Record<string, unknown>[]`, the
  first untyped producer. `src/lib/server/services/agent/runs/contracts.ts` returned the agent
  run context as `Readonly<Record<string, unknown>>`, the second.
- `parseSuggestionPayload`, `parseRunAgentInput`, and `readToolFailure` in `src/lib/models/` show
  the schema-in-models pattern in use.
- `PersistedSessionItem` (`src/lib/models/agent/session-item.ts`) shows the third-party fallback
  arm: its `unrecognised` member keeps rows written by a newer SDK readable and lossless.
- `StoredSuggestion` shows the list-read fallback arm: the inbox drops unreadable rows and warns
  with their ids, while single-row reads and writes stay strict.
- `tests/corpus/` and `editor-schema-conformance.spec.ts` test the note document schema against
  rows captured from a real database and against the real editor extension list. They were added
  after a schema written from hand-made fixtures rejected 13 of 33 stored notes and took `/today`
  down.
- `scripts/audit-source-rules.ts` enforces the mechanical subset with zero-baseline rules.
  `docs/architecture/type-narrowing.md` holds the pattern catalog and the execution board for the staged rules.
- Known violation: `src/lib/server/db/mappers.ts` still casts whole rows through
  `const domain = <T>(v: unknown): T => v as T`. It and the remaining findings are inventoried in
  `artifacts/type-narrowing-audit.md` and staged under the execution board in `docs/architecture/type-narrowing.md`.
- ADR 0001 requires deterministic enforcement. ADR 0007 governs model and boundary placement.
  ADR 0015 governs how parse failures surface. ADR 0034 governs distinct types per execution
  state.
