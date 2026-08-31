# Type narrowing: weak-type patterns and their remedies

The catalog behind ADR 0037. Each entry is a pattern LLMs (and tired humans) emit, why it is
banned, and the remedy with an in-repo exemplar. Entries marked **[audit]** are enforced at zero
by `scripts/audit-source-rules.ts`; entries marked **[judgment]** are review rules — they cannot
be checked mechanically without false positives.

The one-line rule: **parse once at the boundary; inward of the parse zones, resolved types are
total.** Parse zones: `src/lib/remote/`, DB mappers and repository read paths, provider event
mappers, client event/storage readers. Schemas live in `src/lib/models/` next to the type they
produce.

## Execution board

### How agents use this board

1. Re-read this board before starting work and choose one unchecked block whose dependencies are
   checked.
2. Claim it by appending `— IN PROGRESS (<agent name>)` to the block title before editing its
   files. Do not edit files owned by another in-progress block.
3. Complete one indented checkbox at a time. Run its stated verification, then change `[ ]` to
   `[x]` immediately—do not wait until the whole block is finished.
4. When every subtask passes, check the block itself and remove the in-progress marker. Record a
   blocker beneath the relevant subtask rather than silently skipping it.
5. Preserve unrelated dirty-worktree changes. Never broadly stage, clean, or reformat files owned
   by another block.

### Phase 0 — Deterministic audit foundation

- [x] **TN-00: Refresh the worktree inventory and architecture decision**
  - [x] Freeze the fresh-worktree counts in `artifacts/type-narrowing-audit.md`.
  - [x] Correct ADR 0037, this catalog, and `AGENTS.md` for explicit parse zones and staged rules.
  - [x] Verify with `pnpm docs:check`.
- [x] **TN-01: Preserve Svelte source offsets**
  - [x] Analyze module and instance scripts independently in `scripts/audit-source.ts`.
  - [x] Add an extraction-offset regression spec.
  - [x] Verify with `pnpm test:architecture`.
- [x] **TN-02: Enforce the zero-baseline model `instanceof` guardrail**
  - [x] Add `no-instanceof-models`, reasoned allowances, and stale-allowance validation.
  - [x] Add reject, valid-layer, and line-offset specs.
  - [x] Verify with `pnpm test:architecture`.
- [x] **TN-03: Enforce response JSON parsing**
  - [x] Schema-parse every production `response.json()` result.
  - [x] Add `no-response-json-cast` with concrete-cast, honest-unknown, and allowance specs.
  - [x] Verify with `pnpm test:architecture`, `pnpm test:unit`, and `pnpm check`.
- [x] **TN-04: Eliminate non-narrowing Zod schemas**
  - [x] Replace the three production `z.unknown()` schemas with concrete schemas in
        `tool-recovery.ts`, `note-action-runs.svelte.ts`, and `feedback.remote.ts`.
  - [x] Add alias-aware `no-zod-unknown` detection plus reject, valid, allowance, and stale
        allowance specs in `scripts/audit-source-rules.spec.ts`.
  - [x] Prove the production baseline is zero and verify with `pnpm test:architecture`, focused
        unit specs, and `pnpm check`.

### Phase 1 — Canonical ProseMirror documents

> **TN-10 through TN-13 shipped a schema that had never met its producer, and it took `/today`
> down.** The union rejected `textAlign: null` — the Tiptap `TextAlign` default, and 659 of 663
> stored values — and the `id` / `data-toc-id` that `@tiptap/extension-table-of-contents` adds to
> every heading. 13 of 33 stored notes failed; `toNote` maps every row of a note list, so the page
> died whole. Saving was broken too, since `remote/notes` parses with the same schema.
>
> Every test that had validated it passed for structural reasons: `prosemirror.spec.ts` used
> hand-written literals with no `attrs` at all, `markdown.spec.ts` used `noteContentFromMarkdown`,
> which never instantiates a ProseMirror node and so never materializes an attribute default, and
> the Postgres contract spec used `{ type: 'doc', content: [] }`, which cannot enter the node
> union. The one spec that fed real editor JSON through the real parse — `note-editor.svelte.spec.ts`,
> which asserts `attrs: { textAlign: null }` — lived in `browser-full`, which the default gate did
> not run.
>
> Fixed in TN-14 below. The lesson generalises past ProseMirror: a schema and its fixtures written
> from one mental model agree with each other and with nothing else.

