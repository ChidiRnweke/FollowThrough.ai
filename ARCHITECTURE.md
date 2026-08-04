# Capability-First Layered Architecture

FollowThrough is a SvelteKit TypeScript monolith. Its directory structure names the product's
capabilities first; frameworks and infrastructure appear only at delivery boundaries.

## Layer × capability matrix

| Layer                 | Responsibility                                        | Capability children                                                                                                                                                           |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`              | Self-contained domain and use-case data               | identity, projects, notes, todos, memory, relationships, references, diagrams, suggestions, skills, attachments, deliverables, agent, knowledge-search, provenance, workspace |
| `remote`              | Stable SvelteKit remote-function delivery             | agent, settings, projects, notes, todos, relationships, references, diagrams, suggestions, skills, memory, attachments, deliverables, feedback                                |
| `client`              | Browser transports and orchestration                  | agent, notes, todos, workbench, diagrams, attachments, suggestions, observability                                                                                             |
| `stores`              | Reactive state and state mutations only               | agent, note-workbench, workbench, shell, todos, project-tree                                                                                                                  |
| `components`          | Product presentation                                  | shell, agent, chat, notes, todos, projects, memory, attachments, artifacts, suggestions, skills, settings, today                                                              |
| `server/controllers`  | Cross-service orchestration                           | one directory per capability                                                                                                                                                  |
| `server/services`     | Business rules; interface and implementation together | one directory per capability                                                                                                                                                  |
| `server/repositories` | Persistence contracts and adapters                    | `<capability>/{contract,postgres,...}.ts`                                                                                                                                     |
| `server/db/schema`    | Drizzle registry modules                              | one module per persisted capability; `index.ts` is the registry                                                                                                               |
| `testing`             | Reusable fakes and fixtures                           | one directory per capability                                                                                                                                                  |

`components/ui` is the shadcn registry. `components/edra` is the vendored editor boundary.
`components/icons`, `components/marketing`, and `components/layout` are intentional presentation
boundaries rather than product-capability buckets.

The root-level `server/*-capability-factory.ts` modules are composition helpers, not another
application layer. Each exports one typed `create<Capability>Capability` function. Those functions
instantiate and connect the existing repositories, services, and controllers for one capability;
they contain no queries or business rules. `server/application.ts` calls them in dependency order
and constructs the final controller facade. A typed `finalize(...)` step or lazy callback may close
a composition-time cycle, but placeholder casts and post-construction mutation are forbidden.

## Dependency rules

- Routes and remotes delegate to controllers and preserve their public request/response shapes.
- Controllers may coordinate service contracts. Domain decisions belong in services.
- Services import models and repository contracts only. A service never imports another service.
- Repositories own Drizzle, SQL, and other persistence behavior and map immediately to models. A
  composition factory may receive the database handle solely to construct a repository.
- Stores contain reactive state and mutations; browser transports and URL/session adapters live in
  `client`.
- Models are leaf modules. Every capability model entry is self-contained and imports no other
  model capability.
- Cross-capability imports use capability entry points such as `$lib/models/notes` and
  `$lib/components/todos`. Relative imports stay within a capability.
- `src/lib/utils.ts` exports only the shadcn `cn` helper.

## Presentation and editor boundaries

Every product component capability exposes a narrow `index.ts`. Routes and other product
capabilities import that entry; files within the same capability use relative imports. `ui`,
`icons`, `layout`, `shared`, `edra`, and `marketing` are explicit presentation infrastructure
exceptions rather than product capabilities.

Large UI coordinators assemble state and application callbacks; they do not own every rendered
interaction. Chat delegates transcript/turn rendering and composer/context controls, Notes delegates
its pane-responsive utility header and workspace dialogs while its editor adapter delegates media
upload, and Projects delegates recursive tree rows, menus, and drag zones. Those children receive
structural values and explicit callbacks, so they do not become new controllers or services.

Edra owns editor structure: node transactions, opaque references, and pending-reference state. It
does not know product IDs, client transports, repositories, or product dialogs. Product adapters in
`components/notes` translate opaque references to suggestion and diagram models, inject preview and
link resolution, and own review acceptance or rejection through product services.

## Transactions and schema

The workspace operation contract owns `AtomicOperation`; presentation utilities do not. Services
request atomic work through that contract, while repositories implement persistence inside the
provided transaction. The Drizzle registry at `server/db/schema/index.ts` re-exports the exact
capability schemas for migrations and tooling. It does not become a shared query module: concrete
repositories import their capability schema modules directly.

PostgreSQL contracts mirror those capability boundaries under `tests/integration/<capability>` and
share actors, timestamps, seed helpers, and connection lifecycle through
`tests/integration/database-harness.ts`. Schema-only invariants live under
`tests/integration/schema`; the contract project remains non-parallel against its shared container.

## Naming and ownership

Use route vocabulary: notes, todos, projects, agent/chat, memory, attachments, skills,
suggestions, diagrams, deliverables, and knowledge-search. A second-level directory is justified
only by a stable subsystem containing several related files. Do not introduce `common`, `core`,
`misc`, `helpers`, generic `pages`/`panels`, global PostgreSQL buckets, or catch-all barrels.

Owned identifiers live with their model. A capability that references a foreign branded ID uses a
local, non-exported structurally compatible alias. Aggregate read models live with the use case
that owns the aggregation. Compile-time compatibility tests protect foreign-ID assignments without
coupling model modules.

## Stable edges

This organization must not change route URLs, exported remote names, loader shapes, database table
names, enum values, migration history, shadcn aliases, or user-visible behavior. The Drizzle
`server/db/schema/index.ts` file is a registry only; repositories import capability schema modules
directly.

## Observability

One trace id spans a user operation end to end. `ProductionControllerFactory` wraps every
controller method through `instrumentedController` (a `domain.method` operation span plus
info-before / debug-after logs, warn on domain errors, error otherwise), and agent runs are
seeded at submit/retry time with the requesting span's W3C traceparent, so `agent.turn` and
its LLM/tool spans join the request's trace instead of opening a detached one. Spans composed
through `traceWorkflow`/`traceOperation` nest under the active workflow; only the bare
auto-instrumented HTTP request context (filtered out of Phoenix) triggers a fresh root.

Logging stays plain `console.*` at call sites. The preload bridge in
`scripts/otel-instrumentation.js` ships every record to the collector with the active span's
trace and span ids attached, and `scripts/log-record.js` lifts tags, exception chains and
domain-error codes into queryable attributes. Debug records are gated by the `LOG_LEVEL`
platform key (never a secret): debug in dev, info in prod. Boundary logging lives in the
factory wrapper alone — controllers and routes must not hand-place their own.

## Verification

`pnpm test:architecture` runs the topology audit, test-quality audit, and the locally pinned Chisel
check. Chisel must use the `tsconfig` named in `chisel.config.json`; replacing `$lib` imports is not
an acceptable workaround for alias-resolution errors.
