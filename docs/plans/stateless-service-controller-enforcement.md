# ADR 0007 enforcement follow-up

This is the tooling and guidance slice of section G in
[the existing refactor plan](stateless-service-controller-refactor.md), stacked above PR #336.
At that tooling revision, application implementation was unchanged. The refactor remains incomplete and this enforcement PR
is not merge-ready while the architecture gates fail.

## Revisions and reproducibility

- Application source: `5af62eb5fab1d922c5fa1a8fc2a544d065007062`, the head of #336.
- Checker implementation: `af1d2e93ff0a2e283f2003c65805a80c9d841a33`.
- Recorded on 2026-10-10 with Node `v24.21.0` and pnpm `10.30.1`.
- The original inventory has been replaced by the latest application measurement below.
- [Complete diagnostic inventory](stateless-service-controller-enforcement.json): file, line,
  rule, message, and semantic provenance. This file is evidence only; no checker reads it.

Prepend the nvm Node directory to `PATH`, install the frozen lockfile, then run:

```sh
pnpm test:architecture
node --experimental-strip-types scripts/audit-architecture.ts --json
pnpm exec chisel-js check . --json
pnpm test:ui
```

The chained architecture command stops at the semantic audit. Chisel and UI were also run
individually. Both semantic and Chisel findings remain errors. There are no new suppression
comments, migration baselines, ignore entries, or application fixes.

## Findings and ownership

| Check                     | Findings | Required correction                                                                                                    |
| ------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------- |
| `factory-workflow`        |      371 | Move operation execution from factories and their callbacks into controllers; retain construction and interface wiring |
| `indirect-dependency`     |      262 | Replace prohibited behavior access with controller operations; remove hidden service composition                       |
| `public-service-helper`   |       73 | Expose capabilities through explicitly implemented class interfaces; keep helpers private                              |
| `concrete-dependency`     |       55 | Replace concrete dependency/public result types with narrow declared contracts                                         |
| `store-workflow`          |       41 | Keep state updates in stores and move transport, decisions and coordination into controllers                           |
| Semantic total            |      802 | Continue the application refactor; findings can overlap at a source location                                           |
| Chisel prohibited imports |       51 | Correct the imports and their ownership; do not route them through a barrel to evade the check                         |

Representative findings include public functions in `services/relationships/presentation.ts`,
workflow calls in `stores/agent/chat.svelte.ts`, and operation callbacks in the agent tool factory.
The inventory provides full source paths and provenance for each finding. Counts describe
individual diagnostics, not distinct application defects.

No supported-pattern findings were emitted for `service-interface`, `controller-collaborator`,
`retained-service-state`, or `unresolved-source` at this revision. Their rejecting fixtures still
run. A zero count does not prove that dynamic behavior or capability cohesion follows the ADR.
The [enforcement reference](../architecture/semantic-enforcement.md) states the analysis limits.
Semantic review and application corrections remain owned by the existing refactor plan.

## Verification

- Focused analyzer, CLI, Chisel-layer and source-audit fixtures: **224 passed** in four files.
- `pnpm test:unit`: **560 files, 4,454 passed, one existing skip**. The existing Svelte
  `derived_inert` warning remains in browser output.
- Analyzer implementation also passed a standalone strict TypeScript check.
- `pnpm lint`: passed.
- `pnpm check`: passed with zero errors and warnings.
- `pnpm docs:check`: passed with zero errors/warnings and one existing hint; generation also
  reported existing TypeDoc entry-point warnings.
- Topology, source, test-quality and standalone UI audits: passed.
- `pnpm test:architecture`: failed on the 802 semantic findings above.
- Standalone Chisel: failed on 51 prohibited imports, freshly measured. The narrower type-only
  permission rejects concrete classes while preserving forwarded operation interfaces. The
  historical count in #336 is not a migration allowance.
- Changed SvelteKit and QA skill files match byte-for-byte across `.agents`, `.claude`, and
  `.opencode`. Other agents' worktrees and application files were not changed.

Database contracts, E2E, PWA and production builds are outside this tooling-only local verification.
Required PR checks must be read separately; local results do not imply CI success.

## Shared service boundaries — 2026-10-10

The application slice stacked on #345 converts all 17 shared helper modules to classes with
explicit capability interfaces. Controllers now coordinate proofreading, workspace replay and
transport validation, and agent read-result filtering. Factories construct their dependencies.
Callers and tests use the interfaces. No checker, suppression or skill guidance changed.

The current JSON inventory records application revision
`893d1b80` (the full SHA is in the JSON) against enforcement base
`eaf03762f80aac0e699249e82736d4c897d3f159`. Run the commands above at that application revision
to reproduce the findings. The earlier table and verification describe the tooling slice only.

| Check                     | Before | Remaining |
| ------------------------- | -----: | --------: |
| `factory-workflow`        |    371 |       274 |
| `indirect-dependency`     |    262 |         9 |
| `public-service-helper`   |     73 |        21 |
| `concrete-dependency`     |     55 |         2 |
| `store-workflow`          |     41 |        34 |
| Semantic total            |    802 |       340 |
| Chisel prohibited imports |     51 |        12 |

All 52 shared public-helper findings are gone. The remaining 21 helper findings are server-side.
The concrete findings are the chat store exposed to its panel and a private indexing chunker.
Review the latter's ownership without weakening its checker. Factory operation callbacks, store
workflows and their indirect consumers remain in the full inventory. In particular, chat now
uses controller factories for the removed helpers, but still has three prohibited factory
imports. Its lifecycle and dependency construction need a separate migration. This slice does
not complete that workflow or the broader application plan.

Verification of this application slice:

- Full unit suite: **562 files, 4,461 passed, one existing skip**.
- Isolated sync, notes and relationships database contracts: **31 files, 168 passed**.
- Type checking, lint, docs checking and standalone UI audit passed. Docs retain one existing hint.
- Topology, source and test-quality audits passed. Architecture fails on the **340** semantic
  findings; standalone Chisel fails on **12** prohibited imports. Both remain errors.
