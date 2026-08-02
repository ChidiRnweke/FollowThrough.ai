# Test waterfall manifest

A living scan of the test suite and the forward test backlog. It supersedes the
former `docs/TEST_GAPS.md` (folded in on 2026-08-02) and keeps the expensive lanes
(E2E, full-browser component) small and boundary-justified while the cheaper lanes
(node unit, browser-focused, integration) absorb the behavioral detail.

Coverage should flow **downward** — E2E → integration → component/unit — while
preserving a small amount at each higher boundary. For every test case the question
is:

> What is the lowest layer that can prove this behavior _without replacing the
> behavior with mocks_?

Every retained test must name the boundary that justifies it. When a test cannot
name a necessary boundary, that is evidence it can move down.

## Layers and what each can prove

| Lane                        | Location                                  | Count              | Runtime                                                | Can prove                                                                               | Cannot prove                                         |
| --------------------------- | ----------------------------------------- | ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **E2E**                     | `tests/**/*.e2e.ts`                       | 66 tests / 8 files | Playwright against a real dev/preview server           | SSR, hydration, real browser layout, navigation, service worker, offline, wire payloads | —                                                    |
| **Integration (contracts)** | `tests/integration/**/*.contract.spec.ts` | 16 files           | Vitest + testcontainers PostgreSQL                     | SQL semantics, transactions, FK/cascade, unique/partial indexes, schema migrations      | DOM, focus, routing                                  |
| **Browser component**       | `src/**/*.svelte.spec.ts`                 | 17 files           | vitest-browser, headless Chromium, no SvelteKit server | Component DOM, focus semantics, IndexedDB, real layout _of a component_                 | SSR, routing, server data                            |
| **Node unit**               | `src/**/*.spec.ts` (non-svelte)           | ~140 files         | Vitest node, injected fakes                            | Domain logic, command mapping, store state, service/controller orchestration            | Any real browser or database behavior                |
| **Evals**                   | `src/evals/**/*.eval.ts`                  | 2 files            | model-backed                                           | Model quality                                                                           | Deterministic behavior (excluded from `test:verify`) |

Notes:

- `browser-focused` (vitest.config.ts:73-82) is a curated 8-file subset of
  `browser-full` (line 98) — a deliberate fast-feedback lane, not a duplicate.
- `scripts/audit-tests.ts` already exempts `.e2e.ts` from the one-assertion rule
  (line 95); it is the enforcement point for the boundary ratchet below.
- Counts are as of the scan date (2026-08-02); re-run the inventory before acting.

## Boundary inventory

A retained test must map to one of these. When none applies, the test should move
down or be deleted:

- **browser focus semantics** — real focus after mount/keydown; focus restoration
- **routing / hydration** — SSR output matches client render; hydration failures
- **SSR shell / no-JS** — server-rendered markup without JavaScript
- **real-browser layout** — overflow, sticky positioning, panel width, touch targets
- **navigation / URL plumbing** — deep links, `?split=`/`?tabs=` state, URL sync
- **persistence across reload** — ratio/tab state restored from storage/URL
- **client-server serialization** — devalue/JSON wire payloads, SSE event framing
- **database transaction / constraint** — rollback, unique/partial index, FK cascade
- **service worker / cache / offline** — SW registration, Cache Storage, offline nav
- **authentication / cookies** — session validation, role gating (e2e setup)
- **IndexedDB** — browser storage round-trips
- **file / download behavior** — export, attachment download

## Pass 1 — E2E scan

Decision meanings: **Keep** (this layer genuinely required), **Move down** (prove
more cheaply below; all cases here are _add-lower-first_), **Split** (detailed cases
down, one representative journey stays), **Remove duplicate** (lower test already
proves it and the higher test adds no boundary).

### `tests/agent-workbench.e2e.ts`

| Line | Title                                                                 | Boundary                            | Decision  | Rationale / move-down target                                                                                                                        |
| ---- | --------------------------------------------------------------------- | ----------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100  | workspace state restores without an SSR hydration mismatch on refresh | routing/hydration                   | Keep      | Hydration mismatch only observable in a real browser with a real SSR payload.                                                                       |
| 127  | Mod+Shift+P opens the shared command palette with shortcut hints      | keyboard-input                      | Keep      | Mapping is unit-covered; the palette _rendering_ with the `⌘K N` hint is not — keep as visual smoke.                                                |
| 147  | Mod+K then Q focuses quick capture                                    | keyboard-input → navigation outcome | Keep      | The `q` → `quick-capture` chord is the one chord missing from `keyboard.spec.ts`; also the real focus outcome. Retain as the canonical chord smoke. |
| 153  | Mod+K then T opens quick todo creation                                | keyboard-input → navigation outcome | Move down | Mapping covered (`keyboard.spec.ts:83`); the `run()` → `goto('/todos?view=board&quickTodo')` outcome → command-registry unit test.                  |
| 159  | Mod+K then C toggles the chat side pane                               | keyboard-input → navigation outcome | Move down | Mapping covered (`keyboard.spec.ts:68`); `rightPanel.toggle('chat')` not asserted by `right-panel.spec.ts` → registry/store unit test.              |
| 165  | Mod+Shift+I opens chat and focuses its composer                       | keyboard-input → navigation outcome | Move down | Mapping covered (`keyboard.spec.ts:88`); composed `run()` sequence → registry unit test.                                                            |
| 171  | Mod+, opens Settings                                                  | keyboard-input → navigation outcome | Move down | Physical-comma mapping covered (`keyboard.spec.ts:100`); `/settings` navigation → registry `run()` unit test.                                       |
| 181  | Mod+K then N creates an untitled note and focuses its title           | keyboard-input → navigation outcome | Keep      | Real note creation + workbench open + focus — genuine integration smoke.                                                                            |
| 189  | renders an approval card with inspected arguments                     | client-server serialization         | Keep      | Wired SSE stream → Review-in-full dialog render; components cover parts, not the wired flow.                                                        |
| 217  | returns a rejection to the same visible conversation                  | client-server serialization         | Keep      | decide → SSE resume → same visible conversation; integration smoke.                                                                                 |
| 258  | sends auto-accept as the conversation execution-mode override         | client-server serialization         | Keep      | Asserts the actual base64-decoded submit payload carries `auto_accept`; transport-level, no unit equivalent.                                        |

