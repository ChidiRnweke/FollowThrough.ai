# FollowThrough Design System

## Visual direction

- **Primary style:** Minimalism / Swiss. Typography, alignment, whitespace, flat surfaces, and a single teal accent provide the hierarchy.
- **Secondary styles and modifiers:** None. Forms, navigation, tables, and menus remain conventional.
- **Ornament budget:** Zero decorative motifs. Use rules, type, and spacing instead of shadows or illustration.
- **Color modes:** Preserve the existing semantic olive-neutral light and dark themes.
- **Paper, not screen white:** Light-mode `--background`, `--card`, and `--popover` sit on the
  stone hue rather than pure white, and `--sidebar` is held a step below them so the rail stays a
  distinct surface. Dark mode is unchanged. Foreground and every other semantic token keep their
  values; `--muted-foreground` was darkened only to clear AA against the new background.
- **Surface rule — list before card:** A scannable collection of homogeneous rows is a borderless
  divided list (hairline dividers plus the `row-interactive` hover wash), never a bordered card
  wrapping bordered rows. Reserve a card for a surface holding heterogeneous content or its own
  actions. Nesting same-weight rectangles is the failure mode this rule exists to prevent.
- **Product mark:** FollowThrough uses a flat teal tile with a continuous white F-to-check path.
  It replaces framework placeholder branding without adding gradients, shadows, or a broader
  ornament system.
- **Mark usage:** The mark renders via `src/lib/components/app/brand-mark.svelte` (semantic
  tokens, both color modes). It is always present in the sidebar header — the mark alone in
  icon-collapsed mode — and on the offline page. It is never decorated, recolored per-context,
  or repeated inside content surfaces.
- **Accent discipline:** Teal marks the live thing; olive-neutral is everything at rest. Active
  sidebar navigation, the selected segment of tabs/toggle groups, and provenance chips carry the
  `--brand` accent. Data values, metadata, and resting chrome stay gray. `--brand` equals
  `--primary` in light mode and lifts to the sidebar teal in dark mode for AA contrast on washes.
- **Project identity:** Projects are identified by the brand teal, never by per-project hues.
  The sidebar project icon, project badges (`Badge variant="brand"`), breadcrumb links,
  chat origin lines, artifact format badges, and the project-overview resource icon chips all
  use `--brand` text with the shared `bg-brand/10` wash (`dark:bg-brand/15`). No new wash
  tokens: the badge `brand` variant is the canonical recipe.

## Tokens and composition

- Colors must use the semantic OKLCH tokens in `src/routes/layout.css`; do not introduce raw Tailwind palette colors.
- **Faces:** Inter is the body, chrome, and metadata face. Newsreader is the display face and
  reaches the page _only_ through the `page-title` and `note-title` utilities — never through
  `font-serif` applied by hand, and never on chrome, controls, or metadata. JetBrains Mono stays
  reserved for code. The base-layer `h1..h6` rule deliberately stays Inter so section headings,
  dialog titles, and settings groups do not inherit the display face.
- **Rejected on purpose:** monospace metadata (dates, counts, provenance) was considered and
  rejected — it reads as a developer tool and breaks the mono-means-code rule.
- **Chrome legibility floor:** primary navigation never renders below `sm` — the workspace tab
  strip (40px tall, `sm` labels), the sidebar wordmark (`base`/semibold beside the mark), and the
  empty-strip placeholder are chrome-scale exceptions, not content captions. `xs` is reserved for
  eyebrows and provenance captions.
- **Type scale:** app code uses the named utilities in `layout.css` instead of raw heading size classes — `page-title` (one per page), `section-title` (content sections), `eyebrow` (uppercase muted label above a group of items), and `provenance-caption` (per-item metadata). The ladder is eyebrow/caption → body → section-title → page-title → note-title. Form labels (shadcn `Label`) are small and muted so values lead; `Field.Title` stays at body size above its muted description.
- Spacing follows the existing Tailwind scale. Corners use the shared shadcn radius family and elevation stays flat.
- Use the installed shadcn-svelte controls for interactive elements. Domain wrappers may encode stable variants such as the document title input.
- Focus indicators, AA contrast, 44px touch targets for primary controls, reduced motion, and keyboard access are required.