- [x] **TN-10: Define and parse the strict document union in `models/notes/index.ts`**
- [x] **TN-11: Propagate total documents through models, DB/remote boundaries, and note services**
- [x] **TN-12: Propagate total documents through editor/import/export, PDF, and DOCX paths**
- [x] **TN-13: Cover supported nodes/marks, recursion, strict keys, and invalid reads/imports**
- [x] **TN-14: Match the schema to its producer, and test boundaries against inputs their author
      did not write**
  - [x] Attributes are open, node and mark types stay closed. Tiptap adds global attributes to
        nodes it does not own, so a closed attribute set is a list of every extension ever
        configured. Known attributes are typed; the rest are preserved verbatim. The TS types name
        only what the code reads — an index signature would make `node.attrs.anything`
        type-check, which is the open-record indexing this effort removes.
  - [x] `textAlign` is `.nullish()` (the file's own convention for every other loose attribute),
        heading carries `id` / `data-toc-id`, and media `width` / `height` accept a number as well
        as a string — the corpus found that one, stored by the paste path.
  - [x] `ProseMirrorUnknownNode`: a fallback arm at _block_ granularity, and
        `readProseMirrorDocument`, a total reader the DB mappers use. An arm on `Note.document`
        would have handed every consumer a case it cannot act on; `pdf.ts` and `docx.ts` already
        had `default:` arms, so the blast radius was zero. Write boundaries keep the strict tree —
        `findProseMirrorDocumentIssue` still rejects an unmodelled block, and two existing specs
        held the line on that.
  - [x] `tests/corpus/` + `tests/unit/corpus.spec.ts`, captured by `pnpm corpus:capture` from a
        real database, asserting **zero fallback arms** rather than "does not throw" — resilience
        would otherwise absorb the next mistake in silence. `scripts/audit-topology.ts` requires
        every `parse*`/`read*` in `db/mappers.ts` to appear there; it immediately caught
        `parseSuggestionPayload`.
  - [x] `editor-schema-conformance.spec.ts` runs the real extension list under jsdom in the
        default gate and asserts the editor's own output satisfies the schema its save path uses.
        Both mechanisms were verified to fail against the original defect before being trusted.
  - [x] `note-editor.svelte.spec.ts` moved into `browser-focused`, so the spec that would have
        caught this now runs in the default gate. The Postgres contract fixtures use a real corpus
        document instead of an empty one.
  - [x] After a migration or a schema change, `pnpm corpus:capture && pnpm test:unit` re-reads
        every row of the connected database and parses it. Verify with `pnpm check`,
        `pnpm test:architecture`, `pnpm test:unit`, `pnpm test:contracts`,
        `pnpm test:browser:full`.
  - [x] The Edra schema is no longer a duplicate of the domain one. Product code was borrowing
        Edra's permissive protocol to convert its own domain document, so the two schemas for one
        shape could disagree — and did, one rejecting `textAlign: null` while the other accepted
        anything. `components/notes/editor-document.ts` now owns that conversion, where the domain
        type is in scope, and re-validates nothing: the document already came through `toNote`.
        Edra keeps its protocol for its own internal use, which the topology audit requires of a
        vendored editor that may not import `$lib/models/`. `editableProseMirrorDocument` runs on
        the way in, so a fallback block reaches the editor as a visible code block holding its own
        JSON rather than crashing it or vanishing on the next save.
  - [x] The suggestion list read is total, with the decision at the service. `StoredSuggestion` is
        a read-boundary union — `readable` or `unreadable` — so the domain `Suggestion` union
        stays closed over real product states; a sixth `kind` would have handed every consumer a
        case it cannot render, decide, or accept. `SuggestionRecords.list` returns it,
        `SuggestionInbox.listByStatus` drops the unreadable rows and warns with their ids, and
        `findById` / `insert` / `transition` stay strict because they are single-row or
        write-round-trips. This retires the last list-map read that could throw a page away.

### Phase 2 — Agent run and provider boundaries

- [x] **TN-20: Separate base, prepared, workflow, and unprepared run contexts**
- [x] **TN-21: Version workflow snapshots and map known legacy context shapes at repositories**
- [x] **TN-22: Reject malformed provider tool arguments and preserve call-ID precedence**
- [x] **TN-23: Own and parse the persisted session-item union**
  - [x] Define the local discriminated union and schema in `models/agent/session-item.ts`, exported
        through the domain barrel. Not `index.ts` as originally written: `agent-runs.ts` also needs
        the union for `AgentExecutionUpdate`, and a model file may not import a sibling — only the
        barrel may. A sibling file the barrel re-exports gives the same public surface without
        duplicating a six-arm union. `AgentExecutionUpdate` moved to `index.ts` for the same reason.
  - [x] Parse repository reads and map to SDK `AgentInputItem` only in the provider adapter, which
        is declared in place: `services/agent/conversations/buffer.ts` is the sole SDK-item import
        in the repository. `ConversationSession` was deleted — nothing constructed it, and keeping
        a second adapter meant either a shared module the layering forbids or a duplicated cast.
  - [x] Add round-trip, legacy, and malformed-row specs, plus `agent_session_items` contract
        coverage, which the integration suite had none of.
  - The arms are measured, not guessed: all 177 stored rows in the dev database parse into a real
    arm and round-trip deep-equal, with zero landing in `unrecognised`. Four item types occur
    (`message`, `function_call`, `function_call_result`, `reasoning`); every result `output` is a
    `{ type: 'text' }` part; `providerData` rides on assistant content parts and is preserved.
  - `unrecognised` is an arm rather than a thrown error, by decision: the rows were written by a
    provider SDK whose version this code does not pin, so a strictly closed union would turn any
    upgrade that adds an item type into a data incident. It is an arm rather than a silent
    passthrough so no reader can mistake it for something that parsed.
  - Retired here: both `row.item as AgentInputItem` double casts, the `callId`/`call_id` fallback
    in `replay-virtualizer.ts`, `rewind.ts`'s local `SessionItem` alias, `canvas-source.ts`'s
    stand-in schema and the comment explaining why it could not name the SDK type, the recursive
    `withoutInlineImages` walk with its `JSON.stringify(...).includes` guard, one
    `no-json-parse-cast` violation in `buffer.ts`, and the fake's `snapshot as AgentSessionItem[]`.
    Fifteen `Record<string, unknown>` occurrences in the strict layers go with them.
- [x] **TN-24: Normalize all provider stream events before reasoning logic**
  - [x] `ProviderStreamEvent` in `models/agent/index.ts`, parsed once by `parseProviderStreamEvent`
        at the top of the run loop. In the barrel rather than a sibling file because the right type
        for a call's arguments and output is `AgentPayload` from `./payload`, and only the barrel
        may import a sibling — a sibling would have needed a third hand-copy of the JSON type after
        `session-item.ts`'s `SessionJson`. `ignored` is an arm rather than `undefined`, for the
        reason `UnrecognisedSessionItem` is one.
  - [x] Retired from `reasoning.ts`: `RawToolItem` (nine `unknown` fields behind nine `z.json()`
        calls), `SerializedToolItem`, `ToolStreamEvent` (a `type: string` discriminant and
        `toJSON(): unknown`), `ReasoningStreamEvent`, `callDetails`, `objectArguments`,
        `reasoningDeltaFromChunk`, and `reasoningTextFromItem` — a cast-probe onto
        `Record<string, unknown>`, then `as unknown`, then an inline `'text' in part` guard. The
        `toJSON()` path went with them: `rawItem` is a declared property of every `RunItem`
        subclass and `toJSON()` returns that same `rawItem`, so the serialised fallback was reading
        one field twice, and reading it meant calling a method on a value nothing had parsed.
  - [x] `callId > call_id > id`, each a string or absent. `String(… ?? '')` is gone, and with it
        the two values it invented: `''` for an id the provider never sent, and `'[object Object]'`
        for one it sent as an object. The approval resume compares exactly this value to decide
        which parked call a user's decision applies to, so two id-less calls used to compare equal.
        `parkedCall` now raises `UNIDENTIFIED_TOOL_CALL` rather than matching anything.
  - [x] The sole-active fallback is a branch on `callId === undefined`, not on `''` being falsy.
        With none or several calls in flight the mapper emits `tool_completed` carrying no
        `callId`, so `callId` is now optional on that arm and on `ToolActivity` /
        `ChatToolActivity`. This is not a new state: `matchToolActivity` was already written for
        it and settles the row by name and recency, which is better than anything the server can
        do. The server's job was only to stop spelling the absence as a value.
  - [x] `unwrapDispatchedToolCall` owns the legacy `use_tool` envelope, at the parse, so no
        consumer sees one. `services/agent/runs/tool-recovery.ts` and its spec are deleted: nothing
        but the spec imported them, `reasoning.ts` declares its own `RecoverableToolSuggestion`
        with `invokeVia: 'direct' | 'search_first'`, and the dead module still spoke the retired
        `use_tool` vocabulary — two recovery vocabularies for one concept, one unreachable. Its
        `input_schema?: unknown`, `example?: unknown` and two `as JsonSchemaShape` cast-probes go
        with it.
  - [x] A tool result is `ProviderToolOutput` — `none`, `value`, or `corrupt` — rather than an
        optional payload. An unreadable result settles the row as `failed`, never as a `succeeded`
        row carrying nothing (ADR 0015). `readAgentPayload` classifies it rather than a zod schema,
        because `z.record` accepts a `Date` and parses it to `{}`.
  - [x] `services/diagrams/authoring.ts` was the second consumer and its port read
        `map(event: unknown)` — the loosest signature in the repository, loose only because
        `ToolStreamEvent` was never exported. It takes `ProviderStreamEvent` now.
  - [x] `provider-stream-event.spec.ts` feeds the parser the shape the SDK actually emits, with
        the facts on `item.rawItem`. The old mapper specs passed literals whose only member was a
        `toJSON()` — a fixture that agreed with the reader written beside it and with no real
        event, which is the TN-14 lesson in a second place. Verified with `pnpm check`,
        `pnpm test:architecture`, `pnpm test:unit`, `pnpm test:contracts`, `pnpm lint`, and a live
        `pnpm test:evals:smoke` run against a real provider.

### Phase 3 — Exhaustive agent tool contracts

- [x] **TN-30: Build the authoritative `AgentToolContractMap` in the agent model barrel**
  - [x] Key totality: the map is a mapped type over each controller's methods, so a new method
        without a contract entry is a type error (the `AgentToolCoverage` precedent).
  - [x] Value correspondence: each entry's argument and output schemas are derived from — or
        type-level-asserted against — the controller method's own signature, so a change to the
        producer is a compile error at the registry. Key totality without value correspondence is
        a checklist, not enforcement: a hand-written entry that matched yesterday's return type
        still compiles after the producer changes, which re-creates the TN-14 failure mode — a
        schema agreeing with itself, not with its producer.
  - [x] The model-owned generic keeps server controller types at the registry seam. Every active
        method names its `ToolName` contracts, argument schemas type the adapter input, and the
        exhaustive output map derives passthrough values from controller return types while naming
        projected wire values explicitly. Every result is read into `AgentPayload` before leaving
        the adapter.
  - [x] Void mutations return explicit receipts, and a missing artifact is a `NotFoundError`
        rather than an undefined successful result. Verify with `pnpm test:architecture`, focused
        factory/MCP specs, `pnpm test:unit`, and `pnpm check`.
- [ ] **TN-31: Derive generic server definitions, executor calls, events, and pending decisions**
- [ ] **TN-32: Parse client event-stream JSON into correlated tool activities**
- [x] **TN-33: Replace client record probes with tool-specific typed projections**
  - [x] Name the wire type: `AgentPayload` / `AgentPayloadObject` in `models/agent/payload.ts`,
        read once at the client event and journal readers (`stores/agent/chat-tools.ts`).
  - [x] `ChatToolActivity.output` and `.arguments` carry it instead of `unknown` and
        `Record<string, unknown>`; an unreadable result settles as `failed`, not as an empty
        `succeeded` (ADR 0015).
  - [x] Named-field projection `toolResultFields` replaces index access at the three surfaces
        that read a closed set of fields (`tool-presentation`, `turn-activity`, `tool-disclosure`).
  - [x] All five weak record guards deleted. Verify with `pnpm test:architecture`.
  - Not done here, and deliberately: the projection is by field name, not per tool. Which fields
    a given tool returns is TN-30's contract map; a per-tool schema written before it exists
    would be a guess maintained in the wrong file. `canvas-subject.ts` remains the exemplar for
    the per-tool form.
- [ ] **TN-34: Prove registry/catalog/constructed-definition key equality and all round trips**

### Phase 4 — Remaining closed domain and boundary shapes

- [x] **TN-40: Remove `TrustPolicy.conditions` while retaining its database column**
- [x] **TN-41: Close domain-error details through `DomainErrorDetailsByCode`**
- [x] **TN-42: Close provenance by producer kind, pipeline, and producer name**
  - [x] Ten producer arms in `models/provenance`, each carrying only the fields its producer has,
        with a `strict` schema per arm. `MCP client` was unmodelled and is now an arm.
  - [x] `ProvenanceRequest` distributes: the six hand-written `Omit<Provenance, …>` signatures
        collapsed the union to its shared keys, which is why every caller setting `pipeline`,
        `runId` or `model` was a type error.
  - [x] `asProvenance` completes a request through the model's own parser, so the four sites that
        spread a union member into a literal no longer widen it out of every arm.
  - [x] Delete the seven duplicate open-shaped declarations: `Provenance` in
        `models/{workspace,notes,memory,todos,suggestions}` and `SuggestionView` in
        `models/{memory,notes}`, plus the suggestion type tree `models/notes` had copied to
        declare it.
  - [x] `ProvenanceOrigin` replaces `SuggestionView.provenance`. The client has no run id, model
        or source anchor, so it was inventing a record per pipeline — producer names that no
        producer uses, reaching the caption.
  - [x] Fixtures that encoded impossible records now build real ones. Verify with
        `pnpm test:architecture`, `pnpm test:unit`, `pnpm check`.
  - [x] Define the canonical producer union, exact metadata schemas, and parser in
        `models/provenance/index.ts`.
  - [x] Parse persisted rows in the DB mapper and make repository writes use the exact union.
  - [x] Propagate the closed shape through domain-local views and production constructors; add
        producer and malformed-row coverage.
  - [x] Verify with `pnpm test:architecture`, focused unit specs, and `pnpm check`. The work had
        landed in `a153e9d` and `edccff5` but no run was recorded against it; these two boxes were
        ticked from TN-24's gate, which covers the same tree.
- [ ] **TN-43: Narrow remaining message, activity, instrumentation, PDFMake, DOCX, and JSONB shapes**
  - [x] Remove the redundant actor cast-probe from controller boundary instrumentation.
  - [x] Type DOCX image widths from the parsed ProseMirror media attributes.
- [ ] **TN-44: Parse remaining JSON/config/storage/replay/recovery/eval boundaries**
  - [x] Parse the eval result log as a strict passed/failed union and quarantine structurally
        invalid JSON instead of trusting a cast.

### Phase 5 — Land remaining zero-baseline rules and close the audit

- [x] **TN-50: Land `no-record-unknown` at zero**
- [x] **TN-51: Land identifier-independent `no-weak-record-guard` at zero**
  - [x] Detect by signature — a type predicate whose target is `Record<string, unknown|any>` or a
        bare weak index signature — never by the identifier. The name-based scanner reported a
        baseline of 4 in 4 files; the fifth was `isPlainObject` in
        `components/chat/actions/tool-approval-fields.ts` and would have failed the rule on
        landing.
  - [x] Collapse the duplicated rule list in `scripts/audit-source-rules.ts` into one `RULES`
        const, so the union and the stale-allowance sweep cannot drift.
  - [x] Reject, differently-named reject, inline-index-signature reject, concrete-type valid,
        allowance, and stale-allowance specs. Verify with `pnpm test:architecture`.
- [ ] **TN-52: Land `no-json-parse-cast` and `no-cast-probe` at zero**
- [ ] **TN-53: Land strict-layer `no-unknown-type` with reasoned parser/SDK allowances**
- [ ] **TN-54: Run the all-scope residual sweep and regenerate final before/after counts**
- [ ] **TN-55: Run `pnpm test:architecture`, `pnpm test:unit`, `pnpm check`,
      `pnpm docs:check`, and `pnpm lint`; record any unrelated-worktree blocker explicitly**

## 1. `unknown` that escapes the boundary — [audit] `no-unknown-type`

```ts
// silly
execute(input: { readonly arguments: Readonly<Record<string, unknown>> }, action: () => Promise<unknown>): Promise<unknown>
```

`unknown` is the honest type of data nobody has parsed yet. It is legal inside a parse zone, as
the input to a model-local parser or co-located provider adapter schema. The moment it appears on a field, parameter, or return type in `models/`,
`services/`, or `controllers/`, every consumer must guess the shape — and each guesses
differently.

**Remedy:** name the shape and parse into it at the zone. Exemplar: `parseRunAgentInput`
(`src/lib/models/agent/index.ts`) — zod schema in the model, called by the repository mapper.

## 2. `Record<string, unknown>` as a struct substitute — [audit] `no-record-unknown`

```ts
// silly
readonly metadata: Readonly<Record<string, unknown>>;
```

This says "an object with keys I refuse to name." If the keys are known, name them. If the values
matter, type them.

**Remedy:** a concrete interface, or a discriminated union when the shape depends on a state.
Exemplar: `DomainSuggestion['payload']` (`src/lib/models/suggestions/index.ts`) — payload shape
hangs off the `kind` discriminant. Genuine maps stay legal: `Record<string, string>` for HTTP
headers (`models/attachments/index.ts`) is a real open-keyed map, not a struct.

## 3. `isRecord`-style boolean guards — [audit] `no-weak-record-guard`

```ts
// silly
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
```

The guard claims to narrow and returns `Record<string, unknown>` — it converts a compile-time
guarantee into runtime hope, and everything after it still probes. This codebase grew six copies
of it, and two already disagreed about arrays.

**Remedy:** a zod schema at the reader. Exemplar: `readToolFailure`
(`src/lib/models/agent/tool-failure.ts`) — `safeParse` at the point of use, typed result out.

Where the value is foreign JSON that many surfaces read, name the wire first and project from it:
`readAgentPayload` (`src/lib/models/agent/payload.ts`) turns `unknown` into a closed
`AgentPayload` union that narrows under a plain `typeof`, and `toolResultFields`
(`src/lib/components/agent/actions/tool-result-fields.ts`) reads the named fields off it. The rule
is detected by signature, so renaming the guard does not evade it. A predicate that narrows
_within_ a closed union to a concrete type — `isAgentPayloadObject` — is not this pattern and does
not fire: the union already holds, and the compiler checks the branch.

## 4. The cast-probe: `x as { field?: unknown }` — [audit] `no-cast-probe`

```ts
// silly
const status = (error as { status?: unknown }).status;
```

Casting to an inline object type asserts a shape nobody verified. It is the signature move of
carrying weak data too far in. (Casting an object _literal_ is already banned by `shape-cast`;
this is its mirror.)

**Remedy:** fix the producer's type so the field is known. When the data is genuinely foreign
(third-party error shapes, HTTP responses), parse it with a small zod schema at that boundary.
Framework-forced casts (e.g. Tiptap `extension.options`) take `// audit-allow: no-cast-probe —
<reason naming the framework constraint>`.

## 5. `JSON.parse(x) as T` / `response.json() as T` — [audit] `no-json-parse-cast`, `no-response-json-cast`

```ts
// silly
return JSON.parse(json) as Record<string, unknown>;
```

`JSON.parse` returns `any`. Casting it to a concrete type is always a lie: nothing checked the
shape. `JSON.parse(x) as unknown` followed by a schema is the honest form.

**Remedy:** `const parsed: unknown = JSON.parse(x); return schema.parse(parsed);` — exemplar:
`storedAgentRunClientStateSchema.parse(JSON.parse(value))`
(`src/lib/client/agent/runs/session-storage.ts`).

The same applies to HTTP: `const body: unknown = await response.json(); return schema.parse(body)`.
The honest intermediate stays weak only inside the provider adapter.

## 6. Double casts — [judgment]

```ts
// silly — two assertions still perform zero checks
const item = value as unknown as AgentInputItem;
```

**Remedy:** parse foreign data into a locally owned persisted union, then map that union to the
SDK type inside the provider adapter. A third-party generic that cannot be expressed locally needs
a precise `audit-allow`, not a second assertion. Exemplar: `PersistedSessionItem`
(`src/lib/models/agent/session-item.ts`) — parsed at the repository mapper, mapped to
`AgentInputItem` only in `services/agent/conversations/buffer.ts`, with an `unrecognised` arm so a
newer SDK item stays readable and lossless instead of failing the conversation.

## 7. `z.unknown()` / `z.any()` in a schema — [audit] `no-zod-unknown`

```ts
// silly — parses nothing
content: z.array(z.record(z.string(), z.unknown())).optional();
```

A schema that does not narrow is not a schema; it is a rubber stamp that lets the boundary claim
it parses.

**Remedy:** write the real schema. If the shape is recursive (a document tree), zod supports
`z.lazy` — one recursive `ProseMirrorNode` schema replaces every hand-rolled walker.

## 8. Parameters wider than the function's domain — [judgment]

```ts
// silly — negative and NaN amounts compile
function makePayment(amount: number): Receipt;
```

A signature must be total over its parameter types: every value the type admits must be a value
the function can act on. `number` admits negatives, `Infinity`, and `NaN`; a payment function
acts on none of them. The same goes for plain `string` where only a real id is meaningful.

**Remedy:** put the constraint in the type. Exemplar: branded ids and quantities in
`src/lib/models/notes/index.ts` (`Brand<string, 'NoteId'>`, `Brand<number, 'Confidence'>`).
Refine at the parse zone; pass the branded value inward.

## 9. Optional fields encoding one fact — [judgment]

Two optional fields that are always absent together are one fact. `{ ready: boolean; tab?: TabId
}` is three states pretending to be two.

**Remedy:** per AGENTS.md — make the containing thing optional with both fields required, or make
the state a discriminated union and hang each payload off the arm that can have it. Exemplar:
`ToolActivity` status arms (`src/lib/models/agent/index.ts`). See ADR 0034 for distinct types per
execution state.

## 10. `instanceof` to recover a lost discriminant — [judgment]

```ts
// silly — the type forgot what it was
if (result instanceof SaveSuccess) { ... }
```

`instanceof` on data means a discriminated union was flattened somewhere upstream. This codebase
is currently clean: all 132 uses are error hierarchies, DOM classes, or framework types, which
are legitimate. `models/` bans it outright ([audit] `no-instanceof-models`) as a guard rail.

**Remedy:** keep the discriminant (`{ kind: 'saved' } | { kind: 'failed' }`) instead of
class-typing data.

## 11. `Promise<unknown>` / `() => unknown` on seams you own — [judgment]

If both sides of a seam live in this repository, the seam has a known shape. `Promise<unknown>`
on an executor or transport says "I did not check what my own code returns."

**Remedy:** a registry keyed by the discriminant you already have — e.g. tool name → arguments
and output schema — so the seam is typed once and every crossing is checked.
