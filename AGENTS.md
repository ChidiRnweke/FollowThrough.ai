## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, drizzle, mcp, experimental

UI design decisions (tokens, styles, components, UX patterns) are in @docs/design/design-system.md. The
published docs live at <https://chidirnweke.github.io/FollowThrough.ai/> with source in `docs/`.

Before architecture work, read any ADR in `docs/src/content/docs/decisions` whose title may
explain the area you are changing. Run `pnpm test:architecture` after structural or test changes;
its topology and test-quality audits supplement Chisel — do not silence one checker to satisfy
another.

`node` is not on `PATH` by default — prepend the nvm bin directory before any `pnpm` script.

## Commit messages

Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): a type
from the Angular set (`feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`,
`style`, `revert`), an optional free-form scope, then a lowercase subject —
`feat(agent): type the tool executor seam and its call ids`. Use `!` or a `BREAKING CHANGE:`
footer for breaking changes.

Enforcement is server-side and applies to every PR: `commitlint` checks the PR's commits, and a
separate check validates the PR title (under squash-merge the title is the commit that lands).
There are no local hooks. A rejected message means rewriting it before merge; a rejected commit
already on the branch can be reworded with a rebase.

## How changes land

`master` is protected and shared by several agents; work in a linked worktree on a task branch,
never on the main checkout or directly on `master`.

```bash
git worktree add ../<task-slug> -b <type>/<task-slug> origin/master
cd ../<task-slug> && pnpm install
```

- One PR per coherent task. Finish the work, commit conventionally (see Commit messages), push
  the branch, and open the PR with `gh pr create --head <branch> --title "<type(scope): subject>"`
  and a body following the PR context standard below.
- A PR is done when its required checks pass: `commitlint`, `pr-title`, `quality` (lint, check,
  architecture, docs check), `unit` (node and browser), and `contracts`. Run the cheap gates
  locally first (`pnpm lint`, `pnpm check`, `pnpm test:architecture`, `pnpm test:unit`) instead
  of spending CI cycles on preventable failures. The e2e suite is not part of CI.
- Address review by committing, or by rebasing the branch and pushing with `--force-with-lease`.
- Each agent owns its worktree and branch: do not edit, reset, or delete another worktree or its
  branch, and never push to `master` from anyone's worktree.
- Releases are cut through release-please release PRs. Do not tag, bump versions, or edit
  `CHANGELOG.md` by hand.
- Remove your worktree (`git worktree remove`) and delete the branch once the PR is merged or
  the task is abandoned.

## PR context and evidence

Use the `drafting-prs` skill to prepare or revise a PR. It is installed identically under
`.agents/skills/`, `.claude/skills/`, and `.opencode/skills/`; keep all three copies in sync.
Write in Simplified Technical English: short sentences, active voice, common words, and
consistent terms. Use the template's four sections: **Why**, **What changed**, **Evidence**,
and **Validation**.

Preserve the original problem and intended outcome. Explain previous and resulting behavior
so a future reader can understand the PR without the diff or conversation. Omit work diaries,
file inventories, filler, and irrelevant details. Include only observed validation results.

For UI issues, attempt reproduction before editing. Use the authenticated Playwright setup
below. You may seed valid, representative data in the local development/test database; record
the setup and clean up only your scenario's data. Avoid live LLM calls when seeded data can
expose the UI state. If an intricate LLM-dependent issue cannot reasonably be reproduced,
explain the limitation and distinguish seeded verification from end-to-end evidence.

Visible frontend changes need actual before/after screenshots, or starting-state/result images
for new UI. Match the viewport, theme, data, and interaction state where possible. Give each
image descriptive alt text and a visible caption explaining the state and result. Never invent
a missing before capture. Commit selected images under `docs/pr-evidence/<task>/` and embed
commit-pinned raw URLs in the PR; see the skill for the URL format. Keep temporary captures in
ignored `artifacts/` and exclude credentials and private content.

Use relevant merged PR history as a source of truth for original intent and observed behavior
at the time. Search it when code or docs leave the reason unclear. Check it against current code
and accepted ADRs; later decisions can supersede it, and unmerged proposals do not establish
current behavior.

## Documentation placement

Keep root documents for project entry points and contribution instructions. Put architecture
references in `docs/architecture/`, design guidance in `docs/design/`, and plans in
`docs/plans/`. The design digest is derived; `docs/design/design-system.md` is authoritative.
Published site content stays under `docs/src/content/docs/`. Update links and audit paths when
moving maintained documents. Delete obsolete handoffs after their work lands.

