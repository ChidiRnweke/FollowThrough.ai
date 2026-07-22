# UI/UX Implementation — overnight status

Worked unsupervised against `.claude/plans/can-you-look-at-scalable-nebula.md` (spec: `UI_UX_REVIEW.md`).
**No commits were made** — everything is in the working tree for you to review, adjust, and commit.

**Build state:** `pnpm check` → **0 new errors, 0 warnings** (the 5 errors it reports are pre-existing on this branch, see below). Behavior tests pass (`labels.spec.ts` +10, `tool-presentation.spec.ts` unaffected).

---

## ✅ Done & verified

### The 7 redesigns (plan §E — all landed)
1. **Today** (`pages/today-triage.svelte`, `quick-capture.svelte`) — dashboard with three semantic **stat tiles** (Overdue=destructive, Due=warning, Waiting=foreground), calm zero-states, actionable lists only when non-empty, "Inbox" capture target chip.
2. **Todo board** (`kanban-board.svelte`, `todo-card.svelte`) — per-status 2px accent bar (gray/primary/warning/success), count pill, bottom "+ Add" quick-add, overdue due-date now `destructive`.
3. **Todo list** (`todo-table.svelte`, `todos-workspace.svelte`) — quiet uppercase header, **status dot+label** (via `todo-status-field`), struck-through done/cancelled, persistent "+ Add todo" row.
4. **Memory + Profile** (`memory-entry-list.svelte`, `profile-memory.svelte`) — card-stack → **one ledger container** with divided rows, collapsed composer, edit/delete moved into a `⋯` overflow menu, confirmed delete dialog. Profile now hides the per-item share toggle and shows a scope caption (`hideShare`/`scopeLabel` props).
5. **Skills index** (`routes/(app)/skills/+page.svelte`) — feature-card wall → scannable rows with an enabled dot, trigger chips, pin marker, chevron; links to the single-file editor.

### Foundations (plan §A / Phase 0)
- `labels.ts`: `todoStatusStyle` + `attachmentStatusStyle` (semantic `success`/`warning`/`destructive` tokens) and `formatBytes`. **+10 tests** in `labels.spec.ts`.
- `confirm-delete.svelte`: reusable `alert-dialog` destructive-confirm primitive.
- Copy: "Use environment default" → **"App default"** (`settings-agent.svelte`); chat tool row "Get note completed" → **"Read note"** (`agent/tool-presentation.ts`).

### Tweaks
- **Attachments** (`attachment-list.svelte`): raw bytes → `formatBytes`, `ready` badge now carries `success` dot, Remove → confirm dialog.
- **Artifacts** (`routes/(app)/artifacts/+page.svelte`): file size added, Delete → confirm dialog. (It already had tooltips + a table block + disambiguating metadata.)
- **Icon tooltips** (A1): visible `title` tooltips on the sidebar bottom cluster — chat toggle, theme, feedback (`app-sidebar.svelte`) — and "Pending memories" on the notification bell (`memory-notification-menu.svelte`).
- **Recent chats** (`panels/chat-history-list.svelte`): raw `19-7-2026` → `formatRelativeTime`, so rows differ and match the app-wide date convention.

### Re-evaluations (my earlier review was wrong about these — no change needed)
- **`project-overview.svelte`** is already well-built (counts on all four cards, just zero-suppressed; hover states; contained icons; hover-reveal overflow). The screenshot's "inconsistent counts" was zero-suppression.
- **Artifacts** already had icon tooltips and `N notes · date · template` disambiguation.

---

## ⏸ Deferred (backend/schema — intentionally not done, to avoid breaking the build unsupervised)

These are deep DDD vertical slices (service interfaces + factory DI wiring + contract tests) that I couldn't fully exercise without driving the app. Per the plan's back-out clause I stopped rather than half-implement. Pointers for finishing:

- **Delete a todo** — repo already has `softDelete` + `deletedAt` (`repositories/postgres-todos.ts:116`, list filters deleted). Needs: a `TodoRemover` service + factory wiring, a `remove` method on `controllers/todos/controller.ts`, a `deleteTodo` in `remote/todos.remote.ts`, then UI (confirm dialog in `todo-detail-panel.svelte`). **No migration needed.**
- **Memory `type` chips** — `MemoryEntry` has no `type` field. Needs a column on `memory_entries` (`server/db/schema.ts`) + migration, mapper spread already flows it (`mappers.ts:104`), repo `insert` one line (`postgres-memory-entries.ts`), model/workflow/remote/zod, then composer Select + row chip in `memory-entry-list.svelte` (ledger already leaves room).
- **Todo `priority`** — same shape as memory type; add column + `todo-fields/todo-priority-field.svelte` + a List column.
- **Waiting-on editing field** — `Todo.waitingOn` exists; add `todo-fields/todo-waiting-on-field.svelte` and place in the detail panel/detailed card (the board filter already reads it).
- **Artifact freshness** — compute `stale = max(sourceNote.updatedAt) > artifact.createdAt` in the artifacts query; render a `warning` "source changed" badge. No migration.
- **Create skill** — skills are note-backed (`/skills/{noteId}`); seed a `SKILL.md` note. Single-file scope only.
- **Skills enable Switch in the index** — the index is presentational; enable/disable is a `?/toggle` form action on the `[id]` route. Wiring a functional switch into the index needs a `toggleSkill` remote.

## ⏭ Not reached (safe, lower-value tweaks remaining)
- `edit-skill` long-form sectioning; command-palette shortcut normalization; dark-mode contrast QA pass; quick-capture "→ Inbox" was added but the actual capture target isn't verified against the server action.

---

## ⚠️ Pre-existing issues (NOT introduced by me)
- **5 type errors** on this branch before I started: `server/domain/inline-completion-generator.ts` (`reasoning`), `server/domain/mappers.ts` (`linkedNoteId`), `right-panel.svelte` (onstatus `never`), `workspace-tabs.svelte.spec.ts` (×2).
- **1 eslint error**: `todo-fields/todo-source-field.svelte:13` unused `value`.
- Working tree also shows `.vscode/settings.json` and `server/domain/openai-agent-capabilities.ts` modified — **not my changes** (IDE/auto-format); review or discard as you see fit.

## Files I changed
`labels.ts`, `labels.spec.ts` (new), `confirm-delete.svelte` (new), `today-triage.svelte`, `quick-capture.svelte`, `attachment-list.svelte`, `kanban-board.svelte`, `todo-card.svelte`, `todo-table.svelte`, `todo-fields/todo-status-field.svelte`, `todos-workspace.svelte`, `memory-entry-list.svelte`, `profile-memory.svelte`, `agent/tool-presentation.ts`, `settings-agent.svelte`, `app-sidebar.svelte`, `memory-notification-menu.svelte`, `panels/chat-history-list.svelte`, `routes/(app)/skills/+page.svelte`, `routes/(app)/artifacts/+page.svelte`.

## To verify in the morning
`pnpm dev`, then walk: Today, a project's Todos (board + list), Memory, Profile, Skills, Artifacts, Attachments — in **light and dark**. All changes are presentational and reversible; nothing touches the database.
