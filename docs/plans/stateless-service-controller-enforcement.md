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
