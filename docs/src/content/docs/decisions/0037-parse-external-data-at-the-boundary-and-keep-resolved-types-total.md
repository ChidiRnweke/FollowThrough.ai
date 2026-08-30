---
title: 'ADR 0037: Parse external data at the boundary and keep resolved types total'
description: Why weakly typed values may not cross into models, services, and controllers.
---

# ADR 0037: Parse external data at the boundary and keep resolved types total

## Status

Accepted.

## Context

External data enters the application in weak shapes: request bodies, database JSON columns,
provider stream items, tool-call arguments, and browser storage. This data was being carried
inward as `unknown`, `Record<string, unknown>`, and hand-rolled boolean guards, and each consumer
narrowed it again for itself.

Carrying weak types inward has three confirmed costs. Every consumer adds its own probes and
defensive branches, so the code grows without adding behavior. Two consumers of the same value
narrow it differently, so the shapes drift apart — the codebase already had two `isRecord`
guards with the same name and different behavior. And a wrong guess about a shape compiles clean
and fails at runtime, where the user sees it.

The audit found that most weak types traced to two untyped producers: the ProseMirror document
node type, and the agent run context and tool-payload records. Fixing consumers one by one does
not stop such a producer.

Humans and agents both change this code. ADR 0001 requires important rules to have deterministic
checks. A deterministic check must not produce false positives, so only a pattern that is always
wrong can become a mechanical rule.

## Decision

We chose to parse external data into narrow types at the boundary where it enters, and to keep
resolved types total inside the boundary.

Parsing happens only in named parse zones:

- the remote functions (`src/lib/remote/`), for request data;
- the database mappers and repository read paths, for stored rows and JSON columns;
- model-local parser functions, whose `unknown` parameter is the deliberate outer edge of a
  pure schema;
- co-located external-provider adapters and event mappers, for provider responses and LLM stream
  items;
- the client event and storage readers, for server events and persisted browser state.

A schema lives next to the type it produces in `src/lib/models/`, as pure logic with no I/O. A
parse zone calls the schema. A service or controller never parses: it receives narrow values from
the remote functions above it and from repositories or provider adapters below it. Model-local
parsers are the exception that makes schemas reusable; ordinary model logic does not parse.

A function's parameter types must not admit values the function cannot act on. A payment amount
cannot be a bare `number`, because a negative number is not a payable amount. The constraint
belongs in the type, not in a check three layers down.

Absence in a resolved type is a union arm or a distinct type per state, under ADR 0034. It is not
an optional field that other code must re-interpret.

The source audit will enforce the patterns that are always wrong, with zero false positives: weak
`Record` value types, `unknown` type positions in models, services, and controllers, boolean
record guards, casts to inline object types, casts on `JSON.parse` results, and non-narrowing
schema calls. These checks are staged: each rule lands only when its current-worktree baseline
reaches zero. Documentation never claims a staged rule is already enforced. The existing
`audit-allow` comment
with a reason remains the escape hatch for framework-forced cases. Rules that need judgment, such
as optionality pairing, stay in `AGENTS.md` and the pattern catalog in `TYPE_NARROWING.md`.

This decision does not govern genuine key-to-value maps with concrete value types, `instanceof`
checks on error or DOM classes outside models, or optional fields in request-shaped types where
the caller genuinely may omit a value. Model-layer `instanceof` is prohibited by a blanket
guardrail; unavoidable Error or framework checks need a reasoned allowance. It does not add a new
directory layer; the parse zones above already exist.

Triage fixed the following choices: persisted ProseMirror documents reject unknown nodes, marks,
attributes, and keys; agent run states and tool events use discriminated unions rather than `{}`
sentinels; tool contracts are keyed by one exhaustive registry; provenance and domain-error
details are closed unions; and the unused trust-policy conditions bag leaves the domain model
while its database column remains for a separately approved migration. Compatibility belongs in
repository mappers and is never a silent fallback.

## Consequences

- A wrong assumption about external data fails at the boundary with a reported error, under
  ADR 0015, instead of producing a wrong value deep in a service.
- Consumers of a parsed value share one type, and duplicate narrowing code is deleted.
- Each new external shape needs a schema at its boundary. This duplication near the boundary is
  accepted, as in ADR 0034.
- Operations that read weak stored data can now fail loudly where they previously guessed.
- Some SDK typings force a weak generic type. These carry an `audit-allow` comment with a reason
  until they can be narrowed.
- Double casts and casts directly from `response.json()` are treated like `JSON.parse` casts: use
  an honest `unknown` intermediate and parse it. A double cast is not validation.

## Evidence

- `src/lib/models/notes/index.ts` declared document content as `Record<string, unknown>[]`, the
  first untyped producer.
- `src/lib/server/services/agent/runs/contracts.ts` returned the agent run context as
  `Readonly<Record<string, unknown>>`, the second untyped producer.
- `parseSuggestionPayload`, `parseRunAgentInput`, and `readToolFailure` in `src/lib/models/` show
  the schema-in-models pattern already in use.
- `scripts/audit-source-rules.ts` enforces the mechanical subset with zero-baseline rules.
- ADR 0001 requires deterministic enforcement. ADR 0007 governs model and boundary placement.
  ADR 0015 governs how parse failures surface. ADR 0034 governs distinct types per execution
  state.
