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
- **Mark usage:** The mark renders via `src/lib/components/shared/brand-mark.svelte` (semantic
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
  reaches the page _only_ through the `page-title` utility — never through
  `font-serif` applied by hand, and never on chrome, controls, or metadata. JetBrains Mono stays
  reserved for code. The base-layer `h1..h6` rule deliberately stays Inter so section headings,
  dialog titles, and settings groups do not inherit the display face.
- **Rejected on purpose:** monospace metadata (dates, counts, provenance) was considered and
  rejected — it reads as a developer tool and breaks the mono-means-code rule.
- **Chrome legibility floor:** primary navigation never renders below `sm` — the workspace tab
  strip (40px tall, `sm` labels), the sidebar wordmark (`base`/semibold beside the mark), and the
  empty-strip placeholder are chrome-scale exceptions, not content captions. `xs` is reserved for
  eyebrows and provenance captions.
- **Type scale:** app code uses the named utilities in `layout.css` instead of raw heading size classes — `page-title` (one per page), `section-title` (content sections), `eyebrow` (uppercase muted label above a group of items), and `provenance-caption` (per-item metadata). The ladder is eyebrow/caption → body → section-title → page-title. Form labels (shadcn `Label`) are small and muted so values lead; `Field.Title` stays at body size above its muted description.
- Spacing follows the existing Tailwind scale. Corners use the shared shadcn radius family and elevation stays flat.
- **Spacing is the hierarchy.** In a Swiss layout with flat surfaces and one accent, the gap
  between two things is the primary statement about whether they belong together — so gaps
  step rather than repeat. The page ladder: 4px binds a label to its value or a title to its
  description (they read as one unit); 8px separates items inside a group; 24px separates
  groups; a further step, or a change of row density, introduces content of a different
  kind. Navigation sits one step away from identity, and identity one step from content.
  `PageShell` already encodes the header end of this ladder, which is why overriding its
  `header` snippet with a flat `gap-1` stack is a regression rather than a shortcut, and
  `src/lib/components/projects/workspace/project-overview.svelte` is the reference implementation for
  the content end. A screen whose every gap is equal has no hierarchy no matter how well its
  content is grouped, and the fix is never a divider.
- Use the installed shadcn-svelte controls for interactive elements. Domain wrappers may encode
  stable variants, but a wrapper that fights a shadcn base class is the wrong tool: the document
  title once applied a display-size utility to a shadcn `Input` whose own `md:text-sm` won, and it
  shipped at caption size. Where a control needs to escape its base scale, write the bare element.
- Focus indicators, AA contrast, 44px touch targets for primary controls, reduced motion, and keyboard access are required.

### Interaction states

Every clickable surface says so. It shows `cursor: pointer` and rises 1px on hover and keyboard
focus, at `--duration-micro` / `--ease-standard`, settling back to its resting position on
`:active` so the press reads as a press. **Motion, not elevation** — no hover shadows; the
flat-surface rule above still holds, and a 1px travel is feedback rather than ornament.

Three exceptions, all for the same reason — a surface that moves out from under the pointer
mid-click causes mis-selection:

- Menu, select, and command rows take the cursor but never the lift.
- A control holding a nested control (a workspace tab and its close button) takes the cursor only,
  so the two lifts don't compound.
- Sidebar tree rows sit in a dense stack under absolutely-positioned hover actions; cursor only.

**The cursor is not your problem.** A `@layer base` rule in `layout.css` gives `cursor: pointer`
to every `button`, `summary`, `a[href]`, file-input `label`, and ARIA interactive role, restoring
what Tailwind v4's preflight removed. It covers shadcn, our own components, and the vendored
editor's toolbars alike. Because it sits in `base`, a `cursor-*` utility on the element still
wins — which is how the drag handles keep `cursor-grab`, the split resizer keeps
`cursor-col-resize`, and the editable surface keeps `cursor-text`. **Never hand-roll
`cursor-pointer`**; if a control lacks the pointer, it is not reachable by that rule and the fix
belongs in the rule.

The lift is stated in exactly three places:

- `buttonVariants.base` (`ui/button/button.svelte`) — every shadcn `Button` and `Button href`.
- `@utility row-interactive` (`layout.css`) — list rows.
- `@utility tactile` (`layout.css`) — discrete targets that are not shadcn controls: a bare
  `<button>`, or a `<label>` standing in for one.

An unlayered `prefers-reduced-motion` block opts the lift out entirely rather than merely
un-transitioning it, since the base guard only collapses durations and would turn the lift into
a jump.

Inside the editor, `.tiptap` sets `cursor: text` for the whole editable surface, and
`editor.css` walks it back for anything that is not text — block node views, images, media,
diagrams — with nested `[contenteditable='true']` islands taking it back again. An I-beam over
a light diagram fill is effectively invisible, which is how the pointer gets lost.

## Voice & tone

Calm, dry, second person, present tense. One sentence, period included, no exclamation marks.
The product celebrates the absence of work rather than apologizing for empty screens.

- Canonical empty-state lines: "Nothing overdue. Well held." · "Nothing due today." ·
  "Not waiting on anyone." · "Pin a note to keep it at hand." · "Notes you touch show up here." ·
  kanban columns use `todoStatusEmptyCopy` in `src/lib/components/shared/labels.ts`.
- The Today page greets with the date as an eyebrow ("Tuesday · 22 July") and a time-aware
  subtitle (morning/afternoon/evening variants). No user name, no weather, no emoji.
- Errors state what happened and the fix, specifically and without apology.

## Empty states

Empty regions are invitations to act, never dead blank space. Use
`src/lib/components/shared/empty-state.svelte`: a quiet icon, one voice line, an optional hint,
and at most one action. It comes in two sizes: the default slot size (bare muted icon, all-muted
copy) fills inline gaps — a grid cell, a side panel; `size="large"` is the hero treatment for a
region that carries a page or a whole section — a brand-wash icon tile (`size-16 rounded-lg
bg-brand/10 text-brand dark:bg-brand/15`, the project-overview resource-chip recipe), a
statement in foreground, one supporting line, then the action. Kanban columns keep their drop
zone and center the voice line inside it.

## UX patterns

- **Offline fallback:** When an uncached route cannot load, use a focused single-action status page
  with the product mark, a plain-language connection explanation, and one retry action. Do not
  imply that uncached server data or online-only mutations are available.

- **Todos:** Two scanning surfaces and one editor. Board and List are alternate views of the same
  set and stay URL-addressable; the independent right panel is the complete master-detail editor.
  There is no second board-density toggle — a card shows its title plus whatever metadata is
  actually set, and anything more belongs in the panel. Editable popovers must not resize cards or
  rows, and provenance remains separate from the user-selected source.
- **Data surfaces get their own measure.** A board or table starved by the reading column produces
  clipped titles and inner scrollbars, so `PageShell width="wide"` widens the content while the
  header keeps the reading measure. Prose keeps the default `prose` width.
- **Quiet at rest, control on hover.** Metadata values render as text and reveal their control on
  hover, keyboard focus, or when open (`.field-quiet`). This keeps one-click editing without a page
  of boxes competing with the content; the affordance is deferred, never removed.
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

- **Notes:** Document pattern. A quiet utility row carrying the breadcrumb, save status, and note
  actions precedes one continuous rich-text surface. The note's title lives in the breadcrumb's
  current-page segment — the single place it appears — and is edited in place through a pencil that
  reveals on hover (always visible while the note is untitled, since an untitled note cannot save).
  Enter commits and moves the caret into the body, Escape reverts, blur commits. The document's own
  first heading is what reads as its visual title. The authored body uses the wider `note-measure`
  reading width and fills the remaining viewport.
- **Split notes:** Document-within-Workbench pattern. Note routes occupy the shell's fixed remaining height and never make the shell scroll. Each mounted note pane owns independent vertical and horizontal scrolling. At narrow workspace widths, one pane is shown at a time without discarding the canonical split URL or the saved divider ratio.
- Backlinks and AI suggestions are compact context, not competing document chrome. Authored links and references share a forgiving title-and-URL hover preview, expose the active destination in a compact bottom-right status card, and open from the editable document with Cmd/Ctrl+click. References do not create a trailing card section.
- Note actions stay contextual in the overflow or selection bubble menu. Saving is automatic with a visible status; Cmd/Ctrl+S remains available.
- **A selection action answers where it was asked.** While one runs, the bubble menu becomes a
  single status line in the same box — the action's own icon, one present-tense clause, and the
  chat's three-dot activity — and the selected text holds a brand wash until the result settles.
  The wash is what survives the click that clears the caret selection, so a multi-second agent
  turn is never traceless; it reveals after `--duration-micro` so a fast action does not flash.
  The header spinner is the fallback for a selection scrolled out of view, not the primary
  signal — feedback that lives only in the page chrome reads as nothing having happened.
- Note synchronization stays in the quiet utility row. Pending device saves and conflicts are explicit;
  three-way comparison belongs in a focused dialog, and resolution always preserves a complete rich
  document version.
- **Diagram editing is a canvas, not a preview.** The Mermaid editor's preview half is a fixed box
  that scrolls in both axes, with its own zoom: a floating −/percentage/+ cluster on the canvas
  rather than in the toolbar, ctrl/⌘+wheel and trackpad pinch for continuous zoom, and the
  percentage as a reset. The zoom is transient and never touches the block's width in the document
  — those are different questions and conflating them resizes the note as a side effect of reading.
  Centring on a scrollable canvas must be `safe`: ordinary centring, and `margin: auto` on a flex
  item, put overflow past the scroll origin where no scrollbar reaches it.
- Inline Mermaid diagrams may expose a compact draw.io conversion action. While conversion review is pending, the Mermaid block remains unchanged and carries a restrained review row; acceptance inserts a flat draw.io preview immediately after it, while dismissal removes only the pending state.
- Draw.io conversion review uses a focused dialog over the source note. Accepted draw.io references render a reserved, non-shifting image preview with title, saved status, and one “Open in draw.io” action.
- The note-scoped draw.io editor is a focused editing mode with a quiet back action, explicit Save, accessible loading/saving/failure announcements, and leave protection for modified content. It reuses the document visual system and does not introduce another workbench shell or new design tokens.
- **Chat:** Conversational pattern. The contextual right panel stays inline at `2xl` and opens as a Sheet below `2xl`; durable links use full-page `/chats/new` and `/chats/[id]` routes.
- Show no more than five recent chats in the panel. Full history belongs on `/chats`, with project/note origin visible in both locations.
- A submitted turn renders immediate three-dot activity, then human-readable tool or streaming state. Stop, retry, failure, and cancellation are explicit and announced accessibly.
- User messages expose copy and edit-in-composer actions; assistant messages expose copy and retry when eligible. Retrying never duplicates the visible user turn.
- Conversation origin is fixed on its first turn and distinct from context chips added later. Full-page chats link back through project/note breadcrumbs.
- Auto-scroll only while the reader is at the latest turn; preserve their position when they scroll upward.
- The empty thread teaches before it lists. Route-aware starters name an action with a destination
  ("extract commitments into todos"), never a bare question — they are the only place the panel can
  show that the agent writes as well as answers. Recent chats sit below them, not above. Both groups
  are borderless divided rows, never filled or outlined buttons: three pill buttons stacked in a
  384px column read as a form, and nothing else in the app looks like that. Starters stay short
  enough to hold one line at panel width.
- The panel does not narrate its own context mechanics. "The open note travels along, type @ to add
  more" was prose describing what the dismissible context chip above the composer and the composer
  placeholder already show; the chip is the explanation.
- Recent chats in the panel are one line each — title and time — and show three. `/chats` keeps the
  fuller row where project/note origin is the reason to look. Five remains the panel's cap.
- **Agent context bar:** one plain-language sentence above the thread naming the scope ("Before it
  answers, the agent reads what is in Inbox:") followed by a quiet row of text links with counts,
  including zero. It is written for someone who knows nothing about how models work, so it says what
  happens rather than naming a mechanism. Only the project name carries the brand accent; the items
  are muted text with a hairline icon, never chips or washes. Every item explains itself on hover at
  any count. Artifacts are deliberately absent: they are the agent's output and are not indexed, so
  they belong to the project overview's "Produced here" group. Navigating re-derives the row with a
  short staggered re-entry, so a change of project reads as the agent re-orienting rather than as a
  number quietly changing.
- Execution mode stays visible in the composer. Auto-accept lets the agent change notes and todos
  without asking; a mode that consequential is not a preference to hide behind a settings popover.
  Model choice and prompt preferences, which are set once, do belong there.

## Anti-patterns

- Do not wrap the note in a card, add decorative shadows, or place a permanent formatting toolbar above it.
- Do not reintroduce a second copy of the note title above the body; the breadcrumb segment is the
  only one, and a standalone title element duplicated it.
- Do not leave dead space beneath an empty note; the remaining document surface must accept focus.
- Do not introduce arbitrary colors, widths, typography values, or raw form controls.
- Do not hand-roll `cursor-pointer`, a hover lift, or a hover shadow on a control. The contract is
  global (see "Interaction states"); a local copy is how it drifted the first time.
- Do not add Mermaid theme variables in response to an unreadable diagram. They lose to the
  diagram's own `classDef`, `style`, and `linkStyle`, so a diagram that colors itself keeps
  its colors regardless, and each one added is a parallel palette to maintain. The rendered
  theme stays limited to the tokens that describe our surfaces.
  - **Diagram export is the exception**, and only at export time. A diagram leaving the app
    lands in a document whose background we do not control, so the reader picks the palette
    and whether to paint a background at all — the app's light and dark token sets are the
    presets, and a custom palette overrides individual tokens on top of one. This is a
    property of the export, not new theming: nothing here changes how a diagram renders in
    the editor, and the `classDef` caveat above still applies to whatever is chosen.
- Do not render a chip, badge, or control for a value that is not set. An empty field shows nothing
  on a card and an em dash in the property panel; a column of "No due date / No priority / No
  source" is noise that reads as content.
  - The one exception is the agent context bar, where a capability renders at zero. There the count
    is not the point: `Memory 0` with its hover explanation is the only moment a user has a reason
    to learn that project memory exists, so the empty state is doing the teaching. This holds only
    for capabilities the agent reads, and only in that bar — it is not a licence to render empty
    values anywhere else.
- Do not repeat the page title as the trailing breadcrumb crumb. The breadcrumb carries ancestors
  and the exit path; the `h1` names the current page.
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