### `tests/e2e/note-title.e2e.ts`

| Line | Title                                                              | Boundary                                 | Decision  | Rationale / move-down target                                                                                            |
| ---- | ------------------------------------------------------------------ | ---------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 27   | the note title appears once, in the breadcrumb                     | real-browser layout                      | Keep      | DOM contract (title only in breadcrumb, standalone field absent); no lower spec exists.                                 |
| 34   | the pencil renames the note in place and the breadcrumb follows    | other (rename → autosave → sidebar sync) | Keep      | Server mutation covered (`controllers/notes/rename.spec.ts`); the breadcrumb + sidebar-link update flow is integration. |
| 50   | Escape abandons a title edit                                       | keyboard-input                           | Move down | Pure component cancel-on-Escape → `note-title-inline-input.svelte.spec.ts`.                                             |
| 61   | Enter commits the title and moves the caret into the document body | browser-focus                            | Move down | Enter-commit + caret hand-off is component-orchestrated → title-input/parent-header component spec.                     |

### `tests/e2e/pwa.e2e.ts`

| Line | Title                                                          | Boundary                       | Decision | Rationale                                            |
| ---- | -------------------------------------------------------------- | ------------------------------ | -------- | ---------------------------------------------------- |
| 23   | exposes installable FollowThrough metadata                     | service-worker/cache           | Keep     | Manifest inspection via CDP session; no lower layer. |
| 36   | registers a service worker for the workspace                   | service-worker/cache           | Keep     | SW registration/control requires a real browser.     |
| 46   | reopens a visited note from the cached workspace while offline | offline + service-worker/cache | Keep     | Real offline navigation through the page-data cache. |
| 64   | uses the offline fallback for an uncached route                | offline + service-worker/cache | Keep     | Navigation fallback to `/offline`; browser-only.     |
| 72   | keeps remote functions and API responses out of Cache Storage  | service-worker/cache           | Keep     | Cache Storage inspection is browser-only.            |

### `tests/e2e/responsive.e2e.ts` (loop-expanded)

| Line  | Title                                                                                                                                                                                             | Boundary                          | Decision  | Rationale                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------- | ----------------------------------------------------------------------- |
| 25 ×8 | `<viewport> shell has no document-level horizontal overflow` (small mobile 320×568, base mobile 375×667, phone landscape 667×375, sm 640×800, md 768×900, lg 1024×900, xl 1280×900, 2xl 1536×960) | real-browser layout               | Keep      | Document-level overflow at each breakpoint; real layout only.           |
| 35    | mobile application navigation is reachable outside the sidebar sheet                                                                                                                              | real-browser layout               | Keep      | Header toggle-button visibility at mobile width.                        |
| 44 ×4 | `<viewport> note toolbar stays inside its pane` (small mobile, base mobile, phone landscape, sm — `width < 768`)                                                                                  | real-browser layout               | Keep      | Pane-constrained toolbar geometry.                                      |
| 57    | compact note actions expose Export in the overflow menu                                                                                                                                           | real-browser layout               | Move down | Breakpoint conditional rendering → note-actions component spec.         |
| 64    | compact note toolbar controls use 44px touch targets                                                                                                                                              | real-browser layout               | Keep      | Pixel-size measurement jsdom cannot compute.                            |
| 79    | compact note toolbar keeps the full Publish action visible                                                                                                                                        | real-browser layout               | Move down | Breakpoint logic → note-actions component spec.                         |
| 85    | sm note toolbar restores inline Export                                                                                                                                                            | real-browser layout               | Move down | Mirror of line 57 → note-actions component spec.                        |
| 91    | compact note chat opens without changing the note URL                                                                                                                                             | navigation/URL plumbing           | Keep      | Asserts Sheet-not-navigation path.                                      |
| 98    | compact note chat opens in a Sheet with note context                                                                                                                                              | other (Sheet render with context) | Keep      | No lower layer exists.                                                  |
| 113   | closing compact note chat restores focus to its trigger                                                                                                                                           | browser-focus                     | Keep      | Focus restoration after Sheet close.                                    |
| 123   | compact todo board uses readable horizontal columns                                                                                                                                               | real-browser layout               | Keep      | Column width at 375px.                                                  |
| 134   | compact todo list uses stacked records                                                                                                                                                            | real-browser layout               | Keep      | Table-absent assertion at list view.                                    |
| 144   | 2xl retains the inline contextual panel width                                                                                                                                                     | real-browser layout               | Keep      | Real CSS width of docked panel at 1536px.                               |
| 152   | xl opens the contextual panel as a Sheet                                                                                                                                                          | other (Sheet at xl)               | Keep      | `responsive-surfaces.spec.ts` models docked vs nav, not the sheet mode. |

