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

## Dependency rules

- Routes and remotes delegate to controllers and preserve their public request/response shapes.
- Controllers may coordinate service contracts. Domain decisions belong in services.
- Services import models and repository contracts only. A service never imports another service.
- Repositories own Drizzle and other persistence technology and map immediately to models.
- Stores contain reactive state and mutations; browser transports and URL/session adapters live in
  `client`.
- Models are leaf modules. Every capability model entry is self-contained and imports no other
  model capability.
- Cross-capability imports use capability entry points such as `$lib/models/notes` and
  `$lib/components/todos`. Relative imports stay within a capability.
- `src/lib/utils.ts` exports only the shadcn `cn` helper.

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

## Verification

`pnpm test:architecture` runs the topology audit, test-quality audit, and the locally pinned Chisel
check. Chisel must use the `tsconfig` named in `chisel.config.json`; replacing `$lib` imports is not
an acceptable workaround for alias-resolution errors.
