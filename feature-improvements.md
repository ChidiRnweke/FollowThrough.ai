# Feature Improvements — Scoped & Grouped

Complexity: **S** = small/localized, **M** = multi-file feature, **L** = cross-cutting or architectural.

## Group 1 — Editor & Notes UI (edra, note editor, sidebar)

### 1. Reorder notes in sidebar — S/M — ✅ Done
`position` ordering already exists in the schema (`src/lib/server/db/schema.ts`, `notes.position`) and the sidebar tree already uses `svelte-dnd-action` (`src/lib/components/app/project-tree.svelte`); the gap is persisting reorder drops. Touch: `project-tree.svelte`, `src/lib/client/note-drag.ts`, `src/lib/stores/project-actions.svelte.ts`, notes repository update method.

Fixed: the grip was a `<button>`, and svelte-dnd-action refuses drags whose mousedown target has a `value` property (nested-input guard) — every `<button>` has one, so the grip was ungrabbable. Replaced with a styled `<span use:dragHandle>` (the pattern `todo-card.svelte` already uses).

### 2. Sticky table header on scroll in note — S
Pure CSS on the Tiptap table styles (`src/lib/components/edra/editor.css:409-523`, `.tableWrapper thead th { position: sticky }`). Possibly a small tweak in `TableCol.svelte`/`TableRow.svelte` if borders clip.

### 3. Paste images into a note — M
Add an image/file branch to the existing paste handler (`src/lib/components/edra/commands/paste.ts`), reusing the attachment upload plumbing (`src/lib/client/attachments/`, `file-dropzone.svelte`) and image node (`commands/image-node.ts`, `ImageExtended.svelte`).

### 4. Link inside a document — S
`[[note]]` internal linking already exists (`commands/NoteLinkSuggestion.ts`, `NoteLinkList.svelte`, `reference-link-plugin.ts`); scope is likely anchor/heading links or polishing the Link mark UX (`commands/extensions.ts`, `Link.svelte`). Needs one clarifying pass on what "link inside" means.

### 5. Right-click context menu in editor — M
No `contextmenu` handling today; the `ui/context-menu` primitive exists and is already used in `project-tree.svelte`. Touch: `src/lib/components/app/note-editor.svelte`, new menu component offering paste raw / paste merge formatting / copy raw / copy formatting.

### 6. Selection controls hidden when text is at top — S
The BubbleMenu (`src/lib/components/edra/BubbleMenu.svelte`, instance in `note-editor.svelte:457-571`) flips below the selection but likely clips at the container top. Fix placement/offset/overflow in the bubble menu config.

### 7. Ctrl+A copies diagrams as images — M
Hook copy behavior into the Mermaid node view (`src/lib/components/edra/Mermaid.svelte`) using the existing export pipeline (`MermaidExportMenu.svelte`, `mermaid-export.ts`) to put a PNG on the clipboard.

## Group 2 — Chat & Agent UI

### 8. Bundle parallel tool calls + "approve all" — M
Group concurrent approval cards in the chat panel and add an approve-all action. Touch: `tool-approval-card.svelte`, `agent-action.svelte`, `agent-actions.ts`, `chat-panel.svelte`.

### 9. Read-note output label — S
Add/adjust entries in the label maps in `src/lib/components/app/agent/tool-presentation.ts` (and `labels.ts` if needed) so the note name is shown instead of "read markdown".

### 10. Formatting in reasoning + collapsed by default with clickable title — S
Render reasoning through the existing markdown renderer (`chat-markdown.svelte`) inside `chat-reasoning.svelte`, default to collapsed, make the title row toggle.

## Group 3 — Todos & Backlog

### 11. Backlog "add" focuses input immediately — S — ✅ Done
The kanban add row already has `autofocus` (`kanban-board.svelte:132`); likely a Svelte timing issue — replace with an `onMount`/tick focus action.

Fixed: `autofocus` is unreliable for elements created inside an `{#if}` after mount. Replaced with a Svelte 5 attachment `{@attach (node) => node.focus()}` on the add-row `Input` (same pattern as `{@attach focusAtEnd}` in `chat-panel.svelte`).

### 12. Search bars fully green on focus — S
Unify focus styling across `model-picker.svelte` (Command.Input), `app-sidebar.svelte`/`command-palette.svelte`, and `todos-workspace.svelte:103` Input; likely a shared class in `ui/input` / `ui/command` primitives.

### 13. Ugly todo card border (missing top/right) — S
Debug border rendering in `todo-card.svelte` and the `ui/card` primitive — likely a collapsed-border/ring conflict with the dnd `lifted` styling.

### 14. Sort controls for todo table — M
Add sortable column headers to `todo-table.svelte` (client-side sort first); optionally extend `TodoListFilter` (`src/lib/models/domain.ts:1211`) if server-side sorting is wanted.

### 15. Tag todos by category + filter — L
New schema field + drizzle migration (`src/lib/server/db/schema.ts`, `drizzle/`), domain model + mapper updates (`domain.ts`, `db/mappers.ts`), repository filter, then UI: new category field in `todo-fields/`, filter bar in `todos-workspace.svelte`, `labels.ts`.

## Group 4 — Agent Platform & Backend

### 16. Increase web search limit — S
Bump `max_results`/`max_total_results` defaults in `src/lib/server/services/agent-runs/web-research.ts` (already env-configurable via `OPENROUTER_WEB_SEARCH_*`).

### 17. Make agent time aware — S
Client already sends `timeZone`/`localDate` in appContext; inject a time line into the system prompt in `buildAgentInstructions()` (`src/lib/server/services/agent-runs/reasoning.ts:493`), reading from run appContext via `base-context.ts`/`context.ts`.

### 18. Vision support in chat + documents — L
Add a vision capability flag to the model catalog (`services/agent-runs/preferences.ts`), allow image content parts in run submission (`agent-request-factory.ts`, agent controller), and wire attachment upload into the chat UI. Builds on the existing image plumbing in `services/attachments/`.

### 19. Diagram revise sends screenshot to model — M/L
Depends on vision (item 18). Render the diagram client-side (already happens in `Mermaid.svelte`), send the raster/SVG with the revise request; server: extend `revise_mermaid_diagram` (`agent-tool-factory.ts:794-812`, `services/diagrams/review.ts`) to accept and forward an image.

### 20. Redis + cron/pubsub embeddings pipeline — L
Replace/augment the bespoke scheduler (`src/worker.ts`, `services/scheduler.ts`, `KnowledgeIndexMaintenance`) with a Redis-backed queue for embedding jobs. Architectural decision needed first — no Redis/queue dependency exists today.

### 21. Proactive agent mode (memory condensation + learning from "no") — L
New scheduled task via `startScheduler` calling an LLM condensation pass over `MemoryLibrary` (`services/memory/library.ts`), plus a notification surface and a feedback signal when the user declines. Largest, most open-ended item — needs its own design pass.
