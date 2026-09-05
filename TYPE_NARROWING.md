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
- [x] **TN-31: Derive generic server definitions, executor calls, events, and pending decisions**
  - [x] The definition names itself: `AgentToolDefinition.name` is `ToolName` and its
        classification is the model's `ToolClassification`, so the factory's duplicate
        `AgentToolClassification` is gone. `FIRST_CLASS_TOOL_NAMES`, `LOCKED_TOOL_NAMES` and
        `TOOL_CATALOG` carry catalog names too — a typo in any of those three lists was a tool
        that silently never surfaced, and one runtime spec was all that stood behind it.
        `AgentToolOutputMap` is now held total over `ToolName` in both directions; it is an
        interface, so a tool added without an output entry compiled until the first use of
        `AgentToolOutput<'that_tool'>`, and an entry left by a deleted tool never failed at all.
  - [x] `AgentToolExecutor` takes `action: () => Promise<AgentPayload>` and answers with one, in
        all three of its declarations. The factory reads every result into that type one frame
        below, so `Promise<unknown>` — the catalog's own section-1 example — was claiming an
        uncertainty that had already been resolved. `toolName` is a `ToolName`.
  - [x] `callId` is optional at that seam and is passed through or omitted, never coerced. It was
        `String(details?.toolCall?.callId ?? '')`, and `AgentRunLifecycle` keys its successful
        mutations by exactly that string: two mutations the provider sent no id for shared the key
        `''`, so the second overwrote the first and one of the two resources was never reported
        stale. An id-less mutation now emits its `resources_stale` at once, because nothing will
        settle a call that has no id to settle by.
  - [x] `AgentTools.offeredToolNames` answers what the model can call, where the gate is decided.
        `reasoning.ts` derived it from the built SDK values with
        `typeof (tool as { isEnabled?: unknown }).isEnabled !== 'function'`, but `tool()` assigns
        every tool an `isEnabled` function, so the test was always false and the answer was only
        ever the promoted tools. Tool recovery was therefore telling the model to discover
        `save_note` and `edit_note`, which the prompt tells it to call directly. Both specs were
        run against the original code and fail there.
  - [x] The MCP adapter's `ok`/`attempt` pair takes `AgentPayload`, and its runtime `undefined`
        guard went with the `unknown`. Its `search_tools` result is read rather than asserted:
        `z.toJSONSchema` answers with zod's own payload type, the one value on that surface not
        already known to be JSON.
  - [x] `AgentEvent.tool_completed.output`, `ToolActivity.succeeded.output` and
        `workflow_result.result` carry `AgentPayload`. The persisted JSON shape does not change.
        `ConversationArchive` no longer re-reads an already-read value, and the spec that fed it a
        function-valued output went with that: the fixture described a row no producer can build.
  - [x] `WorkflowRunTask<Result>` stays unconstrained, deliberately. `Result extends AgentPayload`
        is what it looks like it wants, but the tasks return domain outputs — `FindReferencesOutput`,
        `GenerateMermaidDiagramOutput` — that are JSON-shaped and still not assignable to an index
        signature, so satisfying it meant putting one on each of those domain types. The read moved
        to `WorkflowRunner.execute` instead, where a domain result becomes wire JSON, and a result
        that cannot be represented settles the run as failed.
  - [x] Three `no-cast-probe` violations retired: the two `createdAt` probes in `filterCreated`,
        which indexed a value whose type already said it was JSON, and the range cast in
        `temporal`'s refinement, where the generic shape leaves zod inferring a union that no
        longer knows the two keys the function itself added. A schema reads them back instead.
        `SuggestionProjection.payload` is the domain union rather than `unknown`.
  - [x] Verified with `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`,
        `pnpm test:contracts`, `pnpm lint`. `pnpm test:evals:smoke` was not run: it bills a real
        provider, and the offered-tool fix is covered against the SDK's own gate in
        `agent-tool-factory.spec.ts`.
  - Not done here: splitting `tool_completed` into succeeded and failed arms, which it wants —
    `output?` and `failure?` sit side by side. `AgentEvent` is persisted as
    `jsonb('event').$type<AgentEvent>()` and asserted on read, so changing the arm shape needs a
    read boundary first. It belongs with TN-32 and TN-43, which own that read path. (Landed in
    TN-32, as three arms rather than two.)
    `PendingAgentDecision.toolName` stays `string` for the same reason: it comes from stored rows
    and from provider interruptions, so closing it over the catalog without a parse would be a lie.
    TN-34 owns that key equality.
