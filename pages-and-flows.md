# Pages & Flows — Architect's Workbench

_Working document. Companion to the project brief and design system. Last updated: 2026-07-12._

## The shell

One persistent three-zone workbench wraps everything: a sidebar with navigation and the project filesystem, a document zone, and a contextual right panel. The right panel switches between Chat, Suggestions, and Todo detail. The command palette jumps to notes and actions without introducing a second taxonomy beside the project tree.

## Pages

**Today** is the triage surface: overdue and due-today todos, waiting-on work, pending suggestions, and recent or pinned notes.

**Projects and notes** are the core. Each project owns an arbitrarily deep tree of folders, notes, and skill documents. The note editor exposes Extract Promises, Relate, Reference, and Generate Diagram. Related notes appear as backlink chips; there are no entity chips or hubs.

**Todos** have kanban and list views. Filters cover status, mine versus waiting-on, project, source note, and due date. Waiting-on stores the counterparty as free text. Every generated todo links to its source anchor.

**Skills** are ordinary skill-kind documents in the project tree, with metadata and a usage log.

**Suggestions** is the global review queue, grouped by source note. Per-note suggestions also appear in the right panel.

**Settings** owns account, appearance, model configuration, and per-pipeline trust policies. OAuth and hosting remain separate work.

Chat has no page of its own. It stays in the right panel and carries the current project, note, and selection as context.

## Linking model

```text
Project tree ──▶ Note ──(backlink)──▶ Related note
Today ──(todo)──▶ Todo detail ──(source anchor)──▶ Note
Suggestions ──(source)──▶ Note
Skill usage ──▶ Note where it was applied
Chat citation ──▶ Note
```

Everything generated links back to a source. The right panel absorbs review and todo detail; changing the active document remains normal navigation.

## Core journeys

1. Capture a meeting note in the relevant project folder, extract promises, review suggestions, and see accepted todos in the note, Today, and the kanban.
2. Open a late waiting-on item, read its named counterparty, jump to the anchored sentence, and ask Chat to draft a follow-up.
3. Move a todo across the kanban, work in its source note, and complete the same object from its embedded node.
4. Generate a Mermaid diagram from selected prose, revise it, promote it to draw.io, and retain indexed diagram text.
5. Relate a new decision paragraph, follow a `contradicts` backlink directly to the prior note, then revise or supersede the decision.
6. Ground a claim with tiered references or receive an honest empty result.
7. Save a repeated methodology as a skill document and inspect where the agent used it.

## Component inventory

The established shadcn-svelte workbench remains. Custom composites are SuggestionCard, TodoNode, TodoCard, KanbanBoard, BacklinkChip, ReferenceCard, DiagramFrame, ProvenanceDot, ChatPanel, RightPanel, NoteTree, QuickCapture, and TrustPolicyControl. Deleted composites are EntityChip, EntityPeekPanel, EntitiesIndex, and EntityHubSections.

## Open items

- Whether kanban columns are configurable in v1.
- Mobile behavior beyond converting the right panel to a Sheet.
- Keyboard-driven suggestion triage.
