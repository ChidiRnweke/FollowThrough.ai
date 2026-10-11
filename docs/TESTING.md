# Testing policy

Tests describe observable behaviour and domain invariants. Refactoring an implementation without
changing its output, persisted state, public errors, or rendered user experience should not break a
test.

## Test lanes

- `*.spec.ts` runs in the reusable Node lane. Tests in this lane must restore environment variables,
  global state, timers, and singleton state.
- `*.svelte.spec.ts` runs in Chromium and is reserved for native browser, Svelte rendering,
  accessibility, IndexedDB, editor, iframe, clipboard, or DOM serialization behaviour.
- `tests/integration/<capability>/*.contract.spec.ts` uses the real PostgreSQL schema and
  repositories through `tests/integration/database-harness.ts`; the schema suite is under
  `tests/integration/schema`.
- `*.e2e.ts` covers cohesive user journeys against a built application.

## Test shape

- A unit or component test covers one behaviour and may assert each of its outcomes. Every test
  asserts something; Chisel's `test-structure:no-assertion` rejects one that does not.
- E2E tests may use multiple visible checkpoints when setup is expensive and the checkpoints form
  one user journey.
- Use hand-written fakes that implement the dependency interface. Do not use mocking or spying
  libraries, and do not assert call counts or private invocation order.
- Put reusable fakes under `src/lib/testing/fakes`. A local fake is acceptable only when it belongs
  exclusively to one small test surface.
- Prefer model and service tests. Controller tests cover orchestration, transactions, rollback, and
  composed output rather than repeating service validation.
- A specific regression test should have `// Regression: <public failure protected by this test>`
  immediately above it.

## Resource hygiene

Every test owns and releases the resources it creates. Destroy editors, remove appended DOM, close
and delete IndexedDB databases, restore environment variables and fake timers, and stop external
processes. Tests must pass in random order and in the fully isolated verification lane. The serial
PostgreSQL contract lane reuses modules for speed; `pnpm test:verify` and master pushes run its
isolated counterpart.

## Commands

- `pnpm test` — default Node and focused Chromium feedback.
- `pnpm test:node` — Node-only test project, used in CI alongside the full browser suite.
- `pnpm test:topology` — runs `scripts/audit-topology.ts`, the repository-specific structural audit.
  It enforces capability entry points, the Edra boundary, factory placement and that every database
  mapper parser is covered by the captured corpus.
- `pnpm test:chisel` — runs Chisel (`chisel.config.json`): layers, type-checked architecture,
  failing loudly, type narrowing, the design system and test quality. It rejects mocking libraries,
  unexplained skips, literal shapes cast through `unknown`, interaction assertions and
  assertion-free tests.
- `pnpm test:architecture` — runs topology and Chisel together.
- `pnpm test:browser:full` — every Chromium component and browser-storage regression.
- `pnpm test:contracts` — serial PostgreSQL contracts with a shared module graph for fast feedback.
- `pnpm test:contracts:isolated` — the same PostgreSQL contracts with per-file module isolation.
- `pnpm test:e2e` — application journeys against the Vite dev server. Reuses a dev server already
  running on 5173 (`pnpm dev`, Infisical config), or auto-starts one. Auth stays enabled: a global
  setup mints/caches a session for the local user in `tests/.auth/state.json` (delete it to force a
  fresh token). No Authentik interaction is needed.
- `pnpm dev:e2e` — start the e2e dev server once, then iterate with focused runs such as
  `pnpm exec playwright test tests/agent-workbench.e2e.ts --project=app --grep "Mod\+K"`.
- `pnpm test:pwa` — serial production PWA checks; builds and previews on port 4173.
- `pnpm test:verify` — all non-evaluation verification lanes.

Paid or model-backed evaluations are intentionally explicit and are not part of `test:verify`.