- [x] **TN-32: Parse persisted and streamed run events, and split the tool outcome arms**
  - [x] `readAgentEvent` and `agentEventSchema` in `models/agent/index.ts`, with `StoredAgentEvent`
        as a read-boundary union rather than a sixth arm on `AgentEvent`. `AgentEvent` is the write
        type too, and an `unrecognised` arm on it is a state a producer could say; `StoredSuggestion`
        set the precedent. The three readers of one stored shape are retired with it:
        `row.event` handed out under `jsonb('event').$type<AgentEvent>()`, the SSE frame's
        `JSON.parse(event.data) as Omit<AgentRunEventRecord, 'createdAt'> & { createdAt: string }`,
        and `restoredTool`'s `String(content.callId ?? '')` /
        `String(content.status ?? 'succeeded') as ChatToolStatus`.
  - [x] `tool_completed` is three arms: `tool_succeeded` (`output?`), `tool_reported_failure`
        (`failure` **and** `output`, both required) and `tool_failed` (`failure`). Measured, not
        guessed: of 147 stored rows, 117 carried `callId, name, output` and 30 carried a `failure`
        beside the serialized `{"failure":…}` the tool returned — the ADR-0035 case — and both
        consumers branched on `failure` first and dropped that output. One row in five lost its
        detail on every replay. `ToolActivity` and `ChatToolActivity` carry the arm too, so the
        fact survives the journal, and `toolFailure`'s second route
        (`readToolFailure(tool.output)` on a `succeeded` row) is gone with it: the classification
        happens in `AgentToolEventMapper.outcome`, where the value is produced.
  - [x] No compatibility mapping. A reader branch for the retired shape is a second definition of
        the union that nothing keeps correct, so the rows moved instead:
        `drizzle/0049_split_tool_outcome_events.sql` rewrites 30 rows into `tool_reported_failure`
        and 117 into `tool_succeeded`, following `0047_rename_diagram_tools`, which faced the same
        problem — a name the code stopped using and the rows still carried.
  - [x] `toolActivityFromEvent` is model-owned because two services need it and a service may not
        import another. `AgentRunLifecycle` and `DiagramAuthoring` held a copy each and had already
        diverged — the diagram one wrote `output: undefined` onto a `succeeded` row, which the wire
        type cannot carry.
  - [x] `segmentOutput` takes `StoredAgentEvent`, and an unreadable row closes the open segment
        rather than being skipped: it is something that happened between two runs of output, and
        merging across it would give the second run the first one's cursor. The controller drops
        unreadable rows from the replay and warns with their cursors, the way `SuggestionInbox`
        does; the repository's `append` still raises, because an event it cannot read back is a
        writer bug and should be loud at the write.
  - [x] The dead `suggestion` arm is deleted. Nothing has ever emitted one — no producer in the
        repository, no stored row — and it was the only reason `models/agent` carried its own copy
        of the suggestion type tree: `SuggestionBase`, five payload types, `CreateTodoInput`,
        `CreateRelationshipInput`, `CreateReferenceInput`, `MemoryChangePayload` and eleven aliases
        that existed to support them. Writing a schema for an event no producer emits would have
        been a hand-copy of another domain's parser maintained against nothing.
  - [x] `tests/corpus/agent-run-events.json` (2554 rows) and `agent-tool-messages.json` (129) are
        captured by `pnpm corpus:capture`, and `tests/unit/corpus.spec.ts` asserts **zero**
        unreadable rows in either. Both were verified to fail before the backfill ran, which is the
        only reason to trust them. `agent-event.spec.ts` covers the three arms, the frame reader and
        the refusals; the contract spec round-trips `tool_reported_failure` through jsonb.
  - Not done here: `messages.content` is still `jsonb('content').$type<AgentPayloadObject>()` with
    no parse at the mapper. The client journal reader parses defensively, so a corrupt row degrades
    to one visible unreadable transcript row, but the DB-side read belongs with TN-44's remaining
    JSONB boundaries. `scripts/audit-topology.ts` also still scans only `src/lib/server/db/mappers.ts`
    for `parse*`/`read*` corpus coverage, and this parser lives in the agent repository, so nothing
    forced the corpus entry — widening that scan belongs with TN-54's sweep.
  - Verified with `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`, `pnpm test:contracts`,
    `pnpm lint`. `pnpm test:evals:smoke` was not run: it bills a real provider, and the mapper's
    three arms are covered against the SDK's own shapes in `reasoning.spec.ts`.
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
- [x] **TN-34: Prove registry/catalog/constructed-definition key equality and all round trips**
  - [x] `AgentToolName = ToolName | 'search_tools'` in `models/agent/tool-catalog.ts`, with
        `readAgentToolName` and the narrower `readToolName`. `search_tools` is the one name that is
        not a `ToolName`: `AgentTools.agentTools()` assembles it rather than defining it, so it is
        bound to no controller method and has no `TOOL_DESCRIPTIONS` entry. That single exception
        is why `PendingAgentDecision.toolName`, `ToolActivityBase.name` and every `AgentEvent` tool
        arm were a bare `string`. Measured: across the 2554 stored run events and 129 stored tool
        messages in `tests/corpus/`, it is the _only_ name outside the catalog — 38 rows and 10.
  - [x] Registry↔catalog key equality is the compiler's now. `BoundToolName` is derived from
        `agentToolCoverage` (which is `as const satisfies`, so its `tools` entries keep literals),
        and `_CoverageCoversCatalog` / `_CoverageNamesNothingElse` hold it total in both directions
        through the `Total<T extends never>` helper `AgentToolOutputMap` already used. Verified by
        unbinding `get_today_view` and watching `pnpm check` fail at the declaration.
  - [x] Two runtime specs deleted with them: the classification-kind check (`AgentToolContractBinding`
        is a closed union, so the kinds were already total) and the catalog-name equality itself.
  - [x] The **constructed** definition set is structural too, which first looked impossible: the
        groups returned `Definition[]`, and `agentOnlyDefinitions` built the selection-bound tools
        only when a selection was present, so membership itself depended on the turn and no type
        could hold it total. The fix was to stop conflating membership with availability. The
        groups return objects keyed by tool name, and the conditionality moved out of the group and
        into its caller: `selectionToolDefinitions` takes the selection as a parameter and is total
        over its four names, `appToolDefinitions` holds the three `surface: 'app'` studio tools plus
        the agent's `load_skill`, and `mcpOnlyDefinitions` holds the MCP `load_skill` — the one name
        with a different body per surface, because only the in-app agent has a conversation note to
        thread. `BuiltToolName` unions the four groups' key types, and `_BuildersCoverCatalog` /
        `_BuildersNameNothingElse` hold it equal to `ToolName`. Verified in both directions by
        renaming one key: a catalog tool nobody builds and a builder for a name the catalog lacks
        are each a `pnpm check` failure. The runtime spec that compared the two sets is deleted.
  - What no type can see, and what the remaining specs cover: a union collapses a name bound twice,
    so the duplicate-binding spec stays. And membership is not availability — the compiler knows
    every tool exists to be built, but a gate that withheld the wrong one type-checks perfectly, so
    two specs now pin the gates. One asserts a turn without a selection withholds _exactly_ the four
    selection-bound tools. The other asserts the MCP surface builds every contract except the
    app-surface three; nothing had ever compared `McpTools.definitions()` to anything, and that spec
    was verified to catch a `load_skill` drift that all 113 other specs passed straight through.
  - [x] `PendingAgentDecision.toolName` is a `ToolName`, read at both producers. `parkedCall` joins
        its existing unreadable/id-less refusals with `UNKNOWN_PARKED_CALL`: approving a park on a
        name nothing answers would resume the run into a call nothing can execute. `readPendingDecisions`
        owns the `agent_runs.pending_decisions` read, which was the last `jsonb().$type<>()`
        hand-out on the run row; an unreadable decision is dropped and warned so the run stays
        readable and cancellable, and the resume it can no longer answer already fails loudly
        through the interruption check. Both `as PendingDecisionRows` write casts go with it.
  - [x] `ToolActivityBase.name` and all five `AgentEvent` tool arms carry `AgentToolName`, parsed by
        `agentToolNameSchema`. `ProviderStreamEvent`'s arms stay `string` — the provider is a foreign
        producer and its name is genuinely unparsed there — and `AgentToolEventMapper` is the parse.
        It raises `UNKNOWN_TOOL_CALL` rather than settling the row: the SDK resolves every call
        against the tools this run handed it, and answers an unknown name with its own
        `Tool not found` before any event is emitted. So a name arriving here means the registry
        and the SDK's tools have diverged — a bug in this process, not something the model did.
        `tool_started` has no failure arm to settle into either.
  - [x] `ChatToolActivity.name` is an `AgentToolName` too, and the fix was to move the arm rather
        than to widen the field. The blocker was `restoredTool`: a journal row the reader cannot
        reconstruct was rendered as a `failed` tool call named `tool` — a machine name shown to a
        user for a tool nobody called — and that invented name was the one thing keeping the field a
        `string`. A seventh `ChatToolActivity` status was the wrong home for it, on a union six
        consumers branch through with fall-through defaults. The right home was `ChatPart`, which is
        already `text | image | reasoning | tool`: an unreadable row is not a tool call, it is a
        fifth kind of part. Every existing consumer filters positively (`part.kind === 'tool'`,
        `isToolPart`), so the new arm passes through them untouched and only `chat-thread.svelte`
        gained a branch — muted rather than an alert, because nothing failed for the user, the
        record of it is what is damaged. The row is still visible, for the reason the fake tool row
        was: the work was attempted, and dropping it reports a turn that did less than it did.
  - Also not closed: `TOOL_CATALOG` keeps `ToolName` rather than the new `LongTailToolName`. `filter`
    cannot prove the partition, so narrowing it needs a hand-written type predicate — an unchecked
    claim, which is the thing this effort removes. `tool-catalog.spec.ts` holds the partition.
  - [x] Round trips: `repositories.contract.spec.ts` now round-trips a parked call through the
        `agent_runs.pending_decisions` jsonb column, which had no contract coverage at all, and reads
        an unparked run back with none. `corpus.spec.ts` reads every tool name in both stored
        journals through `readAgentToolName` and asserts zero exceptions, plus a second spec that the
        corpus really does contain `search_tools` so the check is not vacuous. Both were verified to
        fail before `search_tools` was admitted to the union.
  - No corpus fixture for `pending_decisions`, deliberately: the column is in-flight state, cleared
    on resume and by `abandonPendingCalls`, and was empty in **every** stored row when this was
    written. A captured fixture would be an empty array asserting nothing.
  - Five spec fixtures named tools that do not exist — `some_tool`, `search_notes`, `read_note` —
    and now fail to compile or parse. A fixture encoding a state production cannot produce teaches
    the bug to everyone who copies it; they name real tools.
  - Verified with `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`, `pnpm test:contracts`,
    and `prettier`/`eslint` on the touched files (`pnpm lint` fails on 39 pre-existing files on
    `master` too). The live approval park was not exercised: it bills a real provider, for the same
    reason `pnpm test:evals:smoke` was not run in TN-31 and TN-32. The read boundary it would
    exercise is covered against real Postgres by the contract round trip above.

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
- [x] **TN-43: Narrow remaining message, activity, instrumentation, PDFMake, DOCX, and JSONB shapes**
  - [x] Remove the redundant actor cast-probe from controller boundary instrumentation.
  - [x] Type DOCX image widths from the parsed ProseMirror media attributes.
  - [x] The `tool_completed` arm split landed in TN-32, which owns the persisted-event read
        boundary the change needed.
  - [x] `messages.content` is read, not handed out. `StoredMessage` in `models/agent/index.ts` is a
        read-boundary union like `StoredSuggestion` and `StoredAgentEvent`, and it hangs off
        `content` alone — `Omit<Message, 'content'> & (readable | unreadable)`. `content` is the
        only column that can fail to read, so `id`, `role`, `runId` and `eventCursor` stay present
        on both arms and ordering, run grouping and truncation are total over a stored message
        without narrowing first. `listMessages` maps every row of a conversation, which is the
        TN-14 shape; `appendMessage` stays strict, because a row this process just wrote and
        cannot read back is a writer bug and belongs at the write.
  - [x] The unreadable row stays visible. `partsOfTurn` already had the `ChatPart.unreadable` arm
        TN-34 added, so it renders where the gap is rather than being dropped — a turn that
        silently loses a row reports doing less than it did. The disjunction went up, not down:
        `getSession` passes the union to the client that renders it, and `resolveQuery` in
        knowledge-search leaves an unreadable row out of the transcript it condenses rather than
        standing in a placeholder the condenser would embed as something someone said.
  - [x] `artifacts.sourceNoteIds` was `(row.sourceNoteIds as NoteId[]) ?? []` — an unchecked brand
        on an unchecked array, and a default on a `notNull()` column that could not tell "cites no
        notes" from "the read failed". `artifactSourceNoteIdsSchema` replaces both halves.
        `skills.metadata` is parsed too; it was reaching the domain through the mapper's blanket
        `domain<T>` cast.
  - [x] `columnShares` in `models/deliverables` replaces the `(w as number)` in both renderers.
        "Every column has a width" and "there is a total to divide by" were two values for one
        fact, held apart in `pdf.ts` and `docx.ts` alike, and each then re-asserted what its own
        `every` guard had proved inside a `map` the narrowing does not reach. One value, one copy —
        the arithmetic ran twice and a fix to one would not have reached the other.
  - [x] The fontkit `as FontHandle` was a locally declared interface holding the one method it
        wanted, asserted onto `Font | FontCollection` — an `instanceof`-shaped move on a union that
        carries its own discriminant. `openFace` narrows and raises on the collection arm, which
        can only mean a bundled font file was replaced. `PdfSpannedCell` names the empty-object
        placeholder pdfmake requires in a spanned grid position, at its three sites.
  - [x] `tests/corpus/agent-message-contents.json` (201 rows, every role) and its zero-unreadable
        assertion, verified to fail against a planted bad row before being trusted. The topology
        audit scans only `db/mappers.ts` for `parse*`/`read*`, so nothing forced this entry —
        widening that scan is still TN-54's. Two `repositories.contract.spec.ts` round trips cover
        the unreadable arm against real Postgres, following the session-item precedent.
  - Left for TN-54, deliberately: `db/mappers.ts:25`'s blanket `domain<T>(value: unknown): T =>