- SvelteKit, QA and PR guidance remain identical across all three skill copies.
- E2E, PWA and production builds were not run. CI status is separate from these local results.

The PR remains a draft while the migration gates fail. The JSON is evidence only, never a baseline.

## Agent tool orchestration repair — 2026-10-10

This slice remains stacked on #348 (`92860a95b0ead8a1b05268087089be50423f671d`) in PR #350.
Application and checker revision: `8e3e72fbf88dc9affb5980476134dad35c6a27ba`. The previous 100-finding result did not establish
compliance: the extraction introduced controller chains and the checks permitted type-only
controller operation injection. That implementation and its completion claims are superseded.

The tool-operation wrappers and provider are removed. Existing domain controllers own tool
operations, project choice, projections and result filtering. `Notes` owns preparation and
application of reviewed changes. Discovery coordinates embeddings and index ranking directly.
Live tool preferences are resolved from the preference service. Factories construct and wire
capabilities. Adapters parse arguments, register SDK/MCP handlers, retain protocol preparations
through passive state ports, delegate complete operations and serialize results. They receive
approval decisions as data. The run observes completed calls as data and cannot execute another
controller through an action callback. Public asynchronous boundaries remain instrumented.

The touched widget server controller now coordinates the editing, patch and candidate services
itself. The shared editing rules remain the same. No browser store workflow was migrated.
Shared Markdown and tool contracts live in models rather than controller-derived return types.

Enforcement now rejects controller operation injection through interfaces, barrels, getters,
bound methods and statically supplied model-owned ports. Adapter fixtures reject sequences across
controller operations, including private helpers and callbacks. Separate handlers and alternative
callback producers remain valid. Chisel rejects type-only controller-to-controller imports and
its corrective diagnostic now states that rule. No allowance, baseline or ignore was added.
SvelteKit and QA guidance match across all three skill copies; PR guidance remains aligned.

### Complete inventory

The JSON contains all **393 semantic findings** and **53 Chisel prohibited imports** with locations,
messages and semantic provenance. The old 340/100 counts used weaker checks and are not comparable
to the current gate. Rechecking #348's source with the current semantic analyzer produces **772**
findings:

| Rule                       | #348 with current analyzer | Repair |
| -------------------------- | -------------------------: | -----: |
| `controller-orchestration` |                        399 |    290 |
| `factory-workflow`         |                        284 |     14 |
| `store-workflow`           |                         55 |     55 |
| `public-service-helper`    |                         21 |     21 |
| `indirect-dependency`      |                         11 |     11 |
| `concrete-dependency`      |                          2 |      2 |
| Total                      |                        772 |    393 |

The main agent tool factory, MCP factory, SDK factory and new tool adapters have no semantic
findings. There are no adapter-orchestration findings at this revision. This does not certify the
whole application. Existing server chains still include conversation/replay, execution/stream
mapping, reference search, diagram generation and document/PDF rendering. Browser controller
chains, store workflows, remaining factories and public service helpers also need migration.
The inventory is evidence only, never suppression input.

### Verification

- `pnpm test:unit`: **566 files, 4,485 passed, one existing skip**. Browser output includes
  Svelte `derived_inert` warnings and a chart rendering error; the suite passes.
- Selected isolated PostgreSQL contracts: **13 files, 81 passed**. These include all agent
  contracts, synchronized tool policies, reviewed note changes and widget mutations.
- Focused tool, adapter, service and enforcement tests: **23 files, 369 passed** before the last
  added provenance fixture; the final full suite above includes that fixture.
- Regression cases use real controllers and InMemory repositories. They cover actual pin/token/
  artifact effects, note scope and provenance, file recovery, reviewed-write refusal, inclusive
  read filtering, SDK/MCP discovery isolation, checkpoint restoration and completion failures.
- `pnpm lint`: passed. `pnpm check`: zero errors and warnings.
- `pnpm docs:check`: zero errors/warnings and one existing hint.
- Topology, source, test-quality and standalone UI audits: passed.
- `pnpm test:architecture`: fails on the **393** semantic findings. Chisel was run independently
  and fails on **53** prohibited imports. No missing-test-coverage findings remain.
- Skill copies match byte-for-byte. E2E, PWA and production builds were not run.

The overall application refactor remains incomplete. PR #350 stays draft while migration gates
fail. Local evidence does not imply that CI passed.

## Server controller ownership repair — 2026-10-10

This slice is based on draft PR #350 at `28d54ce6005c3f7f3060ec17d0a9f700246f47fd`.
Application revision: `d43716c5` (full SHA in the JSON). The checkers are unchanged.
Before implementation, both complete diagnostic inventories matched #350 exactly: 393 semantic
findings and 53 Chisel imports. The JSON now contains every diagnostic for this application revision.

| Rule                       | #350 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  290 |       277 |
| `factory-workflow`         |   14 |        13 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   21 |        21 |
| `indirect-dependency`      |   11 |        11 |
| `concrete-dependency`      |    2 |         2 |
| Semantic total             |  393 |       379 |
| Chisel prohibited imports  |   53 |        47 |

### Corrected dependencies

- Conversation snapshots coordinate replay preparation, JSON reading and virtualization directly.
  The SDK session adapter invokes serialization; its factory no longer executes a repository mapper.
  The mapper itself remained repository-owned until the conversation SDK boundary continuation below.
- Agent execution and diagram generation coordinate stream readers, stateless correlation rules
  and fresh stream state. Tool identity, event order, reasoning deduplication and checkpoint order
  remain under the owning operation.
- References coordinates research settings, the provider, candidate preparation and ranking before
  its existing transactional persistence. Test injection now supplies a research client rather than
  another application operation.
- Diagrams owns provider execution, the event queue, validation decisions, cancellation and cleanup.
  Its store retains pending data and continuations without executing the workflow.
- Deliverables coordinates diagram resources, rasterization, PDF preparation and writing. Todos
  owns the same PDF sequence for board export. The factory shares the font cache between the two
  owners. DOCX remains a stateless document service.

