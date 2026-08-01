# Feature Improvements — Scoped & Grouped

Complexity: **S** = small/localized, **M** = multi-file feature, **L** = cross-cutting or architectural.

## Group 1 — Editor & Notes UI (edra, note editor, sidebar)

### 1. Reorder notes in sidebar — S/M — ✅ Done

`position` ordering already exists in the notes schema (`src/lib/server/db/schema/notes.ts`, `notes.position`) and the sidebar tree already uses `svelte-dnd-action` (`src/lib/components/projects/project-tree.svelte`); the gap is persisting reorder drops. Touch: `project-tree.svelte`, `src/lib/client/notes/note-drag.ts`, `src/lib/stores/projects/project-actions.svelte.ts`, notes repository update method.

Fixed: the grip was a `<button>`, and svelte-dnd-action refuses drags whose mousedown target has a `value` property (nested-input guard) — every `<button>` has one, so the grip was ungrabbable. Replaced with a styled `<span use:dragHandle>` (the pattern `todo-card.svelte` already uses).

### 2. Sticky table header on scroll in note — S — ✅ Done

Pure CSS on the Tiptap table styles (`src/lib/components/edra/editor.css:409-523`, `.tableWrapper thead th { position: sticky }`). Possibly a small tweak in `TableCol.svelte`/`TableRow.svelte` if borders clip.

Done: `.tableWrapper` now uses `overflow-x: clip` (a scrollable wrapper would trap sticky cells); `th` cells are `position: sticky; top: var(--note-header-h)` with `background-clip: padding-box` for the border-collapse quirk. `note-workspace.svelte` measures the utility header into `--note-header-h`.

### 3. Paste images into a note — M — ✅ Done

Add an image/file branch to the existing paste handler (`src/lib/components/edra/commands/paste.ts`), reusing the attachment upload plumbing (`src/lib/client/attachments/`, `file-dropzone.svelte`) and image node (`commands/image-node.ts`, `ImageExtended.svelte`).

Done: `clipboardImage()` detects image files on the clipboard; the paste handler routes them through `uploadMedia`, now wired via a new `onFileUpload` in `note-editor.svelte` that uploads as a note attachment and returns the stable `/api/attachments/{id}/content` URL (302 → fresh presigned URL, so no expiry problem).

### 4. Link inside a document — S — ✅ Done

`[[note]]` internal linking already exists (`commands/NoteLinkSuggestion.ts`, `NoteLinkList.svelte`, `reference-link-plugin.ts`); scope is likely anchor/heading links or polishing the Link mark UX (`commands/extensions.ts`, `Link.svelte`). Needs one clarifying pass on what "link inside" means.

Done (clarified: heading links): typing `#` opens a suggestion of the current note's headings (ids from the TOC extension) and inserts a `#heading-id` anchor link; a click plugin scrolls to the heading smoothly. New: `HeadingLinkSuggestion.ts` (+ spec), `heading-link-renderer.svelte.ts`, `HeadingLinkList.svelte`.

### 5. Right-click context menu in editor — M — ✅ Done

No `contextmenu` handling today; the `ui/context-menu` primitive exists and is already used in `project-tree.svelte`. Touch: `src/lib/components/notes/note-editor.svelte`, new menu component offering paste raw / paste merge formatting / copy raw / copy formatting.

Done: the editor wrapper is now a `ContextMenu.Trigger` with four items — copy raw / copy with formatting (HTML+plain via `ClipboardItem`) / paste raw (`view.pasteText`) / paste with formatting (`view.pasteHTML`, falls back to raw). `.tiptap` sets `user-select: text` to override the trigger's `select-none`.

### 6. Selection controls hidden when text is at top — S — ✅ Done

The BubbleMenu (`src/lib/components/edra/BubbleMenu.svelte`, instance in `note-editor.svelte:457-571`) flips below the selection but likely clips at the container top. Fix placement/offset/overflow in the bubble menu config.

Done: the menu now mounts on `<body>` (`appendTo`) with floating-ui `strategy: 'fixed'`, so the pane's scroll viewport no longer clips it; `scrollTarget` points at the pane's ScrollArea viewport to keep position in sync, and the menu sits at `z-30` above the sticky utility header.

### 7. Ctrl+A copies diagrams as images — M — ✅ Done

