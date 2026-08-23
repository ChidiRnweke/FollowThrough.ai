## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, drizzle, mcp, experimental

For UI design decisions (tokens, style, components) and UX patterns, see @DESIGN_SYSTEM.md.

Run `pnpm test:architecture` after structural or test changes. Its project-specific topology and
test-quality audits supplement Chisel; do not silence one checker to satisfy another.

`node` is not on `PATH` by default — prepend the nvm bin directory before any `pnpm` script.

## Seeing the running app

Auth stays enabled in dev, so an unauthenticated request to any `(app)` route `303`s to
`/auth/login`. **You do not need Authentik to look at the UI.** `tests/auth.setup.ts` mints a
session row straight into Postgres for the local user and caches the token in
`tests/.auth/state.json`; `pnpm test:e2e` and `pnpm dev:e2e` both run it. Once that file exists,
reuse the token directly:

```bash
TOK=$(python3 -c "import json;print(json.load(open('tests/.auth/state.json'))['cookies'][0]['value'])")
curl -s -H "Cookie: session=$TOK" http://127.0.0.1:5173/today
```

Delete `tests/.auth/state.json` to force a fresh token. This is the fastest way to check
server-rendered output — cookie-driven shell state, redirects, `+page.server.ts` exports that
`svelte-check` cannot see — without a browser. Add cookies to the same header to exercise
persisted UI preferences (`sidebar_state`, `sidebar_width`).

## Where things live

`src/lib/` is split by role, and the audits enforce the direction of imports between them:

| Directory                      | Holds                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `models/<domain>/`             | Pure types and logic shared by client and server. No I/O, no framework. |
| `server/services/<domain>/`    | Server-only logic against repositories.                                 |
| `server/controllers/<domain>/` | Orchestration across services; the only cross-service seam.             |
| `remote/<domain>/`             | Zod-validated `query`/`command` — the sole UI→server entry point.       |
| `stores/<area>/`               | Client `$state` singletons (`workbench`, `rightPanel`, `palette`, …).   |
| `client/<area>/`               | Browser-only helpers: IndexedDB repositories, sync, drag payloads.      |
| `hooks/`                       | Reactive environment wrappers (`IsMobile`, `IsDockedPanel`).            |
| `components/ui/`               | Vendored shadcn-svelte primitives. **Ours to edit** — not a dependency. |
| `components/<feature>/`        | App components. `components/shell/` is the app chrome.                  |
| `testing/`                     | `InMemory*` fakes; never reach for a mocking library instead.           |

Two locations are easy to miss:

- **All design tokens and app-level component CSS live in `src/routes/layout.css`**, not beside the
  components they style — including the workspace pane geometry and the sidebar shell rules.
  `components.json` points shadcn at this same file.
- **The app shell is `src/routes/(app)/+layout.svelte`**: a three-column flex row of
  `AppSidebar` | `Sidebar.Inset` | `RightPanel`. It is the only place that can see all three at
  once, so cross-column decisions (space budgets, which surface owns a gesture) belong there rather
  than inside any one column.

## Tailwind class merging in slotted primitives

`cn()` is `clsx` + `tailwind-merge`: on conflicting utilities the **last** class wins. Every
primitive appends its caller's `class` last, so a caller can always override.

The trap is the reverse case — a `<Button>` passed into another primitive's `child` snippet. The
receiving primitive's classes arrive as Button's `className` and therefore win, but only for
utilities that actually conflict. Anything in `buttonVariants` **base** with no counterpart
survives: `justify-center`, `font-medium`, `inline-flex`, `whitespace-nowrap`. A folder row in the
project tree once centred its own label this way while every sibling row sat flush left. When
slotting a Button into a sidebar/menu primitive, neutralise those explicitly on the _outer_
primitive's `class`.

## Adding a controller capability

A new controller method needs all of these, or `svelte-check` / the audits fail:

1. Interface + implementation in `src/lib/server/controllers/<domain>/controller.ts`.
2. New constructor dependencies are wired in `src/lib/server/application.ts`, which may not
   import services or construct anything itself — expose collaborators through the matching
   capability factory (e.g. `src/lib/server/factories/capabilities/deliverables-capability-factory.ts`).
3. UI access goes through a zod-validated `query`/`command` in `src/lib/remote/<domain>/`.
4. Classify the method in the `AgentToolCoverage` map in `src/lib/server/factories/agent/agent-tool-factory.ts`.
   The map is total over each controller's methods; a missing entry is a type error.

Boundary logging and tracing are automatic: `ProductionControllerFactory` wraps every
controller with `instrumentedController` (one `domain.method` span, info before / debug
after / warn on `DomainError` / error otherwise, all carrying the span's trace id). Do not
add boundary logs at call sites; log at `debug` inside services for detail. `LOG_LEVEL`
(platform key, never a secret) gates debug records — debug in dev, info in prod.

## Layering rules the audits enforce

- Each `src/lib/models/<domain>/` domain is self-contained: no imports of sibling files in the
  same domain, and never imports from `components/`.
- Services may not import other services; orchestrate across services in a controller.
- Pure logic shared by client and server belongs in `models/`; server-only logic in `services/`.

## Failing loudly (audit-enforced)

`scripts/audit-source.ts` ratchets these against a migration baseline: existing sites are
tolerated, new ones fail `pnpm test:architecture`. Lower the baselines as sites are fixed; never
raise them. The escape hatch is a `// audit-allow: <rule> — <reason>` comment on the line above,
and the reason is the point — it puts the justification in the diff where a human can audit it.

- **No type assertion onto an object literal** (`shape-cast`). `value as never` on a single
  branded id is fine — the value is one thing and the reader can see it. `{ … } as never` turns
  off field-by-field checking for a shape nobody verified. That is exactly how a required
  `conversationId` came to be fed an optional one, compiled clean, and failed against the database
  on every new chat's first message.
- **No silent `catch`** (`silent-catch`). A `catch` that neither rethrows nor does anything
  observable swallows the failure. Any call inside it — a log, a toast, a metric, a recovery that
  reports itself — satisfies the rule.

## Defaults, limits, and blast radius

Judgement rules, not audited. They exist because each has already cost this codebase a defect.

- **Never supply a default that makes a failure look like a success.** If the code cannot tell
  "there is no data" from "the lookup failed", it must not default. A fallback that silences a
  missing seed, an absent row, or an unreachable service converts a loud bug into a quiet wrong
  answer, and the next person to see it will be a user.
- **No cap, window, or limit on a read without citing the measurement that motivated it.** A
  guessed window is silent data loss, not an optimisation — bounding a transcript scan to "the
  last 100" makes anything older vanish with no error and no way to tell.
- **Optionality must be honest.** A type describing something already decided carries no optional
  fields for things that were decided. Request shapes and frozen/resolved shapes are different
  types even when they look alike.
- **A missing value is usually a data bug, not a plumbing bug.** Before adding a field or a channel
  to carry it, find where it is produced and ask why it is not recorded there.
- **Blast radius is a signal, not a score.** If fixing one call site means adding a required field
  to a shared type, stop and re-derive. Unrelated construction sites needing a value they do not
  have is evidence the fix is at the wrong altitude, not evidence of thoroughness.
- **A fake or fixture must not represent a state production cannot produce.** A fixture encoding an
  impossible state teaches the bug to everyone who copies it.

## Test conventions (audit-enforced)

- Exactly one `expect` per `it()`; the legacy multi-assertion baseline must not grow.
- No `vi.fn`, `toHaveBeenCalled*`, or hand-rolled mocks. Use the `InMemory*` fakes under
  `src/lib/testing/` with `capabilityDependencies<Deps>({ ... })`; for function-typed
  dependencies use a typed recording closure.
- One spec file per concern, colocated with the unit under test (see
  `src/lib/server/controllers/todos/extract-promises.spec.ts`).

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