The low-level adapter contracts are declared by their consuming controllers. Where two owners need
one adapter, they declare compatible transport contracts without importing each other. These ports
are implemented by readers, writers and providers, not by controllers. Shared replay and generation
completion data lives in models. No operation facade, controller callback injection, checker change,
suppression or browser migration was added.

Public controller methods did not change, so the existing controller surface and agent coverage maps
remain total. Central boundary instrumentation remains in place; its tests pass. Neither analyzer
reports a finding in the server controllers repaired here.

### Observed verification and limitations

- Full unit suite: **568 files, 4,491 passed, one existing skip**. Browser output still contains
  Svelte `derived_inert` warnings and the chart rendering error recorded on #350.
- Isolated PostgreSQL contracts: **22 files, 134 passed**. Command:
  `pnpm test:contracts:isolated tests/integration/agent tests/integration/references tests/integration/diagrams tests/integration/deliverables tests/integration/todos/promise-runs.contract.spec.ts tests/integration/sync/diagram-mutations.contract.spec.ts`.
- Focused regression tests cover replay files, event order, concurrent execution state, reviewed
  tool checkpoints, diagram correction/cancellation/provider cleanup, cached rendering resources,
  PDF/DOCX content, board exports and transaction failures.
- `pnpm lint`: passed. `pnpm check`: zero errors and warnings. `pnpm docs:check`: zero errors
  and warnings, one existing hint; generation retains TypeDoc entry-point warnings.
- Topology, source and test-quality stages passed. The architecture chain stopped at **379** semantic
  errors. Chisel and UI ran independently: **47** Chisel errors; UI passed.
- SvelteKit, QA and PR skill copies match across all three locations. Guidance was not changed.
- No live LLM calls, E2E, PWA or production build were run. These results do not imply CI success.

Moving the diagram provider test through the owning operation exposed an existing mismatch:
`submit_mermaid_diagram` is not accepted by the general agent tool-name reader. A regression test
records the current failure, provider cleanup and absence of a published suggestion. Separate tests
cover the SDK submission protocol and the owner with a controlled provider. This slice does not claim
successful end-to-end SDK diagram generation or change that error contract.

The remaining 277 controller findings are outside these server chains. Browser controller/store
workflows, other factory workflows, public service helpers, indirect dependencies and concrete
exposures remain in the complete inventory. The overall refactor is incomplete. Keep this stacked
PR draft while the migration gates fail.

## Server composition dependencies — 2026-10-10

This slice stacks on draft PR #353 at `85f5cc7bea5229f5cefaa31e8e59806304bcde0f`. Application revision:
`5a22f8289a7afb19f557f384c663dd1f94da9f55`. The checkers are unchanged. Before implementation, the semantic
inventory matched all 379 diagnostics exactly. Expanding Chisel's JSON message references
reproduced all 47 recorded diagnostics, including their messages and locations.

| Rule                       | #353 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   13 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   21 |        20 |
| `indirect-dependency`      |   11 |         9 |
| `concrete-dependency`      |    2 |         2 |
| Semantic total             |  379 |       375 |
| Chisel prohibited imports  |   47 |        47 |

### Corrected dependencies

- AgentSettings resolves the canonical preference resource key through WorkspaceCommandRules
  before passing it through the preference capability to persistence. AgentPreferenceRecords
  no longer receives or invokes a rule callback.
- Each of the 13 synchronization owners resolves its resource identity and key before receipt
  preparation. WorkspaceSyncReceipts receives that data and owns the existing SQL locks.
  The resolved resource and receipt lookup contracts live in models.
- LocalIdentity owns local-user provisioning followed by verified profile lookup. UserDirectory
  declares separate provisioning and reading capabilities. AppFactory constructs and exposes the
  instrumented controller; it no longer executes local initialization. The request hook, MCP
  authentication-disabled path and evaluation workspace invoke the same complete operation.

Authorization and public transport contracts remain unchanged. Repositories retain persistence,
absent-row advisory locking, actor/resource hash keys and source-row lock order. Operation locks,
request hashes, transactions, replay/cancellation proofs, deferred journal publication and
tombstone reads retain their behavior. Existing local profiles and preference defaults are preserved.
The new standalone controller surface is instrumented; existing controller and agent-tool maps
remain total. No schema, protocol, checker, suppression or guidance change was made.

### Observed verification

- Focused units: **14 files, 91 passed** (identity, agent settings, note synchronization,
  receipts and controller instrumentation).
- `pnpm test:unit`: **569 files, 4,492 passed, one existing skip**. Browser output retains
  Svelte `derived_inert` warnings and the chart rendering error recorded by the previous slice.
- Isolated PostgreSQL contracts: **23 files, 149 passed**, across two commands:
  `pnpm test:contracts:isolated tests/integration/identity tests/integration/agent/preference-writes.contract.spec.ts tests/integration/agent/repositories.contract.spec.ts tests/integration/sync`
  ran 22 files / 148 tests before the new lock-contention file was added;
  `pnpm test:contracts:isolated tests/integration/sync/preference-locking.contract.spec.ts`
  then passed its one test.
- The new contract starts an ordinary write with no preference row, holds its transaction,
  and observes synchronized creation waiting on an advisory lock. After the ordinary write
  commits, synchronization returns conflict and preserves the saved defaults and patch.
  Existing contracts cover concurrent independent preference edits, identity initialization,
  receipt replay/cancellation, transaction recovery, publication and deletion.
- `pnpm lint`: passed. `pnpm check`: zero errors and warnings.
  An initial check found a missing type import after the receipt-contract move; it was fixed
  before the passing check and full suite.
- `pnpm docs:check`: zero errors/warnings and one existing hint; TypeDoc entry-point warnings remain.
- Topology, source and test-quality stages passed. The architecture chain stopped at **375**
  semantic errors. Chisel and UI ran independently: **47** Chisel errors; UI passed.
- SvelteKit, QA and PR skill trees match across `.agents`, `.claude` and `.opencode`.
- No live provider, E2E, PWA or production-build validation was run. Local results do not imply CI success.

### Remaining work