Hook copy behavior into the Mermaid node view (`src/lib/components/edra/Mermaid.svelte`) using the existing export pipeline (`MermaidExportMenu.svelte`, `mermaid-export.ts`) to put a PNG on the clipboard.

Done (clarified: pictures leave the app as pictures, whatever the selection): the first pass only handled a selection holding exactly one diagram, so Ctrl+A fell through to ProseMirror's default copy — diagrams pasted as mermaid source and images as relative, cookie-authenticated `/api/attachments/{id}/content` URLs no external app can resolve — and a select-all that happened to contain one diagram was hijacked down to that diagram alone.

Now `commands/diagram-copy.ts` classifies the selection (`selectionMedia`, `hasMedia`) and `commands/clipboard-payload.ts` builds the payload. A lone diagram or image still becomes a bare `image/png`; anything larger keeps ProseMirror's own HTML serialization — which already pastes well into a word processor — with each mermaid node replaced by its rendered PNG and each image's `src` replaced by its bytes, both as `data:` URIs. Ceilings of 24 diagrams and 12 MiB keep a picture-heavy note from stalling the copy, and every substitution is individually caught so one bad node cannot cost the copy. The editor's `copy` handler and the right-click "Copy with formatting" share the builder, `selectionPlainText` moved out of `note-editor.svelte` into it, and the diagram hover toolbar gained a "Copy Image" button ahead of "Copy Code".

Two follow-ups from testing the first cut. Copying took several attempts to take: `navigator.clipboard.write` spends the keystroke's user activation when it is called, and awaiting a mermaid render or an attachment fetch first let the activation lapse, so the browser rejected the write silently. `selectionClipboardItem()` now hands `write` the unresolved blobs, reaching it while the gesture is still live; the diagram toolbar button does the same. And the page visibly jumped on every copy because mermaid, given no container, appends its scratch `<div>` — carrying a full-width SVG — straight into `document.body` in flow. `renderMermaidOffscreen()` in `mermaid-rendering.ts` gives it a fixed, off-screen host instead, and both the export pipeline and `Mermaid.svelte`'s on-screen render go through it, so the jump is gone from note rendering too.

## Group 2 — Chat & Agent UI

### 8. Bundle parallel tool calls + "approve all" — M ✅ Done

Group concurrent approval cards in the chat panel and add an approve-all action. Touch: `tool-approval-card.svelte`, `agent-action.svelte`, `agent-actions.ts`, `chat-panel.svelte`.

### 9. Read-note output label — S ✅ Done

Add/adjust entries in the label maps in `src/lib/components/agent/actions/tool-presentation.ts` (and `src/lib/components/shared/labels.ts` if needed) so the note name is shown instead of "read markdown".

### 10. Formatting in reasoning + collapsed by default with clickable title — S ✅ Done

Render reasoning through the existing markdown renderer (`chat-markdown.svelte`) inside `chat-reasoning.svelte`, default to collapsed, make the title row toggle.

## Group 3 — Todos & Backlog

### 11. Backlog "add" focuses input immediately — S — ✅ Done

The kanban add row already has `autofocus` (`kanban-board.svelte:132`); likely a Svelte timing issue — replace with an `onMount`/tick focus action.

Fixed: `autofocus` is unreliable for elements created inside an `{#if}` after mount. Replaced with a Svelte 5 attachment `{@attach (node) => node.focus()}` on the add-row `Input` (same pattern as `{@attach focusAtEnd}` in `chat-panel.svelte`).

### 12. Search bars fully green on focus — S — ✅ Done

Unify focus styling across `model-picker.svelte` (Command.Input), `app-sidebar.svelte`/`command-palette.svelte`, and `todos-workspace.svelte:103` Input; likely a shared class in `ui/input` / `ui/command` primitives.

Fixed: strengthened the shared focus recipe in `ui/input/input.svelte` (both branches), `ui/textarea/textarea.svelte`, and `ui/input-group/input-group.svelte` — solid teal border, 3px `ring-primary/30` halo, visible `bg-primary/12` / `dark:bg-brand/20` wash. Also made the resting `bg-input/30` dark-only in `input-group.svelte` and dropped the redundant unconditional `bg-input/30` in `command-input.svelte`, which masked the wash in light mode for `model-picker.svelte` and `command-palette.svelte`. The `todos-workspace.svelte` search inherits the bare Input recipe automatically.

