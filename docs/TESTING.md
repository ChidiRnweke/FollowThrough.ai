# Testing policy

Tests describe observable behaviour and domain invariants. Refactoring an implementation without
changing its output, persisted state, public errors, or rendered user experience should not break a
test.

## Test lanes

- `*.spec.ts` runs in the reusable Node lane. Tests in this lane must restore environment variables,
  global state, timers, and singleton state.
- `*.isolated.spec.ts` is reserved for dependencies or module-global state that cannot safely share a
  worker.
- `*.svelte.spec.ts` runs in Chromium and is reserved for native browser, Svelte rendering,
  accessibility, IndexedDB, editor, iframe, clipboard, or DOM serialization behaviour.
- `*.contract.spec.ts` uses the real PostgreSQL schema and repositories.
- `*.e2e.ts` covers cohesive user journeys against a built application.

## Test shape

- Unit and component tests have one behavioural assertion and one reason to fail. A single
  structural equality assertion may describe one cohesive result.
- The quality audit ratchets the current multi-assertion migration baseline: new exceptions fail
  immediately, and consolidating an existing exception should lower the baseline in the same change.
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
processes. Tests must pass in random order and in the fully isolated verification lane.

## Commands

- `pnpm test` — default Node and focused Chromium feedback.
- `pnpm test:browser:full` — every Chromium component and browser-storage regression.
- `pnpm test:unit:isolated` — contamination safety check for the reusable Node lane.
- `pnpm test:contracts` — PostgreSQL schema and repository contracts.
- `pnpm test:e2e` — application journeys.
- `pnpm test:pwa` — serial production PWA checks.
- `pnpm test:verify` — all non-evaluation verification lanes.

Paid or model-backed evaluations are intentionally explicit and are not part of `test:verify`.