## Seeing the running app

Auth stays enabled in dev, so an unauthenticated request to any `(app)` route `303`s to
`/auth/login`. You do not need Authentik to look at the UI: `tests/auth.setup.ts` mints a session
row straight into Postgres and caches the token in `tests/.auth/state.json`. `pnpm test:e2e`
runs this setup; `pnpm dev:e2e` only starts the server. Reuse the token directly:

```bash
TOK=$(python3 -c "import json;print(json.load(open('tests/.auth/state.json'))['cookies'][0]['value'])")
curl -s -H "Cookie: session=$TOK" http://127.0.0.1:5173/today
```

Delete `tests/.auth/state.json` to force a fresh token. This is the fastest way to check
server-rendered output — cookie-driven shell state, redirects, `+page.server.ts` exports — without
a browser. Add cookies to the same header to exercise persisted UI preferences (`sidebar_state`,
`sidebar_width`).

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

- **All design tokens and app-level component CSS live in `src/routes/layout.css`**, not beside
  the components they style — including the workspace pane geometry and the sidebar shell rules.
  `components.json` points shadcn at this same file.
- **The app shell is `src/routes/(app)/+layout.svelte`**: a three-column flex row of
  `AppSidebar` | `Sidebar.Inset` | `RightPanel`. It is the only place that can see all three at
  once, so cross-column decisions (space budgets, which surface owns a gesture) belong there
  rather than inside any one column.

## Tailwind class merging in slotted primitives

`cn()` is `clsx` + `tailwind-merge`: on conflicting utilities the **last** class wins. Every
primitive appends its caller's `class` last, so a caller can always override.

The trap is the reverse case — a `<Button>` passed into another primitive's `child` snippet: the
receiving primitive's classes arrive as Button's `className` and therefore win, but only for
utilities that actually conflict. `buttonVariants` **base** has no counterpart for
`justify-center`, `font-medium`, `inline-flex`, and `whitespace-nowrap`, so those survive. When
slotting a Button into a sidebar/menu primitive, neutralise them explicitly on the _outer_
primitive's `class`.

## Adding a controller capability

A new controller method needs all of these, or `svelte-check` / the audits fail:

1. Interface + implementation in `src/lib/server/controllers/<domain>/controller.ts`.
2. New constructor dependencies are wired in `src/lib/server/application.ts`, which may not
   import services or construct anything itself — expose collaborators through the matching
   capability factory (e.g. `src/lib/server/factories/capabilities/deliverables-capability-factory.ts`).
3. UI access goes through a zod-validated `query`/`command` in `src/lib/remote/<domain>/`.
4. Classify the method in the `AgentToolCoverage` map in
   `src/lib/server/factories/agent/agent-tool-factory.ts`. The map is total over each controller's
   methods; a missing entry is a type error.

Boundary logging and tracing are automatic (`instrumentedController` wraps every controller):
one `domain.method` span, info before / debug after / warn on `DomainError` / error otherwise,
carrying the span's trace id. Do not add boundary logs at call sites; log at `debug` inside
services for detail. `LOG_LEVEL` (platform key, never a secret) gates debug records — debug in
dev, info in prod.

## Layering rules the audits enforce

- Each `src/lib/models/<domain>/` domain is self-contained: no imports of sibling files in the
  same domain, and never imports from `components/`.
- Services may not import other services; orchestrate across services in a controller.
- Pure logic shared by client and server belongs in `models/`; server-only logic in `services/`.

## Failing loudly (audit-enforced)

`scripts/audit-source.ts` enforces these at zero: there is no migration baseline and existing code
is not grandfathered. The escape hatch is a `// audit-allow: <rule> — <reason>` comment on the line
above, and the reason is the point — it puts a genuinely unavoidable boundary exception in the
diff where a human can audit it. An allowance is not a migration mechanism.

- **No type assertion onto an object literal** (`shape-cast`). `value as never` on a single
  branded id is fine — the value is one thing and the reader can see it. `{ … } as never` turns
  off field-by-field checking for a shape nobody verified; a required `conversationId` was once
  fed an optional one this way.