Second pass: the recipe reached the field but not the glyph inside it — `command-input.svelte` renders `FtSearch` in an `InputGroup.Addon`, which stays `text-muted-foreground opacity-50` while everything around it turns teal, so the magnifier read as a dead spot mid-wash (visible in the Settings → Agent chat-model picker). `input-group-addon.svelte` now carries `group-has-[[data-slot=input-group-control]:focus-visible]/input-group:text-primary` and the icon dropped its `opacity-50`, which covers the model picker, command palette, todo source field and code-block picker at once. Also on that screen: "Save agent defaults" was a bare remote-form spread whose `{ saved: true }` went nowhere, so it now goes through `saveAgentPreferences.enhance(...)` and toasts like every sibling panel; and `ui/sonner/sonner.svelte` defaults `closeButton` to true with an `FtClose` icon and popover-token classes, since sonner paints its own button from `--gray4`/`--gray12`.

Third pass, and the one that actually made Command fields teal: both earlier passes had been strengthening rules that could never fire. The group paints its focus state through `has-[[data-slot=input-group-control]:focus-visible]`, but `input-group-input.svelte` set that attribute _before_ `{...props}`, and `command-input.svelte` passed `data-slot="command-input"` down through bits-ui's child props — so the later spread won and the rendered input never carried the slot the selector needs. Border, halo and wash were all dead for every `Command.Input`: model picker, ⌘K palette, todo source field, code-block language picker. Separately, the control neutralised its own `border-0`/`ring-0` but not `focus-visible:bg-primary/12`, which twMerge keeps alongside `bg-transparent`, so focus painted a square teal patch inside the rounded pill. Fixed by moving `data-slot` after the spread so a caller cannot clobber it, adding `focus-visible:bg-transparent` to the control, and dropping the unreferenced `command-input` slot. `input-group-input.svelte.spec.ts` now asserts the contract, including through a real `Command.Input`.

### 13. Ugly todo card border (missing top/right) — S — ✅ Done

Debug border rendering in `todo-card.svelte` and the `ui/card` primitive — likely a collapsed-border/ring conflict with the dnd `lifted` styling.

Fixed: not a ring conflict — `Card.Root`'s hairline is a `ring-1` box-shadow, and the kanban column scroller (`overflow-y-auto`, zero padding) clips box-shadow pixels at its top/right scrollport edges. Added `p-0.5` to the scroller in `kanban-board.svelte`, which also gives the 2px dnd drop-target outline room to render.

### 14. Sort controls for todo table — M — ✅ Done

Add sortable column headers to `src/lib/components/todos/todo-table.svelte` (client-side sort first); optionally extend `TodoListFilter` in `src/lib/models/todos/index.ts` if server-side sorting is wanted.

Fixed: client-side sorting in `todo-table.svelte` — `sortKey`/`sortDir` state (default null = server order), a `sortedTodos` derivation via `toSorted` with per-column comparators (workflow rank for status, urgency rank for priority, collator for strings, nulls last), and clickable ghost-button headers cycling asc → desc → cleared with `FtChevronUp/Down/ChevronsUd` icons and `aria-sort`. Applied to both the desktop table and the mobile card list. No server changes.

### 15. Tag todos by category + filter — L — ✅ Done

New schema field + drizzle migration (`src/lib/server/db/schema/todos.ts`, `drizzle/`), todo model + mapper updates (`src/lib/models/todos/index.ts`, `db/mappers.ts`), repository filter, then UI: new category field in `components/todos/fields/`, filter bar in `components/todos/workspace/todos-workspace.svelte`, and shared labels.

Fixed: free-text `category` (decision: users invent their own — clients, releases, etc.), so no enum and no `labels.ts` maps. Nullable `text` column (`drizzle/0030_misty_titania.sql`), `Todo.category`/`UpdateTodoInput.category`/`TodoListFilter.category` in `domain.ts`, mapper + repository insert/update/filter + new `listCategories` (distinct values) through catalog and controller, zod field in `todos.remote.ts`. UI: new `todo-category-field.svelte` (text input with a datalist of existing categories, blur/Enter commit, quiet mode), a sortable Category column in `todo-table.svelte` (desktop + mobile card), and an "All categories" Select in the workspace filter bar wired to a `category` URL param on both todos pages. Caveat: the local dev DB had drifted from the migration journal (0017+ never applied, `agent_tool_effects` missing), so `pnpm db:migrate` fails on pre-existing history; the `category` column was applied manually with `ADD COLUMN IF NOT EXISTS`.