### `tests/e2e/sidebar.e2e.ts`

| Line | Title                                                                                  | Boundary            | Decision | Rationale                                                |
| ---- | -------------------------------------------------------------------------------------- | ------------------- | -------- | -------------------------------------------------------- |
| 40   | project branches cannot exceed their content height while hydration restores expansion | routing/hydration   | Keep     | rAF-timed overshoot probe across hydration; real timing. |
| 51   | the workspace shell hydrates without runtime failures                                  | routing/hydration   | Keep     | Console-based hydration-failure probe.                   |
| 63   | the workspace shell cannot create document-level scrolling                             | real-browser layout | Keep     | Both axes at `/today`.                                   |
| 76   | server-rendered shell elements stay inside the viewport wrapper                        | SSR shell / no-JS   | Keep     | `javaScriptEnabled:false`; cannot run without JS.        |

### `tests/e2e/todos.e2e.ts`

| Line | Title                                                             | Boundary                        | Decision  | Rationale / move-down target                                         |
| ---- | ----------------------------------------------------------------- | ------------------------------- | --------- | -------------------------------------------------------------------- |
| 5    | list view fits its canvas instead of scrolling inside it          | real-browser layout             | Keep      | Scroll-container geometry.                                           |
| 14   | board columns use the wide canvas rather than the reading measure | real-browser layout             | Keep      | Desktop column width; complements responsive L123.                   |
| 24   | board cards omit metadata that is not set                         | other (conditional card render) | Move down | "No priority/due date/source" omission → `todo-card.svelte.spec.ts`. |
| 34   | toolbar search filters board cards live                           | other (search interaction)      | Move down | Filter → empty → restore → board/toolbar component spec.             |
| 47   | quick-add focuses its input when the row opens                    | browser-focus                   | Move down | Focus-on-row-open → kanban-board component spec.                     |
| 59   | quick-add focuses its input on the ?quickTodo load path           | deep-link + browser-focus       | Keep      | URL-driven focus after load; integration-only.                       |

### `tests/e2e/workbench-split.e2e.ts`

| Line | Title                                                                | Boundary                           | Decision | Rationale                                                                                                                 |
| ---- | -------------------------------------------------------------------- | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 35   | a deep-link URL with ?split= renders both panes side by side         | deep-link + URL plumbing           | Keep     | `workbench-url.spec.ts` covers state ops; the deep-link → render is e2e-only.                                             |
| 63   | dragging the divider resizes the panes and survives reload           | persistence + real-browser layout  | Keep     | `workspace-split-resizer.svelte.spec.ts` covers arrow/dblclick; the _mouse drag_ and reload-persisted ratio are e2e-only. |
| 105  | closing the secondary pane clears split state but keeps its tab      | URL plumbing                       | Keep     | Close affordance → URL sync is integration.                                                                               |
| 131  | each note pane scrolls independently while the shell stays fixed     | real-browser layout                | Keep     | Independent scroll containers.                                                                                            |
| 180  | narrow split switches panes and restores side-by-side after widening | real-browser layout + URL plumbing | Keep     | Narrow-mode radio + re-flow on widen.                                                                                     |
| 202  | narrow close removes split without closing either tab                | URL plumbing                       | Keep     | Narrow close affordance.                                                                                                  |

### `tests/e2e/workbench-tabs.e2e.ts`

| Line | Title                                                                                | Boundary                         | Decision | Rationale                                                          |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------- | -------- | ------------------------------------------------------------------ |
| 106  | switching workbench tabs does not remount the editor                                 | routing/hydration (client state) | Keep     | MutationObserver mount-count probe; no unit measures real mounts.  |
| 156  | the tab strip stays visible while the editor scrolls                                 | real-browser layout              | Keep     | Sticky positioning under scroll.                                   |
| 171  | a todo-to-note navigation finishing within the micro-duration never reveals progress | routing/hydration                | Keep     | Timing-sensitive; requires network interception in a real browser. |
| 189  | a slow todo-to-note navigation reveals progress and removes it after completion      | routing/hydration                | Keep     | Same class.                                                        |
| 206  | a slow note-to-note navigation keeps progress suppressed                             | routing/hydration                | Keep     | In-app SPA-nav suppression.                                        |
| 219  | a slow non-note navigation still reveals progress                                    | routing/hydration                | Keep     | Contrast case for suppression.                                     |

### Pass 1 totals

| Decision                        | Count |
| ------------------------------- | ----- |
| Keep                            | 54    |
| Move down (all add-lower-first) | 12    |
| Split                           | 0     |
| Remove duplicate                | 0     |

