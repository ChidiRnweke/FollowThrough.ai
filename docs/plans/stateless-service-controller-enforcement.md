# ADR 0007 enforcement follow-up

This is the tooling and guidance slice of section G in
[the existing refactor plan](stateless-service-controller-refactor.md), stacked above PR #336.
Application implementation is unchanged. The refactor remains incomplete and this enforcement PR
is not merge-ready while the architecture gates fail.

## Revisions and reproducibility

- Application source: `5af62eb5fab1d922c5fa1a8fc2a544d065007062`, the head of #336.
- Checker implementation: `af1d2e93ff0a2e283f2003c65805a80c9d841a33`.
- Recorded on 2026-10-10 with Node `v24.21.0` and pnpm `10.30.1`.
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