## Voice & tone

Calm, dry, second person, present tense. One sentence, period included, no exclamation marks.
The product celebrates the absence of work rather than apologizing for empty screens.

- Canonical empty-state lines: "Nothing overdue. Well held." · "Nothing due today." ·
  "Not waiting on anyone." · "Pin a note to keep it at hand." · "Notes you touch show up here." ·
  kanban columns use `todoStatusEmptyCopy` in `src/lib/components/app/labels.ts`.
- The Today page greets with the date as an eyebrow ("Tuesday · 22 July") and a time-aware
  subtitle (morning/afternoon/evening variants). No user name, no weather, no emoji.
- Errors state what happened and the fix, specifically and without apology.

## Empty states

Empty regions are invitations to act, never dead blank space. Use
`src/lib/components/app/empty-state.svelte`: a quiet icon, one voice line, an optional hint,
and at most one action. Kanban columns keep their drop zone and center the voice line inside it.

## UX patterns

- **Offline fallback:** When an uncached route cannot load, use a focused single-action status page
  with the product mark, a plain-language connection explanation, and one retry action. Do not
  imply that uncached server data or online-only mutations are available.

- **Todos:** Progressive disclosure combines three familiar work surfaces. Basic Kanban is the default scanning view; Detailed Kanban exposes committed metadata edits in place; List is a compact editable matrix; the independent right panel is the complete master-detail editor. Board detail and board/list mode stay URL-addressable. Editable popovers must not resize cards or rows, and provenance remains separate from the user-selected source.
- **Project resources:** Todos, Memory, Artifacts, and Attachments use durable pages with a `Project > Resource` breadcrumb. The project name is always a link back to its overview; browser Back is never the only exit.
- **Project overview:** The four spaces are grouped by what they do for you — what the project
  produced versus what the agent works from — rather than listed as four equal nouns. A space that
  is empty states its purpose through a rotating tip instead of showing a zero, and every tip must
  describe behaviour the code actually has. Tips are chosen in the loader, never at render time.
- **Grouping is spacing and similarity, not more rules.** On the overview the spaces cluster at
  base size with no dividers while the documents list uses `sm` rows and hairlines, so the two read
  as different kinds of thing. Gaps step 8px inside a group → 24px between groups → a further step
  before the documents list. Equal gaps and repeated dividers flatten a page into peer sections
  however well its content is grouped.
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
- **Chat:** Conversational pattern. The contextual right panel stays inline at `2xl` and opens as a Sheet below `2xl`; durable links use full-page `/chats/new` and `/chats/[id]` routes.
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

## Responsive application contract

FollowThrough uses Tailwind's standard `base`, `sm`, `md`, `lg`, `xl`, and `2xl` viewport breakpoints. Do not introduce bespoke viewport breakpoints. The note editor's existing container queries are an intentional exception because they respond to pane width rather than viewport width.

- Base layouts prioritize one readable task at a time. Dense master-detail and workbench layouts collapse to route-backed drill-down surfaces.
- Interactive controls on compact and touch layouts have a minimum 44 × 44px target. Desktop-only dense controls may remain smaller from `md` upward.
- The application shell owns `100dvh` and prevents document-level overflow. Boards, matrices, code editors, and independently scrolling panes may own intentional overflow.
- Compact bottom actions and composers include safe-area padding where they meet the viewport edge.
- Below `2xl`, contextual chat, suggestions, and project memory use a full-width Sheet on phones and a constrained Sheet from `sm`; Todo details use full-page routes.
- At `2xl`, the sidebar, content, and 24rem contextual panel may appear simultaneously. Their scrolling remains independent and the existing desktop content measures are preserved.
- Responsive geometry must be identical in light and dark modes; only semantic token values change.