No byte-for-byte duplicates exist: every e2e test covers an _outcome_ the lower
layer proves only at the mapping/state level. The 12 moves are concrete add-lower
targets, grouped below.

> **Execution finding (2026-08-02):** the component layer cannot resize the browser
> viewport (vitest-browser/headless Chromium exposes no viewport API), so Tailwind
> breakpoint-conditional display (`sm:`/`lg:` hidden/inline) is a real e2e boundary.
> The note-title and quick-capture moves succeeded as planned; the responsive
> note-actions moves (57/79/85) reduced to proving the affordances exist at the
> component layer (`note-workspace-header.svelte.spec.ts` covers Publish presence
> and overflow-menu Export), with the viewport-specific display assertions staying
> in e2e. The four move-down groups below remain valid except the note-actions
> breakpoint group, which is split between component (affordances) and e2e
> (breakpoints).
>
> **Execution decision (2026-08-02):** the registry `run()` `CommandRunner`
> extraction (agent-workbench moves 153/159/165/171) is **not** done in this pass.
> It is the optional move in the manifest: it requires a production refactor of
> `registry.ts` that touches every command, while the four e2e tests it replaces
> are cheap single-shortcut smoke tests. The keyboard mapping they depend on is
> already unit-covered (`keyboard.spec.ts`), so the remaining e2e assertions
> (navigation outcomes) stay as smoke. Revisit only if agent-workbench's slow
> tests become a problem.
>
> **Deferred (2026-08-02):** `chat-thread.svelte.spec.ts` (gap 45b) and
> `agent-context-bar.svelte.spec.ts` cannot render under the browser harness:
> `agent-context-bar` calls the `getCapabilityCounts` remote query in a
> `$derived` at render (agent-context-bar.svelte:57), and the query proxy throws
> without a request event. The chat surface is otherwise covered (composer,
> history-list, chat-parts, chat-markdown, tool-approval-*). Unblocking requires
> either injecting capability counts into the bar or deferring the query until
> mount. Same class of blocker as `edra/AI.svelte` (editor context).
>
> **Deferred (2026-08-02):** the Edra conversion gaps (26-27, Mermaid pending
> reference + completion callback) and `note-workspace` review gaps (28-30) live
> in the notes workspace, which needs four store stubs plus a full Tiptap editor
> and is owned by active parallel work. `note-editor.svelte.spec.ts` already
> covers the editor boundary (delete/select/revise via injected callbacks).
>
> **Fixed (2026-08-02):** the `?quickTodo` focus e2e was failing on the full-load
> path — the board's `@attach`-only focus was dropped when async `todos` data
> re-rendered around the SSR-claimed input. Now uses native `autofocus` (covers
> the full-load path) alongside `@attach` (covers the click-to-add dynamic-mount
> path) on the quick-add input in `kanban-board.svelte`. No `$effect`. Verified:
> e2e passes 5× in isolation, `kanban-board.svelte.spec.ts` (click-add focus)
> passes, full todos + agent-workbench suites green.

**Retained e2e (54):** agent-workbench 100/127/147/181/189/217/258; note-title
27/34; pwa 23/36/46/64/72; responsive all 8 overflow + 35 + all 4 toolbar-pane +
64/91/98/113/123/134/144/152; sidebar 40/51/63/76; todos 5/14/59; workbench-split
35/63/105/131/180/202; workbench-tabs 106/156/171/189/206/219.

**Move-down target groups (4 new lower-layer groups):**

| Group                                                               | Replaces (e2e)                     |
| ------------------------------------------------------------------- | ---------------------------------- |
| Command-registry `run()` outcome unit tests                         | agent-workbench 153, 159, 165, 171 |
| `note-title-inline-input.svelte.spec.ts`                            | note-title 50, 61                  |
| Note-actions / toolbar breakpoint component specs                   | responsive 57, 79, 85              |
| `todo-card.svelte.spec.ts` + kanban-board/toolbar interaction specs | todos 24, 34, 47                   |

## Pass 2 — Integration (contract) scan

Real-database boundary vs behavior already proven at unit level with in-memory
fakes. Every `it` exercises a repository or transaction context against real SQL —
no pure service logic is smuggled in; the overlap clusters are "behavioral
invariants re-asserted through SQL."

