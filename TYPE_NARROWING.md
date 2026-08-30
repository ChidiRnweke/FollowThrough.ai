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

- [x] **TN-10: Define and parse the strict document union in `models/notes/index.ts`**
- [x] **TN-11: Propagate total documents through models, DB/remote boundaries, and note services**
- [x] **TN-12: Propagate total documents through editor/import/export, PDF, and DOCX paths**
- [x] **TN-13: Cover supported nodes/marks, recursion, strict keys, and invalid reads/imports**

### Phase 2 — Agent run and provider boundaries

- [x] **TN-20: Separate base, prepared, workflow, and unprepared run contexts**
- [x] **TN-21: Version workflow snapshots and map known legacy context shapes at repositories**
- [x] **TN-22: Reject malformed provider tool arguments and preserve call-ID precedence**
- [ ] **TN-23: Own and parse the persisted session-item union**
  - [ ] Define the local discriminated union and schema in `models/agent/index.ts`.
  - [ ] Parse repository reads and map to SDK `AgentInputItem` only in the provider adapter.
  - [ ] Add round-trip, legacy, and malformed-row specs.
- [ ] **TN-24: Normalize all provider stream events before reasoning logic**
  - [ ] Replace remaining raw probes with closed event schemas.
  - [ ] Cover `callId > call_id > id`, sole-active fallback, legacy `use_tool`, replay, and approval
        recovery.

### Phase 3 — Exhaustive agent tool contracts

- [ ] **TN-30: Build the authoritative `AgentToolContractMap` in the agent model barrel**
- [ ] **TN-31: Derive generic server definitions, executor calls, events, and pending decisions**
- [ ] **TN-32: Parse client event-stream JSON into correlated tool activities**
- [ ] **TN-33: Replace client record probes with tool-specific typed projections**
- [ ] **TN-34: Prove registry/catalog/constructed-definition key equality and all round trips**

### Phase 4 — Remaining closed domain and boundary shapes

- [x] **TN-40: Remove `TrustPolicy.conditions` while retaining its database column**
- [x] **TN-41: Close domain-error details through `DomainErrorDetailsByCode`**
- [ ] **TN-42: Close provenance by producer kind, pipeline, and producer name**
- [ ] **TN-43: Narrow remaining message, activity, instrumentation, PDFMake, DOCX, and JSONB shapes**
- [ ] **TN-44: Parse remaining JSON/config/storage/replay/recovery/eval boundaries**

### Phase 5 — Land remaining zero-baseline rules and close the audit

- [ ] **TN-50: Land `no-record-unknown` at zero**
- [ ] **TN-51: Land identifier-independent `no-weak-record-guard` at zero**
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

## 3. `isRecord`-style boolean guards — [audit] `no-is-record`

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
return JSON.parse(data) as { codeVerifier: string; state: string };
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
a precise `audit-allow`, not a second assertion.

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