The JSON retains every semantic and Chisel diagnostic with provenance. Browser controller/store
workflows, remaining factory workflows, public service helpers and concrete exposures still need
migration. The separate WorkspaceSyncChanges repository callback to workspace resource-key rules
also remains; removing the receipt dependency does not establish compliance for that read path.
Telemetry restructuring and the existing diagram SDK submission-tool mismatch remain outside
this slice. The overall refactor is incomplete. Keep the stacked PR draft while migration gates fail.

## Workspace synchronization pull ownership — 2026-10-10

This slice stacks on draft PR #354 at `af8cfce7c514a47b6f4b2aeadd8726d29adb9c90`.
Application revision: `11757be5b7e7a37241eec6d0ee43d2dfb5c1116c`. The checkers are unchanged.
Before implementation, both complete inventories matched #354 exactly: 375 semantic findings
including provenance, and 47 Chisel findings after expanding JSON message references.

### Corrected dependency and operation ownership

The separately recorded WorkspaceSyncChanges dependency is now corrected. This supersedes the
pending read-path item in the preceding section; it does not complete the application refactor.
The factory no longer injects resource-key or ETag callbacks into the repository. The repository
no longer constructs transaction-local repositories, reads bodies, assembles pages, or serializes
and reparses identities. It returns parsed identities, positive bigint versions and journal facts.

Workspace owns the complete pull. It provisions built-in skills before opening its readonly
repeatable-read transaction, selects changes through WorkspaceJournal, resolves canonical keys
through the existing WorkspaceCommandRules, reads exact bodies through WorkspaceResourceVersions,
and assembles the page. Services do not call one another. Both repositories use the same
transaction context. Incompatible nested transaction modes fail rather than weakening isolation.
SQL and boundary parsing remain in repositories; shared read contracts and schemas live in models.

Authorization, account isolation, cursor precision, the measured 128-record page size, checkpoints,
exact-version bodies, tombstones and failures are preserved. The public pull signature is unchanged.
The existing controller surface and agent-tool coverage registration remain total and still
instrument the complete operation. No checker, suppression or guidance changed.

### Complete remaining inventory

| Rule                       | #354 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   20 |        20 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    2 |         2 |
| Semantic total             |  375 |       375 |
| Chisel prohibited imports  |   47 |        47 |

The complete JSON inventories still match the base diagnostics exactly. The corrected repository
composition was a separately reviewed dependency, not a diagnostic. The JSON records that review
separately from analyzer output. Browser controller/store migrations, remaining factory workflows,
public helpers, indirect dependencies and concrete exposures remain work. Mutation/preference
writes, telemetry and the diagram SDK submission-tool mismatch were outside this slice.

### Observed verification

- Focused units: **10 files, 27 passed** across Workspace, synchronization services and transaction
  context tests. Full units: **573 files, 4,503 passed, one existing skip**.
- `pnpm test:contracts:isolated tests/integration/sync tests/integration/skills/display-name.contract.spec.ts tests/integration/skills/provisioning.contract.spec.ts`:
  **21 files, 111 passed**. A separate rerun of the snapshot file passed all three tests.
- The concurrent-write contract holds an exclusive notes-table lock, starts a pull and observes
  its body read waiting after journal selection. The writer commits a new body/version. The active
  pull returns the original matching page; the following pull returns the committed update.
  Additional contracts verify readonly repeatable-read settings and rejection of writes without
  changing saved data. Existing contracts now exercise complete pages through Workspace.
- Lint and type checking passed. Docs checking passed with zero errors/warnings and one existing
  hint; TypeDoc entry-point warnings remain.
- The architecture chain stopped at the semantic gate. Topology, source, test quality, semantic,
  Chisel and UI were also run independently. Topology, source, test quality and UI passed;
  semantic failed with **375** findings and Chisel with **47** prohibited imports.
- SvelteKit, QA and PR skill trees remain aligned in all three locations. Passing unit output
  retains the existing Svelte `derived_inert` warnings and chart rendering error.
- No live-provider, E2E, PWA or production-build validation was run. CI results are separate from
  this local evidence. Keep the stacked PR draft while migration gates fail.

## Knowledge-search boundaries — 2026-10-10

This slice stacks on draft PR #356 at `a9e6e285590e00b5b435d471e872c5c77b1fda73`.
Application revision: `fad8258997f88c4d79e2d258415d468f23936d2b`. The checkers are unchanged.
Read-only baseline verification reproduced all 375 semantic findings, including provenance,
and all 47 Chisel findings after expanding message references. The JSON now contains every
remaining diagnostic and separate records of manually reviewed dependencies.

### Corrected dependencies

ContentIndex now implements real named source-indexing and completion methods. Factories expose
the same instance through declared capability interfaces instead of bound-method objects. Chunking
is private implementation, with the same codec, normalization, boundaries, overlap and validation.
Hashes, model-sensitive embedding reuse, duplicate chunk identity, attachment deferral, source
visibility and deletion rules are preserved. SQL remains in repositories; complete operations and
transactions remain in their owning controllers.

Diagram context selection belongs to the same cohesive indexing capability. Its model-owned
requirement tells Diagrams, DiagramStudio and Suggestions whether to read an authorized source-note
title. Archived, empty and standalone diagrams avoid that lookup. The owners still coordinate
indexing, embedding and completion directly. There is no new service composition or controller chain.

SearchRanking is a provider adapter. Its request protocol, parsing, cancellation, error normalization
and observer span retain their behavior. One YAML serializer serves provider documents, trace
attributes and evaluation cache identity. Shared contracts and the response schema live in models.
Production and evaluation construction, cached clients and the trace-validation script use the new
locations. Cache model/strategy/query/topN/document identity and position payloads are unchanged.
Retrieval, inline-suggestion and relationship controllers retain ADR 0036's vector-order fallback.
No controller public operation changed; instrumentation and agent-tool coverage maps remain total.

### Complete remaining inventory

| Rule                       | #356 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   20 |        16 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    2 |         1 |
| Semantic total             |  375 |       370 |
| Chisel prohibited imports  |   47 |        47 |

