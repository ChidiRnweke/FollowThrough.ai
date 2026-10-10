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
  The SDK session adapter owns serialization; its factory no longer executes a repository mapper.
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