value as T`. It is the root enabler of every unparsed jsonb hand-out, but retiring it is a
    whole-mapper rewrite and does not belong in a block about specific columns.
  - Not work yet: `feedbackReports.appContext` (`registry.ts:1160`) is written and never read, so
    its `$type<AppContextSnapshotV1>()` is an unbacked promise rather than an unparsed read. It
    becomes real the day a read is added.
  - Verified with `pnpm check`, `pnpm test:architecture`, `pnpm test:unit` (3027), `pnpm
test:contracts` (113), `pnpm corpus:capture`, and `eslint`/`prettier` on the touched files.
- [x] **TN-44: Parse remaining JSON/config/storage/replay/recovery/eval boundaries**
  - [x] Parse the eval result log as a strict passed/failed union and quarantine structurally
        invalid JSON instead of trusting a cast.
  - [x] The note-action SSE frame reads through `readAgentRunEventRecord` instead of a cast onto
        `Omit<AgentRunEventRecord, 'createdAt'> & { createdAt: string }`. It was a second,
        unparsed copy of a read whose parser and exemplar were one directory away
        (`client/agent/runs/remote-transport.ts`); the two ends are versioned separately, which is
        why that reader exists. The `(event as MessageEvent<string>)` cast went too — the
        `addEventListener` overload already types it.
  - [x] The icon-library search response is one `z.object({ icons: z.array(z.string()) })` at the
        boundary, replacing a cast-probe, an `Array.isArray` and a hand-written `icon is