The removed diagnostic identities are the diagram selection helper, three ranking helpers and the
concrete chunker dependency. No diagnostic identities were added. Bound factory surfaces, controller
consumers, evaluation construction/cache dependencies and diagnostic trace imports were also reviewed
manually; those observations are separate from analyzer counts. The JSON is evidence, never a baseline
or suppression input. Browser migrations and remaining factory/store workflows, public helpers,
indirect dependencies and concrete exposures still need work. The overall refactor is incomplete.

### Observed verification

- Focused search, indexing, ranking-protocol and cache units: **14 files, 79 passed**. Diagram
  context/publication regression units: **one file, 13 passed** after the three additional cases.
- Final full units: **574 files, 4,518 passed, one existing skip**. Passing browser output retains
  the existing Svelte `derived_inert` warnings and chart rendering error.
- `pnpm test:contracts:isolated tests/integration/knowledge-search`: **four files, 18 passed**.
  New real PostgreSQL contracts verify old semantic/new literal visibility, retirement after
  completion, newer edits during embedding, deletion before late completion, atomic visibility
  through an independent connection and rollback. Vectors are supplied locally; no provider runs.
- Affected isolated contracts: **48 files, 224 passed**, covering notes, skills, diagrams,
  suggestions, attachments and diagram/memory/widget synchronization.
- Full PostgreSQL contracts: **111 files, 532 passed**. Race barriers match the target source's
  embedding input; each scenario removes its own pending chunks. The isolated knowledge-search
  suite also passed again after this test-isolation review.
- The first atomic-visibility test attempt blocked on the harness's single connection and timed
  out. It now uses an independent reader connection; the complete knowledge-search rerun passed.
- `pnpm lint` passed. `pnpm check` passed with zero errors and warnings. `pnpm docs:check` passed
  with zero errors/warnings and one existing hint; TypeDoc entry-point warnings remain.
- Every architecture stage ran. Topology, source, test quality and UI passed. Semantic failed with
  **370** findings; standalone Chisel failed with **47** prohibited imports. Checks and suppressions
  were not changed.
- SvelteKit, QA and PR skill copies match across all three locations. Guidance was not changed.
- No live-provider, Phoenix round-trip, E2E, PWA or production-build validation was run.
  Local results do not imply CI success. Keep this stacked PR draft while migration gates fail.

## Inline-suggestion completion boundaries — 2026-10-11

This slice stacks on draft PR #358 at `ab83ff5c8fe2f152082ccec32af356086cda2eb0`.
Application revision: `49cd5c82c64709f896ce511c19d88e8d2c276331`. The checkers are unchanged.
Baseline verification matched all 370 semantic diagnostics with provenance and all 47 expanded
Chisel diagnostics exactly. The JSON contains the complete remaining inventories, not only the
changed family.

### Corrected dependencies

InlineSuggestions owns prompt preparation, provider execution and output sanitization through direct
collaborators. InlineCompletionRules is a stateless service with two public capabilities; its context,
wrapper, overlap and sentence helpers remain private. InlineSuggestionCompletion is a provider adapter
with private trace mapping. It receives the SDK client from a factory and imports no services.

One model-owned completion contract replaces the two service-local interfaces. The controller supplies
the selected model explicitly. The normalized preference model still wins over the environment default;
environment precedence is unchanged. Factories expose interface-typed outputs and construct the client,
rules and adapter. The application only wires their outputs. Evaluations still set the model through
preferences and invoke the owning inline-suggestion controller.

The controller retains authorization, authoritative note/project context, admission, budget consumption,
release and error normalization. Its existing generation span encloses provider execution and
sanitization, with the same parent, model metadata, raw response attributes and sanitized output.
The adapter preserves request parameters, headers, SDK cancellation and provider failures. The existing
trace-only reasoning metadata remains distinct from the actual request. Prompt text, spacing, empty
responses, overlap and output limits are unchanged. ADR 0036 fallback remains in the owning controllers.
Public controller operations, boundary instrumentation and agent-tool coverage maps are unchanged.

### Complete remaining inventory

| Rule                       | #358 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   16 |        13 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    1 |         1 |
| Semantic total             |  370 |       367 |
| Chisel prohibited imports  |   47 |        47 |

The removed identities are the three inline-completion public helpers. No diagnostic identities were
added. Constructor, factory-output, contract, consumer and evaluation reviews are recorded separately
from analyzer findings. The overall refactor remains incomplete. No checker or suppression changed.

### Observed verification

- Focused units: **15 files, 109 passed**, covering inline rules/controllers, local provider protocol,
  ranking/cache regression, controller instrumentation and telemetry cancellation.
- Full units: **577 files, 4,536 passed, one existing skip**. Passing browser output retains the
  existing Svelte `derived_inert` warnings and chart rendering error.
- Isolated PostgreSQL contracts: **21 files, 100 passed** with
  `pnpm test:contracts:isolated tests/integration/knowledge-search tests/integration/notes tests/integration/memory tests/integration/agent/resolved-preferences.contract.spec.ts`.
- Local HTTP fixtures verify request contents and factory headers, selected/provider model attribution,
  raw text, usage, empty/refusal responses, provider errors and cancellation. In-memory OpenTelemetry
  verifies one generation child span, raw attributes versus sanitized output, SDK cancellation status
  and admission release. No telemetry server is needed.
- Lint passed. Type checking passed with zero errors and warnings. Docs checking passed with zero
  errors/warnings and one existing hint; TypeDoc entry-point warnings remain.
- Every architecture stage ran. Topology, source, test quality and UI passed. The architecture chain
  stopped at **367** semantic errors. Standalone Chisel failed with **47** prohibited imports.
- SvelteKit, QA and PR skill trees match across `.agents`, `.claude` and `.opencode`; guidance did not
  change. An initial focused test expected the wrong fixture source title; the expectation was corrected
  before all passing results above.
- No live provider, evaluation suite, Phoenix round-trip, E2E, PWA or production build was run. Local
  results do not imply CI success. Keep the stacked PR draft while migration gates fail.

