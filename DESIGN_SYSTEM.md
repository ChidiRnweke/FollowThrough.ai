# FollowThrough Design System

## Visual direction

- **Primary style:** Minimalism / Swiss. Typography, alignment, whitespace, flat surfaces, and a single teal accent provide the hierarchy.
- **Secondary styles and modifiers:** None. Forms, navigation, tables, and menus remain conventional.
- **Ornament budget:** Zero decorative motifs. Use rules, type, and spacing instead of shadows or illustration.
- **Color modes:** Preserve the existing semantic olive-neutral light and dark themes.
- **Product mark:** FollowThrough uses a flat teal tile with a continuous white F-to-check path.
  It replaces framework placeholder branding without adding gradients, shadows, or a broader
  ornament system.

## Tokens and composition

- Colors must use the semantic OKLCH tokens in `src/routes/layout.css`; do not introduce raw Tailwind palette colors.
- Inter is the display and body face, JetBrains Mono is reserved for code, and the note title uses the `note-title` typography utility.
- Spacing follows the existing Tailwind scale. Corners use the shared shadcn radius family and elevation stays flat.
- Use the installed shadcn-svelte controls for interactive elements. Domain wrappers may encode stable variants such as the document title input.
- Focus indicators, AA contrast, 44px touch targets for primary controls, reduced motion, and keyboard access are required.

## UX patterns

- **Offline fallback:** When an uncached route cannot load, use a focused single-action status page
  with the product mark, a plain-language connection explanation, and one retry action. Do not
  imply that uncached server data or online-only mutations are available.

- **Todos:** Progressive disclosure combines three familiar work surfaces. Basic Kanban is the default scanning view; Detailed Kanban exposes committed metadata edits in place; List is a compact editable matrix; the independent right panel is the complete master-detail editor. Board detail and board/list mode stay URL-addressable. Editable popovers must not resize cards or rows, and provenance remains separate from the user-selected source.
- **Project resources:** Todos, Memory, Artifacts, and Attachments use durable pages with a `Project > Resource` breadcrumb. The project name is always a link back to its overview; browser Back is never the only exit.
- Todo controls use the existing flat shadcn Select, Popover, Calendar, Command, Input, and Textarea components. Selection commits immediately; text commits on blur or Enter and restores its saved value on Escape or failure. Saving and errors are announced without a manual Save button.

- **Notes:** Document pattern. A quiet utility row precedes a prominent title and one continuous rich-text surface. The authored body uses the wider `note-measure` reading width and fills the remaining viewport.
- **Split notes:** Document-within-Workbench pattern. Note routes occupy the shell's fixed remaining height and never make the shell scroll. Each mounted note pane owns independent vertical and horizontal scrolling. At narrow workspace widths, one pane is shown at a time without discarding the canonical split URL or the saved divider ratio.
- Backlinks and AI suggestions are compact context, not competing document chrome. Authored links and references share a forgiving title-and-URL hover preview, expose the active destination in a compact bottom-right status card, and open from the editable document with Cmd/Ctrl+click. References do not create a trailing card section.
- Note actions stay contextual in the overflow or selection bubble menu. Saving is automatic with a visible status; Cmd/Ctrl+S remains available.
- Note synchronization stays in the quiet utility row. Pending device saves and conflicts are explicit;
  three-way comparison belongs in a focused dialog, and resolution always preserves a complete rich
  document version.
- Inline Mermaid diagrams may expose a compact draw.io conversion action. While conversion review is pending, the Mermaid block remains unchanged and carries a restrained review row; acceptance inserts a flat draw.io preview immediately after it, while dismissal removes only the pending state.
- Draw.io conversion review uses a focused dialog over the source note. Accepted draw.io references render a reserved, non-shifting image preview with title, saved status, and one “Open in draw.io” action.
- The note-scoped draw.io editor is a focused editing mode with a quiet back action, explicit Save, accessible loading/saving/failure announcements, and leave protection for modified content. It reuses the document visual system and does not introduce another workbench shell or new design tokens.
- **Chat:** Conversational pattern. Desktop uses the contextual right panel for quick work; mobile and durable links use full-page `/chats/new` and `/chats/[id]` routes.
- Show no more than five recent chats in the panel. Full history belongs on `/chats`, with project/note origin visible in both locations.
- A submitted turn renders immediate three-dot activity, then human-readable tool or streaming state. Stop, retry, failure, and cancellation are explicit and announced accessibly.
- User messages expose copy and edit-in-composer actions; assistant messages expose copy and retry when eligible. Retrying never duplicates the visible user turn.
- Conversation origin is fixed on its first turn and distinct from context chips added later. Full-page chats link back through project/note breadcrumbs.
- Auto-scroll only while the reader is at the latest turn; preserve their position when they scroll upward.

## Anti-patterns

- Do not wrap the note in a card, add decorative shadows, or place a permanent formatting toolbar above it.
- Do not place helper copy or secondary actions ahead of the title.
- Do not leave dead space beneath an empty note; the remaining document surface must accept focus.
- Do not introduce arbitrary colors, widths, typography values, or raw form controls.
- Do not render reference-specific background highlights, left-border callouts, or a separate bibliography below notes.
- Do not accept draw.io conversions from the general Suggestions inbox, render exported SVG as application HTML, enable iframe autosave, or add diagram revision/history chrome to the current editor slice.
- Do not show raw tool identifiers as primary chat status, silently wait for a first token, duplicate a prompt during retry, or hide chat entirely on mobile.

## Agent context and transition UX

Agent context is ambient and has no raw JSON UI. The chat follows the user's actual interaction focus in split panes without reordering panes or changing the URL-primary tab. Same-project movement is silent. An ambiguous cross-project continuation uses one concise text clarification naming both projects and offers either the existing New chat control or continuing in the current chat; no structured resolution card or model-controlled navigation is introduced.
