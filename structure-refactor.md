# FollowThrough.ai — chisel refactor guide

Hand this to an agent working in the FollowThrough.ai repo. It explains how to
install the checker, what the target architecture is, and what order to do the
work in.

**The checker is the source of truth, not this document.** Counts here are a
snapshot from one run; re-run after every stage. `chisel-js explain <rule-id>`
prints the reasoning for any rule.

---

## 1. Install

```bash
npm install -g @chidirnweke/chisel-js     # or: bun add -g @chidirnweke/chisel-js
chisel-js --version                        # must print 0.2.0 or later
```

**Check the version.** 0.1.x is the old regex-based engine and gives materially
different, worse answers — it reports every layer violation at line 1, cannot
resolve `$lib`, and carries rules that were removed in 0.2.0. If you get 0.1.x,
your global install is stale.

Then, in FollowThrough:

```bash
npx svelte-kit sync          # generates .svelte-kit/tsconfig.json
chisel-js init .             # writes chisel.config.json — commit this
chisel-js check .
```

`svelte-kit sync` matters: `$lib` is defined in the generated
`.svelte-kit/tsconfig.json`. Without it the checker falls back to a default
alias table, which happens to be right for this repo but is a guess.

`chisel-js init` pins `mode: "sveltekit-standalone"` into a committed config so
the rule set cannot change because someone edited a dependency.

Useful flags:

```bash
chisel-js check . --json     # machine-readable, deduplicated messages
chisel-js explain <rule-id>  # what a rule wants and why
chisel-js rules              # every active rule
```

---

## 2. Target architecture

`models → services → controllers → factory`. Dependencies flow one way. Never
backwards, **never sideways**.

```
src/lib/
├── models/            universal — pure data. Imports NOTHING, not even other models.
├── errors.ts          universal
├── utils.ts           universal pure functions
├── components/        client
├── stores/            client
├── client/            browser-only adapters (IndexedDB, transports, hooks)
├── remote/*.remote.ts the crossing point: server body, client-callable stub
└── server/            SvelteKit refuses to bundle this for the client
    ├── db/            Drizzle schema (part of the repositories layer)
    ├── repositories/  persistence — the only place Drizzle may be imported
    ├── services/      one concern each; wraps a capability, returns models
    ├── controllers/   orchestrates services
    ├── config.ts
    └── app-factory.ts concrete assembly, no logic
```

Two rules that decide most questions:

1. **`$lib/server/<name>/` *is* layer `<name>`.** Nothing is server-only by
   convention, only by location. A folder under `server/` that is not a layer
   name is an error. **An adapter for an external capability — an AI client, a
   PDF generator, a mail sender — is a *service*.** Repositories are
   persistence, nothing else.
2. **Never import sideways.** One service never imports another. One controller
   never chains to another. A model never imports another model. The only
   exception is an `index.ts` barrel aggregating its own layer.

When two modules in a layer need the same type, that type is domain data:
**move it to `$lib/models`**. Module-local data is fine; another module
reaching for it is not.

---

## 3. How to work

- **Re-run `chisel-js check .` after every stage.** Findings resolve in
  cascades — moving one directory clears violations in files you never touched.
- **Do not batch stages.** Stage 1 changes what Stage 3 reports.
- **Never suppress to make a number go down.** Suppression exists for the
  genuine exception, and it requires a reason (§9).
- If a rule seems wrong, say so rather than working around it. Several rules
  were found to be wrong during this refactor and were fixed in the checker.

---

## 4. Stage 1 — move the server layers (9 findings, mechanical)

Highest leverage in the whole refactor, and it is a file move plus an import
rewrite. The payoff is not the 9 findings: once these live under `$lib/server`,
**SvelteKit itself turns a component importing a service into a build error**,
which is stronger than anything a linter can tell you.

### 4a. `structure:layer-outside-server` — 4 directories

| Move | To |
|---|---|
| `src/lib/services/` | `src/lib/server/services/` |
| `src/lib/controllers/` | `src/lib/server/controllers/` |
| `src/lib/repositories/` | `src/lib/server/repositories/` |
| `src/lib/factories/` | `src/lib/server/` (the factory files themselves) |

`src/lib/repositories/` holds the interfaces while the adapters are already
under `server/repositories/` — one layer split across two locations. Collapse
it: interface and adapter live together.

### 4b. `structure:unknown-server-folder` — 5 offenders

| Path | What it is | Where it goes |
|---|---|---|
| `src/lib/server/domain/` | AI clients, PDF/DOCX generators, tool registries — these **wrap an external capability and return domain models**, i.e. services | `src/lib/server/services/` |
| `src/lib/server/mcp/` | protocol surface | a service, or `src/routes/mcp/` if it is purely transport |
| `src/lib/server/workers/` | background jobs | a service invoked by the job entry point |
| `src/lib/server/http-errors.ts` | error mapping | `src/lib/errors.ts` if pure, otherwise a service |
| `src/lib/server/secrets.ts` | config | `src/lib/server/config.ts` |

`domain/` is the big one. Do not rename it to `repositories/` — a repository is
persistence. These are services.

**Re-run after Stage 1.** Expect `server-layer-leak` and a chunk of
`banned-layer-import` to have resolved themselves.

---

