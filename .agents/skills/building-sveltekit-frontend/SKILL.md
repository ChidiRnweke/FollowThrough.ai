---
name: building-sveltekit-frontend
description: Provides architecture and engineering patterns for SvelteKit BFF frontend projects. Triggered when scaffolding, building, or reviewing SvelteKit features, loaders, stores, or openapi-fetch clients. Enforces layer separation and orchestrates services via controllers.
---

# SvelteKit SWE Skill

Opinionated architecture for production SvelteKit BFF projects. Every layer has a job — stay in your lane.

## Reference files

Read these when working in the relevant area:

- `references/layers.md` — Full layer-by-layer guide with patterns and anti-patterns
- `references/openapi.md` — openapi-fetch + openapi-typescript setup and typed client patterns
- `references/error-handling.md` — Service errors, loader/action errors, error boundaries
- `references/patterns-examples.md` — Full code examples for all layers

---

## Architecture

Follow ADR 0007 for stateless service classes, complete controller operations and explicit state
ownership. ADR 0037 defines parse boundaries; ADR 0041 requires one shared implementation of rules.
When the user has authorized implementation, proceed without asking again whether to code.

- Models contain data, schemas and value constructors.
- Public services are cohesive stateless classes with explicitly implemented narrow interfaces.
- Private helpers stay private. A test does not justify a public export.
- Controllers own application operations, sequencing, coordination and transactions.
- Stores own state and controlled updates, without business rules, transport or workflows.
- Components call controllers and observe readonly application state.
- Factories construct dependencies and expose interface-typed results, without running workflows.
- Services never call other services, including through injected callbacks.

Shared services live in `src/lib/services/<domain>/`; shared/browser controllers live in
`src/lib/controllers/<domain>/`. Server services/controllers/factories stay under `src/lib/server/`.
Server state stores live in `src/lib/server/stores/`. Browser capability factories construct
controllers and readonly state. Persisted domain data remains behind repositories.

See `references/layers.md` for the dependency rules and `references/patterns-examples.md` for
service, controller, store and composition examples. These replace the old API-wrapper service
and component-to-store workflow examples.

---

## Code Examples

For full code examples of the architecture layers in practice, please read:

- **`references/patterns-examples.md`** — Examples for Models, Services, Controllers, Factory, and Stores.

---

## For detailed patterns, read:

- **Setting up openapi-fetch + typed client** → `references/openapi.md`
- **Error handling across all layers** → `references/error-handling.md`
- **Full layer guide with more examples** → `references/layers.md`

## Validation Checklist

Before concluding any implementation task, copy this checklist into your response scratchpad to track your progress:

- [ ] Run the type-checker (`pnpm check`).
- [ ] Run the linter (`pnpm lint`).
- [ ] Run tests if applicable.
- [ ] If errors occur, autonomously fix them and repeat the loop until the checks pass. Do not ask the human to fix your structural or typing errors.

## Enforced Rule IDs

`chisel-js` is the deterministic counterpart of this skill. Current checkers may have migration gaps against ADR 0007. No listed permission overrides the ADR. Each rule below is owned by this skill — `chisel-js explain <rule-id>` prints fix guidance, and `chisel-js check .` flags violations. The paired UI skill (`designing-svelte-ui`) owns the colour/component/responsiveness rules listed in its own SKILL.md.

### Structural (SvelteKit runtime invariants)

- `structural:console-log-banned` — `console.*` banned in `.svelte`/`.ts` outside `scripts/`.
- `structural:timers-banned` — `setTimeout`/`setInterval` banned in `.svelte` and `$lib/`.
- `structural:inline-style-banned` — inline `style=` outside `components/ui/`.
- `structural:style-block-banned` — `<style>` blocks banned outside `app.css` and `components/ui/`.
- `structural:app-stores-banned` — `import from "$app/stores"` (use `$app/state`).
- `structural:writable-banned` — Svelte 4 `writable()`/`readable()` (use `$state`).
- `structural:inline-svg-banned` — Inline `<svg>` with >2 child elements outside `components/`.
- `structural:effect-no-cleanup` — `$effect` without `return () => {}` cleanup.
- `structural:effect-single-call` — `$effect` that only calls a single function with no reactive deps (use `onMount`).
- `structural:effect-present` — Any `$effect` warrants review (warning).
- `structural:onmount-no-browser-api` — `onMount` without `localStorage`/`sessionStorage`/DOM ref/WebSocket.
- `structural:store-should-use-derived` — `$effect` syncing `data`/`$props` into `$state` (use `$derived`).
- `structural:derived-calls-fetch` — `$derived` calling `fetch` or a service method.
- `structural:raw-fetch` — Raw `fetch` in `services/` (use the `openapi-fetch` client). Suppress with `// noqa: raw-fetch — <reason>`.
- `structural:missing-service-interface` — Public service class without an explicitly implemented capability interface.
- `structural:factory-static-only` — `AppFactory` (and any `*Factory.ts` / `/factories/` file) must use static methods only.
- `structural:hooks-locals-limited` — `hooks.server.ts` may set only `locals.user`.

### Import boundaries

- `import-boundary:*` — services/controllers/routes/stores only import what their row of the Constraints table permits. See `references/layers.md`.

### Complexity

- `complexity:page-loc-limit` — `+page.svelte` > 100 LoC (hard error).
- `complexity:page-loc-warning` — `+page.svelte` > 80 LoC (warning, suppressible).
- `complexity:controller-loc-limit` — Controller method > 40 LoC.
- `complexity:loader-loc-limit` — `load`/form action > 20 LoC.

### API endpoints

- `api:request-handler-outside-api` — `RequestHandler` export outside `src/routes/api/`.
- `api:route-count-ratio` — API routes exceed 20% of page routes (warning).

### Concurrency

- `concurrency:promise-all-warning` — `Promise.all` across services in a loader (use a controller).

### Error flow

- `error-flow:raw-http-status` — Raw HTTP status outside `error_handlers` / API `+server.ts` JSON return. API routes under `src/routes/api/**/+server.ts` may `return json(payload, { status })`.

### Project structure

- `project-structure:*` — `pnpm`-only, `frontend/.env` / `backend/.env` separation, etc. (see `constraints.md` §5).

### Tests (paired with `qa` skill)

Use the [QA skill](../qa/SKILL.md) for test boundaries, assertions, doubles, and review.
Read the active project's instructions for test placement, commands, and current audit rules.
Do not treat assertion counts or a generic directory layout as test-quality principles.
If a checker conflicts with the QA guidance, report the constraint and keep the checks passing;
do not suppress it or change the checker without an explicit task to align enforcement.

### Suppression

Inline `// noqa: rule-id — <reason>` (TypeScript) or `<!-- noqa: rule-id — <reason> -->` (Svelte). A suppression without a reason string fails the check.
