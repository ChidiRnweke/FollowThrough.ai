<div align="center">
  <img src="static/icons/followthrough-192.png" alt="FollowThrough" width="72" height="72" />
  <h1>followthrough.ai</h1>
  <p><strong>An AI-native note editor you never have to brief — with project-scoped agent memory, a lightweight deadline board, and contextual skills that turn notes into actions, artifacts, and finished deliverables.</strong></p>
</div>

---

**FollowThrough's agent already knows what you're working on.** An AI-native note editor you
never have to brief. The agent carries the whole project — the decisions, the constraints, the
people you're waiting on. You never brief it again.

Paste a standup transcript into a note and you get back a cleaned note, two todos with the right
owner and the right deadline, and an entry proposed for the project's memory. Nothing in the paste
said "31 July"; the project did.

## Why I built it

I was running Claude, Codex, and opencode in terminals inside VS Code, having them write markdown, then rendering that markdown somewhere else to actually read it. Every session started by re-explaining the same project. The context lived in my head, the notes lived in files, the tasks lived nowhere, and the agent knew none of it.

To be fair: a VS Code agent can grep your repo. The friction is everything around that. There is no durable context layer — no project memory that survives the session, no task management the agent can read and write, no clean export of the result to PDF or Word. You can assemble all of that yourself, per project, per machine — or you can work somewhere it already exists.

FollowThrough is the editor those agents should have been running inside.

<!-- SCREENSHOT: hero.png — the Today page at 1440x900, dark mode, with overdue and due-today
     populated. Full window, no browser chrome. -->

> **I want to see this there** — a hero shot of the Today page.

## What it looks like

Six screenshots belong here. The capture brief for each — route, viewport, theme, and what has to
be on screen — is in [`docs/screenshots/CAPTURE_PLAN.md`](docs/screenshots/CAPTURE_PLAN.md).

|                                                                                                                                   |                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| <!-- SCREENSHOT: today-triage.png --> **I want to see this there** — Today: overdue, due today, waiting on, pinned.               | <!-- SCREENSHOT: note-split.png --> **I want to see this there** — the editor with two notes side by side.                          |
| <!-- SCREENSHOT: board.png --> **I want to see this there** — the board, with a card mid-drag.                                    | <!-- SCREENSHOT: transcript-to-todos.png --> **I want to see this there** — extracting todos from a transcript, suggestions inline. |
| <!-- SCREENSHOT: agent-approval.png --> **I want to see this there** — an agent run paused on a tool-approval card, diff visible. | <!-- SCREENSHOT: artifacts.png --> **I want to see this there** — the artifacts list with a generated PDF.                          |

A short screen recording of `paste transcript → accept suggestions → open the board` would carry
more than all six stills. **I want to see that there too.**

The public landing page at `/` shows the same transformations rebuilt in HTML, so it works before
any of these are captured.

## The five moves

```text
Note            → Card
Selection       → Diagram
Selection       → Image
Project context → Draft
Draft           → Deliverable
```

Agents propose. The user accepts. Nothing important is committed silently, and everything
generated stays connected to the note it came from.

## Running it locally

**Prerequisites** — Node 22, pnpm, Docker (for Postgres), and an Infisical project holding the
application config.

```sh
pnpm install
cp .env.example .env          # Infisical bootstrap values only
pnpm db:start                 # Postgres with pgvector, via docker compose
pnpm dev
```

Configuration is loaded from Infisical before the SvelteKit server is imported, in both dev and
production. `.env` carries only the `INFISICAL_*` bootstrap values; database, object-storage, and
model settings live in the Infisical project, with `.env.infiscal.example` as the reference
template for those. `DATABASE_URL` and `OPENROUTER_API_KEY` are required; other values fall back to
the defaults in that template. Shell variables win over `.env`.

Auth is disabled in single-user dev mode, so `/` redirects straight to `/today`. Append `?landing`
to reach the public landing page while working on it.

**Schema changes.** The dev database is push-managed:

```sh
pnpm db:push        # dev — apply the schema directly
pnpm db:generate    # generate a migration for production
pnpm db:studio      # browse the data
```

`pnpm db:migrate` is not usable against the dev database — its journal is out of sync. After
`db:generate`, apply new columns to dev with `psql` (or `db:push`) rather than running the migrate
task locally.

**Checks and tests.**

```sh
pnpm check          # svelte-check
pnpm lint           # prettier + eslint
pnpm format         # prettier --write

pnpm test           # unit: client + server projects
pnpm test:repository  # contracts, against PGlite
pnpm test:evals       # model evals, reported to Phoenix
npx playwright test   # end-to-end
```

Vitest is split into four projects — `client`, `server`, `contracts`, and `evals` — so a change to
a repository can be checked against a real schema without booting the app.

## Architecture

| Where                           | What                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/routes/(app)/`             | Every authenticated page. Guarded in `src/hooks.server.ts` and again in `(app)/+layout.server.ts`.       |
| `src/routes/(marketing)/`       | The public landing page at `/`. The only unauthenticated route besides `/auth/*`.                        |
| `src/lib/remote/*.remote.ts`    | SvelteKit remote functions — the client-to-server surface.                                               |
| `src/lib/server/app-factory.ts` | `AppFactory` / `ControllerFactory`. Wiring lives here; routes ask the factory, never construct services. |
| `src/lib/server/db/schema.ts`   | The Drizzle schema — ~40 tables, notes through agent runs.                                               |
| `src/lib/services/retrieval/`   | Indexing, semantic search, and reranking over `search_chunks` (`halfvec(3072)`, pgvector).               |
| `src/lib/components/edra/`      | The vendored TipTap 3 editor.                                                                            |
| `src/lib/components/ui/`        | shadcn-svelte primitives. Custom icons in `src/lib/components/icons/`.                                   |

UI conventions — tokens, type scale, the interaction contract — are in
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). Read it before adding a component.

## Observability

Agent runs are instrumented with OpenTelemetry and exported to Arize Phoenix, so every model call,
tool call, and retrieval is inspectable after the fact.

<!-- SCREENSHOT: llm-traces.png and llm-spans.png already exist in docs/screenshots/ -->

![Agent run traces in Phoenix](docs/screenshots/llm-traces.png)

![Span detail for a single agent run](docs/screenshots/llm-spans.png)

Collector config is in `otel-collector-config.yaml`; the Node instrumentation bootstrap is
`scripts/otel-instrumentation.js`, loaded via `--import` in `pnpm start`.

## Deployment

Komodo supplies only the `INFISICAL_*` bootstrap variables plus the direct `OTEL_*` and `PHOENIX_*`
telemetry variables.

Before the first deployment, and before every release containing Drizzle migrations, run the
one-shot setup profile:

```sh
docker compose -f docker-compose.prod.yml --profile setup run --rm migrate
```

It provisions or rotates the database role, stores `DATABASE_URL` in the application Infisical
project, and runs committed migrations before exiting. Deploy or restart `app` once it succeeds.

## Why it exists

The long version — the workflow this replaces, what each concept is for, and how agents are
expected to behave — is in [`docs/VISION.md`](docs/VISION.md).

The short version:

> **Think in notes. Track what matters. Preserve the context. Finish the work.**