Browser migrations, synchronization, preference writes, indexing, unrelated helpers, telemetry
restructuring and the diagram SDK mismatch remain outside this slice. The wider application migration
and its remaining factory/store/helper/dependency findings still need work.

## Retrieval-provider boundaries — 2026-10-11

This slice stacks on draft PR #360 at `71baf694ed1fade904113a06561928fd3012dfa7`.
Application revision: `f9904532` (the complete SHA is in the JSON inventory). Baseline verification
matched every recorded semantic diagnostic, including provenance, and every expanded Chisel
message and location. The checkers are unchanged.

### Corrected boundaries

Embeddings and SearchQueryGeneration are provider adapters. Retrieval factories construct their
SDK clients and expose model-owned interfaces. Default and selected models, base URLs, headers,
timeouts, provider errors and protocol behavior retain their existing values. The duplicate
service-local embedding contracts and query provider interface are removed.

EmbeddingBatching is a stateless rules service. It preserves lazy token counting, the existing
30,000-token budget, empty inputs and oversized singleton behavior. The nine multi-input owners
coordinate sequential requests and combine their results before completing writes. Combination
preserves returned model labels for existing completion validation and rejects mixed-model batches.
The provider adapter retains response sorting, count/index validation, cancellation and one
existing embedding span per physical request. Single-input consumers keep their direct calls.
Index staging, reuse, transactions and completion semantics are unchanged.

Retrieval coordinates SearchQueryRules and the query adapter. The rules service owns the exact
prompt and trim/nonempty rules. Authorized conversation lookup and the legacy condensation path
remain unchanged. The existing generation span still encloses generation and output validation,
with the same error envelope. ADR 0036 fallback stays in the owning controllers.

Query evaluation caching now exposes lookup and storage through a model-owned contract, without a
workflow callback. Retrieval reads before generation and stores only validated success. Existing
`search-query-v2` keys, trimmed strings, counters and record-mode behavior remain compatible. Cache
errors stay outside provider-error wrapping; hits skip generation and its span. Evaluation observers
preserve previous trace suppression. The embedding cache retains per-content/model keys, Float32
encoding and ordering. Its existing lack of cancellation forwarding is unchanged; query generation
also retains its existing API without a cancellation parameter.

Production and evaluation constructors, factory outputs, application overrides, controller consumers,
InMemory fakes and deploy seeding were reviewed. Provider constructors exist only in factories;
adapters do not import services. Controller public operations, instrumentation and agent-tool maps
remain unchanged. No service composition, controller chains or test-only production helpers were added.

### Complete remaining inventory

| Rule                       | #360 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   13 |        13 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    1 |         1 |
| Semantic total             |  367 |       367 |
| Chisel prohibited imports  |   47 |        47 |

No diagnostic identities were added or removed. The complete JSON refreshes source locations and
provenance and records the manual dependency corrections separately. These corrections were not
analyzer findings; unchanged counts do not mean the provider review was skipped. The overall
application migration remains incomplete. No checker or suppression was added or weakened.

### Observed verification

- Final focused units: **24 files, 126 passed**, covering rules, controller query generation,
  provider protocol, traces, sequential tool seeding, maintenance, ranking and evaluation caches.
- Final full units: **584 files, 4,562 passed, one existing skip**. Passing browser output retains
  the existing Svelte `derived_inert` warnings and chart rendering error.
- Affected isolated PostgreSQL contracts: **62 files, 272 passed**, with:
  `pnpm test:contracts:isolated tests/integration/knowledge-search tests/integration/notes tests/integration/memory tests/integration/relationships tests/integration/diagrams tests/integration/widgets tests/integration/skills tests/integration/suggestions tests/integration/attachments tests/integration/sync/diagram-mutations.contract.spec.ts tests/integration/sync/memory-mutations.contract.spec.ts tests/integration/sync/widget-mutations.contract.spec.ts tests/integration/agent/resolved-preferences.contract.spec.ts`.
- Local HTTP fixtures exercise the real SDK, factory headers, selected models, base64 embedding
  decoding, raw query output and cancellation. In-memory OpenTelemetry records successful and
  rejected query output under the existing generation span. Cache tests prove replay, trimmed
  success-only storage, retries after failure and record-mode replacement without live providers.
- Multi-batch tool tests prove vector ordering and no partial publication after a later request
  fails. The attachment-tail regression still proves visibility beyond fifty chunks and complete
  embedding within existing budgets.
- Lint and type checks passed. Docs checking passed with zero errors/warnings and one existing
  hint; TypeDoc entry-point warnings remain. All three SvelteKit, QA and PR skill copies match.
- Every architecture stage ran. Topology, source, test quality and UI passed. Semantic failed with
  **367** findings; Chisel failed with **47** prohibited imports. The chained command stops at
  semantic, and all stages also ran independently.
- Early verification caught missing dependency wiring and legacy array-based provider fixtures;
  these were corrected before the final passing runs. Review also corrected model-label aggregation.
  Chisel required a colocated query-rules test; the final inventory has no new coverage diagnostic.
- No live provider, evaluation suite, Phoenix round-trip, E2E, PWA or production-build validation
  ran. Local evidence does not imply CI success. Keep the stacked PR draft while migration gates fail.

Browser migrations, indexing redesign, telemetry restructuring and the diagram SDK mismatch remain
outside this slice. Do not mark the overall refactor complete.

## Agent-file boundaries — 2026-10-11

This slice stacks on draft PR #364 at `77eb9d29498c1a0a406ca3ec2c970fbf5be4eb52`.
Application revision: `aae492b65190314fab5ea679f6a881c996628aeb`. The checkers are unchanged.
Baseline verification reproduced all 367 recorded semantic diagnostics, including provenance,
and all 47 expanded Chisel messages and locations exactly.

### Corrected boundaries

AgentFiles now owns complete `ls`, `grep` and `sed` operations, including authorized exact
resolution and repository enumeration. Stateless path, virtual-metadata and command services
own canonical names, virtual identity, diagram media types, listing, RE2 matching, inclusive
reads and typed recovery. Their internal helpers remain private. Agent receives paths directly
for attached context; Notes receives paths and metadata for inspection. No controller chain or
service-to-service composition was introduced.