## Group 4 — Agent Platform & Backend

### 16. Increase web search limit — S — ✅ Done

Bump `max_results`/`max_total_results` defaults in `src/lib/server/services/agent-runs/web-research.ts` (already env-configurable via `OPENROUTER_WEB_SEARCH_*`).

Done: agent chat now searches up to 20 results per call and 40 per run. Reference discovery keeps its focused 8/16 budget through the same parser and tool factory, and explicit environment overrides still win.

### 17. Make agent time aware — M/L — ✅ Done

Client already sends `timeZone`/`localDate` in appContext; inject a time line into the system prompt in `buildAgentInstructions()` (`src/lib/server/services/agent-runs/reasoning.ts:493`), reading from run appContext via `base-context.ts`/`context.ts`. Should also see metadata of when the objects were created (e.g., `createdAt` in `Note`, `Todo`, `Attachment`). Potentially be able to filter artifacts by time (e.g., "only consider notes created in the last 30 days") — would require a new `createdAfter`/`createdBefore` filter in the repository and a new `filterByDate()` helper in `base-context.ts`.

Done: prompts use the server clock rendered in the client IANA timezone with UTC fallback, compact agent views expose creation metadata, and inclusive `createdAfter`/`createdBefore` filters are available on time-bearing list tools and knowledge search. Indexed chunks persist and backfill their owning source's creation time for both lexical and semantic filtering.

### 18. Vision support in chat + documents — L — ✅ Done

Add a vision capability flag to the model catalog (`services/agent-runs/preferences.ts`), allow image content parts in run submission (`agent-request-factory.ts`, agent controller), and wire attachment upload into the chat UI. Builds on the existing image plumbing in `services/attachments/`.

Done: OpenRouter input modalities drive native-vision capability, user and conversation vision-model preferences mirror chat-model overrides, and every chat composer accepts pasted or picked PNG/JPEG/WebP images with four-image and 10 MiB limits, previews, removal, image-only sends, transcript thumbnails, native multimodal input, and fallback image descriptions.

### 19. Diagram revise sends screenshot to model — M/L — ✅ Done

Depends on vision (item 18). Render the diagram client-side (already happens in `Mermaid.svelte`), send the raster/SVG with the revise request; server: extend `revise_mermaid_diagram` (`agent-tool-factory.ts:794-812`, `services/diagrams/review.ts`) to accept and forward an image.

Done on the corrected path: `Mermaid.svelte` renders a bounded PNG from the exact edited source and active theme, then the inline revise command sends source, instruction, and image to `DiagramAuthoring`. Native-vision models are retained; text-only configured models fall back to the default vision model. Render failure preserves source-only repair, and the one-shot workflow no longer persists provider session JSON.

### 20. Redis + cron/pubsub embeddings pipeline — L — ✅ Done — Redis not adopted

Replace/augment the bespoke scheduler (`src/worker.ts`, `services/scheduler.ts`, `KnowledgeIndexMaintenance`) with a Redis-backed queue for embedding jobs. Architectural decision needed first — no Redis/queue dependency exists today. Investigate if we route chat streams through Redis as well to have cleaner resumable streams with less code.

Done: Postgres pending chunks remain the durable embedding queue, with the ten-minute sweep, durable run events, SSE cursor replay, and five-second defensive poll unchanged. Pub/Sub would remain lossy; a reliable Redis queue would require an outbox and reconciliation path without helping the current single-app/single-worker deployment. Index maintenance now reuses the shared batching and scheduler types.

### 21. Proactive agent mode (memory condensation + learning from "no") — L — ⏸ Not yet

New scheduled task via `startScheduler` calling an LLM condensation pass over `MemoryLibrary` (`services/memory/library.ts`), plus a notification surface and a feedback signal when the user declines. Largest, most open-ended item — needs its own design pass.

Not yet: the backlog remains, but memory condensation and learning from rejection are intentionally deferred until that design pass. No scheduler, preference, schema, feedback, or notification behavior has been added.