## 5. Stage 2 — declare the vendored code (config, not a fix)

`src/lib/components/edra/` is a vendored rich-text editor. Its raw HTML and
hardcoded colours are upstream's, not yours, and rewriting them would be
overwritten on the next update. Add it to `chisel.config.json`:

```json
{
  "designSystem": {
    "allowIn": [
      "src/lib/components/ui/",
      "src/lib/components/primitives/",
      "src/lib/components/edra/"
    ]
  }
}
```

This is a statement about where third-party markup lives — a fact about the
repository. It cannot silence a rule on first-party UI. Check the remaining
`component-enforcement` and colour findings after this; a meaningful share are
in `edra/`.

---

## 6. Stage 3 — one service never imports another (39 edges, 24 files)

Nearly all of these import another service's `contracts.ts` for a type.

- **Need the type?** It is domain data. Move it to `$lib/models`.
- **Need the behaviour?** That is what a controller is for. Compose both
  services in a controller and call that.

Note that after Stage 1 the same-layer ban also covers a service importing its
*own* module's `contracts.ts` — the interface must be in the same file as the
implementation (see also `structural:missing-service-interface`).

---

## 7. Stage 4 — delete `src/lib/models/shared.ts` (14 edges, 7 files)

`shared.ts` holds branded IDs (`NoteId`, `ProjectId`, …) that eight other model
files import. That is a dependency graph inside the layer that is supposed to
have none.

**One file per domain, each self-contained, barrelled through `index.ts`:**

```
src/lib/models/
├── notes.ts        NoteId, Note, NoteRevision — the ID lives with its model
├── agent-runs.ts   AgentRunId, AgentRun
├── todos.ts        TodoId, Todo
└── index.ts        export * from './notes'; …
```

Consumers keep importing from the barrel: `import type { Note } from '$lib/models'`.

The barrel does **not** solve this on its own — `index.ts` re-exporting `shared`
still leaves `agent-runs.ts` importing it directly. The IDs have to move to the
domain that owns them.

Do this stage last of the architecture work, and do one file first to see what
it costs before committing to all seven.

---

## 8. Stage 5 — design system, then interfaces and tests

Once the architecture is clean, the rest is mechanical:

- **`component-enforcement:*`** — replace raw HTML with the shadcn equivalent.
  `chisel-js explain component-enforcement:html-button-banned` names the
  component for each element. Check `edra/` is excluded first (§5).
- **`colour:palette-class-banned`** — replace `text-red-500` etc. with semantic
  tokens (`text-destructive`, `text-muted-foreground`). A palette class pins one
  appearance and cannot follow the theme.
- **`typography`/`spacing:arbitrary-value-banned`** — replace `text-[10px]`,
  `w-[400px]` with scale tokens from `app.css`.
- **`structural:inline-style-banned` / `style-block-banned`** — same opinion: no
  CSS outside Tailwind.
- **`structural:missing-service-interface`** (18) — declare `I<ServiceName>` in
  the same file as the service.
- **`project-structure:missing-test-coverage`** (9) — nine services genuinely
  have no spec. Colocated `*.spec.ts` counts.
- **`structural:factory-contains-logic`** (3 files) — `app-factory.ts`,
  `application.ts`, `production-factory.ts` contain branching. Move the decision
  into the layer that owns it.

---

## 9. Genuine exceptions

Two mechanisms, both requiring a reason:

```ts
// chisel-ignore structural:inline-style-banned -- computed drag offset, no class can express it
<div style="left: {x}px">
```

- Line scope: on the violating line or the line directly above.
- File scope: `// chisel-ignore-file <rule> -- <reason>` in the first five lines.
- Markup: `<!-- chisel-ignore <rule> -- <reason> -->`.

**A directive without a reason suppresses nothing** — the violation stands and
`suppression:missing-reason` is added on top.

For whole directories use `chisel-exceptions.json` at the repo root, which is
reviewable in the diff:

```json
{ "exceptions": [
  { "files": ["src/lib/generated/*"], "rules": ["*"], "reason": "Generated; regenerated each build." }
] }
```

---

## 10. Known caveats — push back if these bite

Honest notes from validating the checker against this repo.

1. **`models → models` is the strictest rule here.** It has never been enforced
   anywhere before — `chisel_py`'s equivalent is dead code behind a same-layer
   early return. If deleting `shared.ts` proves worse than the coupling it
   removes, say so; it is one line in the checker to relax.
2. **`structural:missing-service-interface`** demands the `I<Name>` naming
   convention and looks only in the same file. It is defensible but rigid.
3. **Roughly 100 findings are design-system work in `.svelte` files.** That is
   real but low-risk; do it last, and do not let it block the architecture.
4. **The checker's remaining regex rules** (`inline-style-banned`,
   `timers-banned` where still present, the colour token scan) match text, not
   nodes. They were correct on every sample checked here, but if one reports
   something inside a comment or a string, that is the reason — report it.

---

## 11. Definition of done

```bash
chisel-js check .            # exit 0
npx svelte-kit sync && npm run build   # SvelteKit build passes
npm run test
```

The architecture is done when `import-boundary:*`, `server-layer-leak:*` and
`structure:*` are all zero. That is the part that changes how the codebase
behaves; everything else is tidying.