| File                                             | What it proves                                                                                                                        | Classification          | Overlaps-with                                                                                             | Recommendation                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `agent/repositories.contract.spec.ts`            | Message ordering, scoping, delete-by-id, JSONB round-trips, event cursor order, idempotent decisions, active-run partial unique index | **Keep** (12)           | run.spec analogues are fake-based                                                                         | Keep all.                                                                                               |
| `deliverables/repositories.contract.spec.ts`     | ILIKE search title/format/template, null-template, pagination count/pages, upsert replace + scoping                                   | Keep (9) / Overlaps (2) | `services/deliverables/artifacts.spec.ts`                                                                 | Keep artifact group; slim export-settings to replace + scoping.                                         |
| `diagrams/repositories.contract.spec.ts`         | Project-scoped listing                                                                                                                | Keep (1, thin)          | —                                                                                                         | Consolidate into a shared scoping matrix.                                                               |
| `identity/repositories.contract.spec.ts`         | User `findById` actor scoping                                                                                                         | Keep (1, thin)          | —                                                                                                         | Consolidate into scoping matrix.                                                                        |
| `knowledge-search/repositories.contract.spec.ts` | Vector scoping; deferred-embedding lifecycle (supersede/hold/retire)                                                                  | Keep (3) / Overlaps (7) | `semantic.spec.ts`, `index-maintenance.spec.ts`                                                           | Keep owner-attribution + scoping; replace the 6 duplicated lifecycle tests with one SQL-fidelity smoke. |
| `memory/repositories.contract.spec.ts`           | Round-trip, profile/project separation, soft-delete, **orphan CHECK, FK cascade**                                                     | Keep (6) / Overlaps (5) | `memory/library.spec.ts`, `knowledge-search/indexing.spec.ts`                                             | Keep constraints/cascade; slim profile/project separation.                                              |
| `notes/repositories.contract.spec.ts`            | Round-trip, archived JOIN, **unique built-in key, conditional update, concurrent single-winner**                                      | Keep (5) / Overlaps (2) | `notes/catalog.spec.ts`                                                                                   | Keep atomic/unique-index; slim scoping + stale-reject.                                                  |
| `projects/repositories.contract.spec.ts`         | Scoping, archived hide, name reuse, case-insensitive/partial unique index, rename conflict, cross-actor same name                     | Keep (1) / Overlaps (5) | `controllers/projects/controller.spec.ts`, `services/projects/catalog.spec.ts`, `schema.contract.spec.ts` | **Highest-leverage prune.** Keep only cross-actor same-name; index already covered by schema contract.  |
| `provenance/repositories.contract.spec.ts`       | Provenance `findById` scoping                                                                                                         | Keep (1, thin)          | —                                                                                                         | Consolidate into scoping matrix.                                                                        |
| `references/repositories.contract.spec.ts`       | Reference list scoping                                                                                                                | Keep (1, thin)          | —                                                                                                         | Consolidate into scoping matrix.                                                                        |
| `relationships/repositories.contract.spec.ts`    | Duplicate-edge idempotency via unique index                                                                                           | Keep (1)                | — (graph.spec is service-level)                                                                           | Keep.                                                                                                   |
| `schema/schema.contract.spec.ts`                 | Extensions, columns, partial/case-insensitive indexes, HNSW, checks, enums, composite PKs                                             | **Keep** (14)           | —                                                                                                         | Keep whole file; canonical boundary.                                                                    |
| `skills/repositories.contract.spec.ts`           | Usage-with-provenance FK; archived-project hide                                                                                       | Keep (1) / Overlaps (1) | `services/skills/library.spec.ts`                                                                         | Keep archived-hide; drop provenance-persist.                                                            |
| `suggestions/repositories.contract.spec.ts`      | **Atomic single-winner transition**; archived hide                                                                                    | **Keep** (2)            | — (inbox.spec is sequential)                                                                              | Keep both.                                                                                              |
| `todos/repositories.contract.spec.ts`            | SQL status/category filters, archived JOIN, partial-update nulling, scoping, distinct categories                                      | Keep (6) / Overlaps (2) | `controllers/todos/controller.spec.ts`, `services/todos/catalog.spec.ts`                                  | Keep SQL semantics; slim scoping + listCategories.                                                      |
| `workspace/repositories.contract.spec.ts`        | **Real transaction rollback incl. nested**                                                                                            | **Keep** (2)            | — (fake only simulates)                                                                                   | Keep both.                                                                                              |

**Totals:** 90 assertions — 66 Keep-boundary, 24 Overlaps-unit, 0 observe-only.

> **Pruned 2026-08-02 (Phase C):** 14 overlapping `it` blocks removed — projects
> 6→1 (kept cross-actor per-user index; the rest proven by controller/catalog
> specs + schema contract), knowledge-search deferred-embedding 10→4 (kept
> owner-attribution + pending-scope; supersede/hold/retire proven by
> `index-maintenance.spec.ts`), memory 11→8 (dropped profile/project separation
> proven by `memory/library.spec.ts`). The four thin scoping files (diagrams,
> identity, provenance, references) consolidated into
> `tests/integration/scoping/repositories.contract.spec.ts`.

**Harness notes** (`tests/integration/database-harness.ts`): one shared testcontainer,
careful UUID-family partition — good. Caveats: no truncation between files
(correctness relies on the suffix convention), module-level `context` is
`fileParallelism:false`-dependent, `memory`/`deliverables`/`skills` bypass the
`seedNote` helper.

## Pass 3 — Duplicate audit (lower layers)

Behaviors proven in ≥2 layers, so the manifest can name a single owner before any
e2e test "moves down."

### Fully covered below (e2e adds only smoke value)