Shared contracts live in models. The capability factory constructs implementations and returns
explicit interfaces; the application only wires them. Local service capability member types
reference the model signatures, retaining one shared signature while satisfying both existing
interface and lint checks. The same six controller operations retain their instrumentation and
tool-coverage entries. Tool input schemas, error envelopes and recovery calls are unchanged.

Resource-path parsing remains in the repository boundary behind an explicit read port. Persisted
queries, row mapping, upserts and database-generated identifiers remain in AgentFileRecords. A
shared content-measurement adapter supplies exact UTF-8 bytes, token counts, newline counts and
checksums to persistence and virtual metadata. It prevents a replay service from reaching another
service through persistence. Virtual identifiers still hash the exact path. No stored identifier
is reconstructed as a virtual one.

Exact reads retain stored-file precedence. Listings and grep retain generated/stored duplicate
paths and ordering. Project checks, actor authorization, revisions, diagram extensions and
unavailable versus empty attachments are preserved. Missing paths precede regex errors; empty
files precede range errors. Existing end-past-EOF reads finish at EOF; reversed ranges and starts
after EOF fail with exact recovery. No read cap or silent correction was added.

### Complete remaining inventory

| Rule                       | #364 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   13 |        10 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    1 |         1 |
| Semantic total             |  367 |       364 |
| Chisel prohibited imports  |   47 |        47 |

The three removed identities are the attachment-path, diagram-path and virtual-file metadata
helpers. No semantic identities were added. All Chisel diagnostics match the base exactly.
The JSON contains every remaining diagnostic and separate constructor, factory-output, parsing,
persistence, consumer, tool-surface and evaluation reviews. It remains evidence, not a suppression
input. The overall application migration is incomplete.

### Observed verification

- Focused units: **35 files, 348 passed**, covering file rules and operations, Agent context and
  replay, note inspection, agent/MCP tools and controller instrumentation.
- Full units: **588 files, 4,594 passed, one existing skip**. Passing browser output retains the
  existing Svelte `derived_inert` warnings and chart rendering error.
- Affected isolated PostgreSQL contracts: **26 files, 165 passed**, with
  `pnpm test:contracts:isolated tests/integration/notes tests/integration/attachments tests/integration/diagrams tests/integration/agent/repositories.contract.spec.ts tests/integration/agent/files.contract.spec.ts`.
- New database contracts verify exact Unicode measurements and stored identity across overwrite,
  stored precedence at a real note path, denial to another account and rejection of the wrong
  project. Local controller fixtures cover duplicate enumeration, revision content, empty extraction,
  unavailable text and matching/range recovery. No live providers ran.
- Lint and type checking passed. Docs checking passed with zero errors/warnings and one existing
  hint; TypeDoc entry-point warnings remain.
- Every architecture stage ran. Topology, source, test quality and UI passed. Semantic failed with
  **364** findings; standalone Chisel failed with **47** prohibited imports. No checker or
  suppression changed.
- Early checks found an incomplete listing fake, stale fixture construction and interface-form
  mismatches. These were corrected before the passing results above. Manual review also removed
  the attempted indirect metadata-service dependency through persistence.
- Evaluation construction still uses production `createApplication`; local evaluation cache units
  use supplied fakes. Live evaluations, Phoenix round-trip, E2E, PWA and production-build validation
  were not run. CI results must be reported separately from these local results.

Browser migrations, tool-activity projection, indexing redesign, telemetry restructuring and the
diagram SDK mismatch remain outside this slice. Keep the stacked PR draft while migration gates fail.

## Tool-activity projection — 2026-10-11

This slice stacks on draft PR #368 at `d8ad32290ce8dcb1d0993cc53910364127f19afc`.
Application revision: `f09fd8125f2af896c9229d40c805845d76477912`. The checkers are unchanged.
Baseline verification reproduced all 364 recorded semantic diagnostics, including provenance,
and all 47 expanded Chisel messages and locations exactly.

### Corrected boundaries

ToolActivityProjection is one model-owned contract with outcome and activity methods.
ToolActivityProjectionService implements the cohesive capability without collaborators or retained
state. Its activity method reuses its outcome rule. The old function exports are removed.
Agent and diagram generation receive explicit dependencies and keep their operations and journal
writes. The dedicated factory constructs the service and returns the model interface. AgentCapability
exposes that interface; the application wires it into both consumers without constructing a service.

The evaluation lab constructs the same interface through the factory. Reconstruction and timing
helpers receive it explicitly and stay private. The existing overlap assertion also receives it.
Local runCase tests drive the real Agent controller with InMemory repositories and runner. They
verify start ordering, original arguments, reported-failure detail, approval state and omission of
unidentified outcomes. Existing evaluation fallbacks are unchanged; no new defaults were added.

Projection preserves missing call IDs, absent success output, explicit null/false/zero/empty payloads,
approval reviews, and reported failures with both failure and output. Settled activity still has
empty input. Browser journal consumers retain matching, argument merging and ordering. Provider and
repository parsing, persisted null encoding and persistence stay with their existing owners.
Agent retains approval/event transactions and notifications after commit. Authorization, cancellation,
tool contracts, controller surfaces and tracing remain unchanged. No service composition, controller
chains, test-only production helpers or suppressions were added.

### Complete remaining inventory

| Rule                       | #368 | Remaining |
| -------------------------- | ---: | --------: |
| `controller-orchestration` |  277 |       277 |
| `factory-workflow`         |   12 |        12 |
| `store-workflow`           |   55 |        55 |
| `public-service-helper`    |   10 |         8 |
| `indirect-dependency`      |    9 |         9 |
| `concrete-dependency`      |    1 |         1 |
| Semantic total             |  364 |       362 |
| Chisel prohibited imports  |   47 |        47 |

Only the two tool-activity public-helper diagnostic identities were removed. None were added.
All Chisel diagnostics match the base exactly. The JSON contains every remaining diagnostic,
refreshed source locations and provenance, plus separate constructor, factory-output, parsing,
persistence, journal-consumer, tool-surface, tracing and evaluation reviews. It remains evidence,
not a suppression input. The overall application migration is incomplete.