- **No silent `catch`** (`silent-catch`). A `catch` that neither rethrows nor does anything
  observable swallows the failure. The checker accepts exactly two things, and a log is not one
  of them: **rethrow**, or **return an explicit failure result** — an object literal whose `kind`
  is `'corrupt'`, `'error'` or `'failure'`. A `console.warn` and a bare `return null` still fail
  the audit, so the shape of the fix is decided for you: make the failure a value the caller has
  to read, and let the caller decide. Add a toast or a log _as well_ where an operator or a user
  needs to know; it is never the thing that satisfies the rule. `audit-allow` is for the case
  where the recovery genuinely reports itself somewhere the type cannot show — say the returned
  placeholder that lands in a rendered document — and the reason must name where.

## Type narrowing (ADR 0037)

Parse external data into narrow types at the boundary; inward of the boundary, resolved types are
total. The pattern catalog with remedies lives in @docs/architecture/type-narrowing.md; the decision and its limits
are in ADR 0037.

- Parsing happens only in the parse zones: `remote/`, the DB mappers and repository read paths,
  the provider event mappers, and the client event/storage readers. Schemas live in `models/`
  next to the type they produce. Services and controllers never parse — they receive narrow
  values from both directions.
- `unknown` type positions, `Record<string, unknown>`, `isRecord`-style guards, cast-probes
  (`x as { a?: unknown }`), `JSON.parse` casts, and `z.unknown()` schemas are banned in the
  strict layers (`models/`, `services/`, `controllers/`) and on their way to zero everywhere
  else. `scripts/audit-source-rules.ts` gains one zero-baseline rule per pattern as its fix
  batch lands; do not add new occurrences — there is no grandfathering.

## Defaults, limits, and blast radius

Judgement rules, not audited. They exist because each has already cost this codebase a defect.

- **Never supply a default that makes a failure look like a success.** If the code cannot tell
  "there is no data" from "the lookup failed", it must not default. A fallback that silences a
  missing seed, an absent row, or an unreachable service converts a loud bug into a quiet wrong
  answer, and the next person to see it will be a user.
- **No cap, window, or limit on a read without citing the measurement that motivated it.** A
  guessed window is silent data loss, not an optimisation.
- **Optionality must be honest.** A type describing something already decided carries no optional
  fields for things that were decided. Request shapes and frozen/resolved shapes are different
  types even when they look alike.
- **Two optional fields that are always absent together are one fact, and must be one field.**
  Apply the test mechanically, to every type you write or touch: for each pair of optional
  fields, ask whether a value with one present and the other absent is producible. If it is not,
  the pair is illegal-states-representable and the type is wrong. There are exactly two fixes and
  no third:
  1. They vary together and carry no separate meaning — make the _containing thing_ optional and
     both fields required (`SessionCanvas` had `subject?` and `tab?`; it became
     `SessionCanvas | undefined`).
  2. Which fields are present depends on a state — make that state a discriminated union and hang
     each payload off the arm that can have it (`ToolActivity` had `output?`, `failure?` and
     `decision?` beside a five-value `status`).

  This is not a style preference, and `strict` mode cannot see it. A boolean beside an optional
  payload is the same defect: `{ ready: boolean; tab?: TabId }` is three states, so it is three
  arms.

- **Push the disjunction up, never down.** The caller that knows whether a value exists is the
  caller that decides. A function must not accept `T | undefined` merely so its caller can skip
  an `if`: that hands every function below it a case it can do nothing about, and each one
  answers by inventing a passive default. Make the function total over what it actually needs,
  and narrow once at the top.
- **A missing value is usually a data bug, not a plumbing bug.** Before adding a field or a channel
  to carry it, find where it is produced and ask why it is not recorded there.
- **Blast radius is a signal, not a score.** If fixing one call site means adding a required field
  to a shared type, stop and re-derive.
- **A fake or fixture must not represent a state production cannot produce.** A fixture encoding an
  impossible state teaches the bug to everyone who copies it.

## Test conventions (audit-enforced)

- Exactly one `expect` per `it()`; the legacy multi-assertion baseline must not grow.
- No `vi.fn`, `toHaveBeenCalled*`, or hand-rolled mocks. Use the `InMemory*` fakes under
  `src/lib/testing/` with `capabilityDependencies<Deps>({ ... })`; for function-typed
  dependencies use a typed recording closure.
- One spec file per concern, colocated with the unit under test (see
  `src/lib/server/controllers/todos/extract-promises.spec.ts`).