- **Chord state machine** — expiry, Escape cancel, held/repeated modifier, physical-code matching: `keyboard.spec.ts`
- **Mod+Shift+I / Mod+Shift+P mapping** — `keyboard.spec.ts`
- **Split divider semantics + keyboard resize + 25-75% limits + dblclick reset** — `workspace-split-resizer.svelte.spec.ts`
- **Workbench split URL state** — `workbench-url.spec.ts` + `workbench.svelte.node.spec.ts`
- **Approval card pure logic** (fields, id-stripping, preview, labels) — `tool-approval-fields` / `tool-approval-preview` / `tool-presentation` specs
- **Composer focus hand-off** — `right-panel.spec.ts`
- **Chat decision batching + failure visibility** — `chat.svelte.spec.ts` + `agent/run.spec.ts`
- **Todo sorting, CRUD, promise-server invariants** — `todo-sort.spec.ts` + todos controller/catalog/promise specs
- **Note rename persistence (server)** — `controllers/notes/rename.spec.ts`

### Under-covered (no lower spec — add-lower-first targets)

- Command-palette rendering (dialog, Actions group, shortcut hints) — no spec for `command-palette.svelte` / `registry.ts` / `palette.svelte.ts`
- **Mod+K then Q → quick-capture** — the `q` chord is the only chord not asserted in `keyboard.spec.ts`
- Quick capture / quick-add focus-on-mount (chord-driven and `?quickTodo`)
- Note-title in-place edit UI (breadcrumb sync, Escape, Enter, caret)
- Todos board/list rendering, card metadata omission, live search, quick-add focus
- **Navigation progress reveal/suppress** — `[data-navigation-progress]` has zero lower coverage
- Tab-strip no-remount and sticky behavior — no spec for `workspace-tabs.svelte`
- **Drag-to-split gesture** — the e2e comment cites `workspace-tabs.svelte.spec.ts`, which does not exist; the gesture is `workspace-split-resizer` territory
- Sidebar hydration / document scrolling / SSR shell (only ref-contract specs exist)

**Integration layer:** none of the 16 contract files overlap behaviors a-i; they are
DB repository contracts only.

## Refactor prerequisites

Seams that must exist before the add-lower targets can be written:

1. **`quick-capture.svelte`** — replace the `$app/state` `page.url` read
   (line 18-20) with a `focusOnMount` prop so mount-to-focus becomes a pure
   component test.
2. **Command-registry `run()`** — optionally extract a `CommandRunner` (registry
   keeps the intent list; execution is injected) so `registry.ts` side-effects
   become unit-testable. If not extracted, the four agent-workbench moves
   (153/159/165/171) stay as e2e smoke.
3. **`note-title-inline-input.svelte`** — extract the rename/title field taking
   `title`, `onRename`, `onCancel` (leaf component with declared intents).
4. **`todo-card.svelte`** — render-card with injected metadata/on-intents so
   omission behavior and focus flow are component-testable.

## Execution order

Invariant: **never delete or weaken a higher-layer test until its lower-layer
replacement exists and passes.**

Phase A — manifest moves first (unblock lower layers):

1. Keyboard `q` chord gap — add the quick-capture mapping test to `keyboard.spec.ts`
   (closes gap-ledger rows 74-75 at the right layer)
2. Quick-capture refactor (`focusOnMount`) + component spec
3. Note-title: extract title input + component spec → reduce e2e to 2 (keep 27, 34)
4. Todos: `todo-card` + kanban/toolbar specs → reduce e2e to 3 (keep 5, 14, 59)
5. Responsive: note-actions/header breakpoint specs → reduce e2e to 21
   (also closes gap-ledger row 47)
6. Registry `run()` (if `CommandRunner` extracted) → reduce agent-workbench to 7

Phase B — gap-ledger adds at the component/node layer:

7. Chat composer + thread specs (gap rows 44-45)
8. Note-workspace dialogs + header specs (gap rows 46-47; header may share seams with #5)
9. Attachment upload adapter (gap row 48), project tree (row 49), AI quick-action
   nav (row 50), input-group addon (row 51)
10. Capability-factory specs (gap rows 36-38)
11. Edra conversion + Drawio nodes + Artifact library component specs (gap rows
    19-20, 26-30)

Phase C — integration + new e2e:

12. Integration pruning: `projects` (keep cross-actor test) → knowledge-search
    lifecycle (one SQL smoke) → memory profile/project separation → thin scoping
    files into a shared scoping-matrix spec
13. Mark gap-ledger rows 64-65 covered (schema registry and workspace rollback
    already pass via `schema.contract.spec.ts` and `workspace/repositories.contract.spec.ts`)
14. New capabilities.e2e.ts smoke (gap rows 17-18) + build audit
    (scripts/audit-build-output.ts, gap row 57). Gap row 58 (browser-runner
    `wrapDynamicImport` regression) is **dropped**: it existed to guard the
    dynamic mermaid script-tag loader, which was replaced by a static
    `import mermaid from 'mermaid'` (see execution note).
15. Docs: update `docs/TESTING.md` lane descriptions to match the retained counts

## Forward gap backlog (merged from TEST_GAPS.md)

The former `docs/TEST_GAPS.md` was folded here on 2026-08-02; its statuses now
refer to the layer scan above. Rows that name a behavior already proven at the
required boundary are marked `covered` below and removed from the open tables.

Statuses:

- `open` — behavior is not yet covered at the required boundary.
- `in progress` — the production boundary or fixture is being changed with its test.
- `covered` — the named executable test exists and passes; retained for refactor traceability.

### Open application journeys

| Status | Behavior to protect                                                                                                              | Test layer and intended file                        | Setup and observable assertion                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| open   | Capability smoke path covers shell, Today, notes, todos, Agent, project overview/todos/memory/attachments, skills, and artifacts | Playwright, tests/e2e/capabilities.e2e.ts (planned) | Start from deterministic seed data, derive entity IDs from rendered links, visit every capability, and assert its primary landmark/heading without browser errors. Manifest boundary: client-server wiring; keep as a single representative journey. |
| open   | Attachment content endpoint preserves its external redirect contract                                                             | Playwright, tests/e2e/capabilities.e2e.ts (planned) | Derive an attachment content link from the rendered project UI, request it without following redirects, and assert an external `302` location.                                                                                                       |
| open   | Artifact library preserves filtering, grouping, pagination, download links, and empty results                                    | Browser component, colocated with `ArtifactLibrary` | Render structural loader data, operate the visible controls, and assert the corresponding rendered artifact group/page/link or empty state.                                                                                                          |
| open   | Saved Drawio nodes retain preview, title, and resolved href after editor reload                                                  | Browser component, Edra/notes integration spec      | Load a saved opaque diagram reference through `NoteEditor`, render it with the injected preview, and assert the visible title, preview, and resolved link.                                                                                           |

### Open Edra boundary cases

| Status | Behavior to protect                                                                           | Test layer and intended file                   | Setup and observable assertion                                                                                     |
| ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| open   | Mermaid conversion stores an opaque pending reference in editor state                         | Browser component, Edra Mermaid extension spec | Invoke the injected conversion callback and assert the node transaction contains only the returned opaque string.  |
| open   | A completed conversion notifies the product workspace for review                              | Browser component, notes editor adapter spec   | Resolve a pending conversion and assert the injected structural completion callback receives the opaque reference. |
| open   | Dismissing conversion review clears the pending editor reference                              | Browser component, notes workspace spec        | Open review from a pending reference, dismiss it, and assert the editor no longer exposes that reference.          |
| open   | Accepting conversion inserts the reviewed Drawio node only after the product service succeeds | Browser component, notes workspace spec        | Complete the injected acceptance service and assert one Drawio node appears with the opaque reference.             |
| open   | Rejecting conversion clears pending state without inserting a Drawio node                     | Browser component, notes workspace spec        | Reject through the workspace-owned dialog and assert the document is unchanged except for cleared pending state.   |

### Open server-composition contracts

| Status | Behavior to protect                                                              | Test layer and intended file                   | Setup and observable assertion                                                                                |
| ------ | -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| open   | Every capability factory wires its typed bundle from interface dependencies only | Node unit, colocated capability factory specs  | Supply hand-written dependency fakes and assert the factory's cohesive public bundle.                         |
| open   | Suggestions finalization can be invoked only after dependent capabilities exist  | Node unit, suggestions capability factory spec | Create the core bundle, call typed `finalize(...)`, and assert the finalized controller/service surface.      |
| open   | Agent lifecycle resolves controller creation lazily without placeholder mutation | Node unit, agent capability factory spec       | Construct with a lazy controller provider, resolve after composition, and assert the usable lifecycle bundle. |

### Open coordinator boundary cases

| Status | Behavior to protect                                                                                                                     | Test layer and intended file                                                          | Setup and observable assertion                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| open   | Chat composer preserves drafts, image limits, pasted images, mentions, execution mode, and explicit focus registration after extraction | Browser component, `components/chat/workspace/chat-composer.svelte.spec.ts`           | Render the composer with hand-written state callbacks, exercise one behavior per test, and assert the visible draft/chip/image/mode/focus result.               |
| open   | Chat thread preserves edit/resubmit, copy, retry, grouped approvals, tool detail, and suggestion decisions after extraction             | Browser component, `components/chat/workspace/chat-thread.svelte.spec.ts`             | Render structural entries and explicit callbacks, operate the visible turn control, and assert the resulting thread state or accessible content.                |
| open   | Note workspace dialog extraction preserves conflict resolution, export inputs, and draw.io acceptance ordering                          | Browser component, `components/notes/workspace/note-workspace-dialogs.svelte.spec.ts` | Render each structural state, complete the visible dialog action, and assert only the corresponding callback result after service success.                      |
| open   | Note workspace header preserves pane-responsive status, publishing, move/archive actions, and the 44px split close target               | Browser component, `components/notes/workspace/note-workspace-header.svelte.spec.ts`  | Render structural note/sync states at narrow and wide pane widths, operate each visible action, and assert its explicit callback and non-overlapping layout.    |
| open   | Pasted note media completes the checksum, object-store upload, finalization, and stable content-URL sequence                            | Node unit, `components/notes/attachment-upload.spec.ts`                               | Supply hand-written transport collaborators around the upload adapter and assert the stable `/api/attachments/:id/content` result and each error boundary.      |
| open   | Project tree extraction preserves expansion persistence, inline create/rename, menus, move destinations, archive, and drag finalization | Browser component, `components/projects/project-tree-view.svelte.spec.ts`             | Render deterministic projects and entries with hand-written action fakes, perform one tree interaction per test, and assert the visible tree/navigation result. |
| open   | AI quick-action keyboard navigation scrolls the active bound option without querying the document                                       | Browser component, `components/edra/AI.svelte.spec.ts`                                | Render enough quick actions to overflow, send ArrowDown/ArrowUp, and assert the active button is scrolled into view and Enter invokes only its action.          |
| open   | Input-group addons focus their owned native input while preserving nested button activation                                             | Browser component, `components/ui/input-group/input-group-addon.svelte.spec.ts`       | Render an addon beside a nested input and beside a button, click each target, and assert input focus changes only for the non-button addon click.               |

### Open build/runtime warning contracts

| Status  | Behavior to protect                                                                                            | Test layer and intended file                                              | Setup and observable assertion                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| covered | Production application chunks remain below the 500 kB threshold (Mermaid's vendor bundle is a known exception) | Build audit, `scripts/audit-build-output.ts` (run via `pnpm build:audit`) | Fails when any application-owned client chunk exceeds 500 kB; the Mermaid vendor bundle is tolerated because a static `import mermaid from 'mermaid'` necessarily bundles its grammars. |

> **Dropped 2026-08-02:** the `wrapDynamicImport` browser-runner regression guarded
> the dynamic mermaid script-tag loader (`mermaid-script.ts`). Mermaid is now a
> static import (`import mermaid from 'mermaid'` in `mermaid-rendering.ts`), so
> the failure mode it protected against no longer exists. The server-side diagram
> validator keeps its sandboxed child-process `await import('mermaid')` — that is
> a spawned `node --eval` subprocess, not the application bundle, and it must load
> after the JSDOM shim is installed.
>
> **Consequence:** the static import bundles Mermaid's grammars (~650 kB) into one
> vendor chunk, over Vite's 500 kB warning. The build audit (`audit-build-output.ts`)
> therefore treats the Mermaid vendor bundle as a known exception and fails only
> on application-owned chunks.

### Open database-contract organization

| Status  | Behavior to protect                                                          | Test layer and intended file                       | Setup and observable assertion                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| covered | Schema registry exports and physical table names remain exact                | Contract suite under `tests/integration/schema`    | Inspect the Drizzle registry and database metadata and assert the existing export set and table names. Already passing via `schema.contract.spec.ts` (14 tests). |
| covered | Workspace transaction rollback remains atomic across capability repositories | Contract suite under `tests/integration/workspace` | Fail a multi-repository operation and assert no partial rows persist. Already passing via `workspace/repositories.contract.spec.ts` (2 rollback tests).          |

### Covered rows folded from TEST_GAPS.md

| Status  | Behavior protected                                                                                      | Executable test                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| covered | A focus request made before the chat composer mounts is delivered on registration                       | `src/lib/stores/shell/right-panel.spec.ts`                                                                                                              |
| covered | A mounted chat composer receives an immediate explicit focus request                                    | `src/lib/stores/shell/right-panel.spec.ts`                                                                                                              |
| covered | A released chat composer registration cannot receive later requests                                     | `src/lib/stores/shell/right-panel.spec.ts`                                                                                                              |
| covered | Command palette keyboard navigation focuses quick capture without production selectors                  | `tests/agent-workbench.e2e.ts` — green today; the durable owner is the keyboard `q` chord unit test + quick-capture component spec (execution step 1-2) |
| covered | Command palette keyboard navigation opens and focuses quick todo creation                               | `tests/agent-workbench.e2e.ts` — green today; move-down target is the registry `run()` unit test (execution step 6)                                     |
| covered | PWA serves the offline response and keeps remote/API responses out of Cache Storage                     | `tests/e2e/pwa.e2e.ts`                                                                                                                                  |
| covered | Direct `Input` binding yields the rendered native input element                                         | `src/lib/components/ui/ref-contracts.svelte.spec.ts`                                                                                                    |
| covered | Tooltip trigger composition forwards the rendered interactive element                                   | `src/lib/components/ui/ref-contracts.svelte.spec.ts`                                                                                                    |
| covered | Separator forwards its rendered native element                                                          | `src/lib/components/ui/ref-contracts.svelte.spec.ts`                                                                                                    |
| covered | SidebarSeparator preserves ref forwarding through its wrapper                                           | `src/lib/components/ui/ref-contracts.svelte.spec.ts`                                                                                                    |
| covered | The application composition root cannot construct repositories/services or use cyclic placeholder casts | `scripts/audit-topology.ts`                                                                                                                             |
| covered | Repository behavior remains intact in capability-scoped suites using the shared PostgreSQL harness      | `tests/integration/<capability>/repositories.contract.spec.ts`                                                                                          |

## Ratchet

Extend `scripts/audit-tests.ts` so every `.e2e.ts` test must carry a declared
boundary tag — e.g. a comment line `// Boundary: hydration` immediately above the
`test(...)`, matched against the inventory in this file. Untagged e2e tests fail
the quality audit. This prevents the suite from slowly becoming top-heavy again.

New e2e tests must tag a boundary from the inventory; new lower-layer tests should
prefer the cheapest lane that proves the behavior without mocks.