### Observed verification

- Focused units and regressions: **69 files, 632 passed, one existing skip**. Coverage includes
  event readers, corpus conformance, archive/history, journal merging, Agent/diagram operations,
  approval/replay, cancellation, tools, instrumentation and local evaluation consumers/cache tests.
- Full units: **591 files, 4,621 passed, one existing skip**. Passing browser output retains the
  existing Svelte `derived_inert` warnings and chart rendering error.
- Affected isolated PostgreSQL contracts: **17 files, 95 passed**, with
  `pnpm test:contracts:isolated tests/integration/agent tests/integration/diagrams`.
- Lint and type checking passed. Docs checking passed with zero errors/warnings and one existing
  hint; TypeDoc entry-point warnings remain. All three SvelteKit, QA and PR skill copies match.
- Every architecture stage ran. Topology, source, test quality and UI passed. The architecture
  chain stopped at **362** semantic findings. Standalone Chisel failed with the same **47**
  prohibited imports. No checker or suppression changed.
- Early consumer tests caught a fixture waiting on a competing execution attempt and a failure
  payload that did not use the canonical tool envelope. Both fixtures were corrected before the
  passing results above. No production behavior changed to satisfy them.
- No live provider, live evaluation suite, Phoenix round-trip, E2E, PWA or production-build
  validation ran. Cache unit messages labelled “live” use local supplied fakes. Local evidence
  does not imply CI success. Keep the stacked PR draft while migration gates fail.

Browser migrations, journal redesign, agent-file changes, indexing, telemetry restructuring and
the diagram SDK mismatch remain outside this slice. Do not mark the overall refactor complete.

## Conversation SDK boundary — 2026-10-11

This slice stacks on draft PR #370 at `85def21d534c7278283d0e3d8e6f6f1a999a6acc`.
Application revision: `527857e2` (full SHA in the complete JSON inventory). The analyzers are unchanged.
Before implementation, the baseline reproduced all 362 semantic findings with provenance and all
47 expanded Chisel messages and locations exactly.

### Corrected ownership

Session-item serialization restores the provider wire format for both SDK replay and database
writes. It now has a model-owned SessionItemSerialization contract and a stateless protocol
adapter. Its exhaustive conversion switch is unchanged. A dedicated factory returns the interface;
conversation and agent capability factories inject it into the SDK adapter and PostgreSQL repository.
The repository helper is removed. Production consumers do not construct a hidden implementation.

The SDK adapter no longer imports the repository or controller modules. Its session-operation and
JSON-reader contracts live in models. The SDK-specific BufferedConversationSession interface stays
with the adapter. Parsing remains in SDK addItems, existing JSON readers and database mappers.
ConversationSessions keeps operations and replay sequencing, services keep history/virtualization
rules, and the session store keeps its buffers and cached presentation. No service composition,
controller chain, workflow move, suppression or new limit was added.

All consumers were updated, including PostgreSQL append/replace, contract constructors, in-memory
snapshot/reparse rollback, model writer tests and replay fixtures. The fake retains its existing
no-argument fixture API and uses factory-created serialization. Writer tests now live with the
protocol adapter. Provider metadata, omitted optionals, normalized call IDs and unrecognised raw
payloads are preserved. The captured provider corpus round-trips unchanged.

Session regressions cover SDK add/get/pop/clear, cache invalidation, existing limit semantics,
buffer-only writes and snapshot isolation from persistence. Existing replay tests retain image
handling, diagram elision and failed-call source preservation. New PostgreSQL contracts verify exact
replacement wire payloads and ordered tails after replacement/append. Authorization, cancellation,
transactions, public operations, tool contracts and tracing remain with their existing owners.

### Complete inventory and diagnostic identities

Semantic findings remain **362**: 277 controller-orchestration, 55 store-workflow, 12 factory-workflow,
eight public-service-helper, nine indirect-dependency and one concrete-dependency. Every semantic
finding matches the base exactly, including locations and provenance.

Chisel prohibited imports fall from **47 to 46**. The only removed identity is
`import-boundary:banned-layer-import` at `src/lib/server/adapters/agent/conversation.ts:1`, reporting
its import of `src/lib/server/repositories/agent/session-items.ts`. No identities were added.
All remaining Chisel diagnostics match exactly; there are no location-only changes. The complete
JSON inventory includes every remaining diagnostic and separate ownership/consumer reviews.
It is evidence, never suppression input. The older claim that serialization ownership was already
resolved has been corrected. The overall refactor remains incomplete.

### Observed verification

- Focused regressions: **57 files, 508 passed, one existing skip**. Coverage includes the SDK and
  serialization adapters, model schemas, corpus, conversation/history/replay, Agent lifecycle,
  cancellation, diagram session protocol and controller instrumentation.
- Full units: **593 files, 4,640 passed, one existing skip**. Passing browser output retains the
  existing Svelte `derived_inert` warnings and chart rendering error.
- Affected isolated PostgreSQL contracts: **17 files, 97 passed**, using
  `pnpm test:contracts:isolated tests/integration/agent tests/integration/diagrams`.
- Lint and type checking passed; type checking reports zero errors and warnings. Docs checking
  passed with zero errors/warnings and one existing hint; TypeDoc entry-point warnings remain.
- Every architecture stage ran. Topology, source, test quality and UI passed. The architecture
  chain stopped at the same **362** semantic findings. Standalone Chisel failed with **46**
  remaining prohibited imports. No checker or suppression changed.
- Initial validation caught a missing `eq` import in the new database test and an unused type
  import after moving the contracts. Both were fixed before the final passing checks.
- No live provider, live evaluation, Phoenix round-trip, E2E, PWA or production-build validation
  ran. Evaluation cache unit messages labelled “live” use local fakes. Local results do not imply
  CI success; required PR checks are reported separately.

Browser migrations, journal redesign, indexing, telemetry restructuring and the diagram SDK
mismatch remain outside this slice. Keep the stacked PR draft while migration gates fail.