DiagramIcon` predicate. A shape miss raises `ExternalServiceError` rather than answering
        `[]`, which is the failure-looks-like-success default; a separate spec pins the real empty
        match so the two stay distinguishable.
  - [x] The Infisical secret list is a schema over both spellings (bare array, `{ secrets }`
        envelope), with no zod detail in the thrown message so nothing from a secret record can
        reach a log. Behaviour change worth knowing: an entry whose `secretValue` is not a string
        used to be dropped silently and surface later as an unset environment variable. It now
        fails the fetch.
  - [x] The eval aux cache parses with `readAgentPayloadObject` and quarantines an unreadable file
        to `<path>.corrupt-<ts>`, following `result-log.ts`. Not an empty-cache fallback: an empty
        cache silently re-bills a real provider, so the message names that consequence.
  - [x] The migration journal was typed by annotation over `JSON.parse`'s `any`, which checks
        nothing. It has a schema now, and its spec parses the **real** `drizzle/meta/_journal.json`
        rather than a literal written beside the reader — the TN-14 rule applied to a config file.
  - Left as they are, and this is the finding TN-52 needs: `replay-virtualizer.ts:39` and
    `tool-failure.ts:68` are `JSON.parse(x) as unknown`, the form section 5 calls honest.
    **`no-json-parse-cast` must exempt `as unknown` explicitly**, or landing it breaks the two
    sites the catalog holds up as correct.
  - Also for TN-52: the two `JSON.parse(JSON.stringify(x))` deep clones
    (`client/notes/sync/indexeddb-note-sync-repository.ts:21`,
    `components/notes/editor-document.ts:39`) are not boundary reads — they strip a Svelte `$state`
    proxy from a value this process just produced, and `structuredClone` is the call that throws on
    that proxy. `$state.snapshot` is a rune and both are plain `.ts` files, so neither can use it;
    renaming them to `.svelte.ts` would drag a framework-free client repository into the compiler
    for a defensive copy. They need reasoned allowances, written when the rule exists — an
    allowance naming a rule not in `RULES` reports as malformed today.
  - Verified with `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`, and `eslint`/`prettier`
    on the touched files. `pnpm test:evals` and `test:evals:smoke` were not run: they bill a real
    provider, and both new readers are covered by their own specs.

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
- [x] **TN-52: Land `no-json-parse-cast` and `no-cast-probe` at zero**
  - [x] `no-json-parse-cast` catches all three ways a `JSON.parse` result gets named, not just the
        cast. `JSON.parse` returns `any`, and `any` adopts whatever annotation is in the position it
        lands in, so `const doc: JSONContent = JSON.parse(text)` checks exactly as much as
        `JSON.parse(text) as JSONContent` — nothing. A cast-only rule would have reported one
        spelling of a lie and blessed the other, and `evals/lab/pglite-database.ts` already carried a
        comment calling the annotated form "an assertion wearing a costume". `as unknown`,
        `: unknown`, and a result handed straight to a schema stay legal; that exemption is what
        keeps `tool-failure.ts:68` and `replay-virtualizer.ts:39` — the two sites §5 holds up as
        correct — from being broken by their own catalog entry.
  - [x] It reports at the `JSON.parse` call, not at whatever named the result. Found by landing it:
        reporting the enclosing function put the violation on the signature line, where no
        `audit-allow` can precede the parse, so `editor-document.ts` reported a violation and a
        stale allowance at once. The call is the one node present in all three positions.
  - [x] `no-cast-probe` fires on a type-literal cast target, or a union holding one. The union arm
        is not defensive: `note-reading-stats.svelte` casts to `{ words: () => number } | undefined`,
        so without it `| undefined` would be the one-character way to spell a probe the rule cannot
        see. Three neighbours structurally do not fire and need no allowance — a mapped type
        (`config.ts:23`), an array of a literal (`utils.ts:138,172`, and the seven repeats in
        `mcp-tool-factory.spec.ts`), and an object-literal operand, which is `shape-cast`'s.
  - [x] Baseline it landed against, measured not estimated: 17 `no-cast-probe` (13 fixed, 4
        excused) and 2 `no-json-parse-cast` (both excused). `artifacts/type-narrowing-audit.md` said
        24 and 27; it was frozen on 2026-08-30 and four blocks have landed since.
  - [x] Seven of the thirteen were foreign error shapes, and none of them wanted a schema.
        `postgres-errors.ts` (4) and `reasoning.ts` (2) use `in` narrowing, which resolves the field
        to `unknown` and lets a `typeof` do the rest — all of it checked, and it preserves the
        existing semantics exactly, which a schema did not: a zod object over a whole driver-error
        link has to decide what one unreadable field means, and drops the readable rest with it. A
        schema in `reasoning.ts` would also have put a parse in a service, which ADR 0037 forbids.
        `storage.ts` uses the SDK's own `S3ServiceException`, which declares `$metadata` and
        duck-types its `instanceof` — so it holds across a second copy of the SDK, which is the
        usual reason that shape gets asserted instead.
  - [x] `chat.svelte.ts` uses SvelteKit's `isHttpError`, following `project-actions.svelte.ts:53`.
        `App.Error` declares `message` required, so the body needs no probing once the guard holds.
        The dropped arm — a rejection carrying a status without being an `HttpError` — is
        unproducible on this path, and returned `undefined` before too.
  - [x] `import-notes-dialog.svelte` parses the response once through
        `importMarkdownArchiveOutputSchema` in `models/projects`, which also retires the
        `payload as ImportMarkdownArchiveOutput` beside it — a named type the rule cannot see, and
        the same guess about the same response. An unreadable report is its own message rather than
        an empty report: the import ran, and an empty report would claim it imported nothing.
  - [x] The two eval sites needed no schema at all. `run-case.ts` cast only because `filter` answers
        a boolean and throws away the narrowing it proved; folding the test into the `map` deletes
        it. `multi-step.ts` reads its tool output through `readAgentPayload` /
        `isAgentPayloadObject`, which its three sibling case files already do — it was the one TN-50
        did not reach. A corrupt output now names itself in the Phoenix explanation instead of
        scoring as evidence the model missed.
  - [x] Both checkers were verified to fail before being trusted: reverting one fixed site reports
        it, and misspelling one allowance's rule name reports the violation and a malformed
        allowance together.
  - Not done here: the 12 occurrences in files `scripts/audit-source.ts` does not scan — 11
    `no-cast-probe` and one `no-json-parse-cast`, across `note-editor.svelte.spec.ts`,
    `selection-action-plugin.spec.ts`, `instrumentation.spec.ts` (2), `web-research-transport.spec.ts`,
    `context.spec.ts`, `reasoning.spec.ts`, `workflow.spec.ts` (3), `library.spec.ts`, and
    `tests/agent-workbench.e2e.ts`. Widening the scan to spec and e2e files belongs with TN-54's
    sweep, which already owns the same question for `audit-topology.ts`.
  - Also left: `x as string` on `this.input.prompt` (`multi-step.ts:44`, `diagrams.ts:376`) and the
    other named-type casts. `no-cast-probe` cannot see a named type, and closing that needs the
    producer fixed rather than a rule.
  - Verified with `pnpm test:source` (zero across 1160 files), `pnpm test:unit`, `pnpm check` (0
    errors across 8898 files), `pnpm test:architecture`, and `prettier`/`eslint` on the touched
    files. `pnpm test:evals` was not run: it bills a real provider, and both eval changes are
    covered by `pnpm check` and the payload readers' own specs.
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
