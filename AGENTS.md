## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, drizzle, mcp, experimental

For UI design decisions (tokens, style, components) and UX patterns, see @DESIGN_SYSTEM.md.

Run `pnpm test:architecture` after structural or test changes. Its project-specific topology and
test-quality audits supplement Chisel; do not silence one checker to satisfy another.

## Adding a controller capability

A new controller method needs all of these, or `svelte-check` / the audits fail:

1. Interface + implementation in `src/lib/server/controllers/<domain>/controller.ts`.
2. New constructor dependencies are wired in `src/lib/server/application.ts`, which may not
   import services or construct anything itself — expose collaborators through the matching
   capability factory (e.g. `src/lib/server/deliverables-capability-factory.ts`).
3. UI access goes through a zod-validated `query`/`command` in `src/lib/remote/<domain>/`.
4. Classify the method in the `AgentToolCoverage` map in `src/lib/server/agent-tool-factory.ts`.
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
