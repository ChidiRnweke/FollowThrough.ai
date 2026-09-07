# FollowThrough Design System

## Visual direction

- **Primary style:** Minimalism / Swiss. Typography, alignment, whitespace, flat surfaces, and a
  single teal accent provide the hierarchy. Zero decorative motifs — use rules, type, and spacing
  instead of shadows or illustration. Preserve the existing semantic olive-neutral light and dark
  themes.
- **Paper, not screen white:** light-mode `--background`, `--card`, and `--popover` sit on the
  stone hue rather than pure white, and `--sidebar` is held a step below them so the rail stays a
  distinct surface. Dark mode is unchanged.
- **Surface rule — list before card:** A scannable collection of homogeneous rows is a borderless
  divided list (hairline dividers plus the `row-interactive` hover wash), never a bordered card
  wrapping bordered rows. Reserve a card for heterogeneous content or a surface with its own
  actions. Nesting same-weight rectangles is the failure mode this rule exists to prevent.
- **One fill per surface:** Light-mode fields and field-like triggers (`Input`, `Textarea`,
  `InputGroup`, `Select` trigger, `Button variant="outline"`) fill with `bg-background`; the
  `bg-input/30` fill is dark-mode-only. The border, not a fill contrast, marks the control in
  light mode.
- **Product mark:** a flat teal tile with a continuous white F-to-check path, rendered via
  `brand-mark.svelte` (semantic tokens, both color modes). Always present in the sidebar header
  (alone in icon-collapsed mode) and on the offline page. Never decorated, recolored
  per-context, or repeated inside content surfaces.
- **Accent discipline:** Teal marks the live thing; olive-neutral is everything at rest. Active
  sidebar navigation, the selected segment of tabs/toggle groups, and provenance chips carry
  `--brand`. Data values, metadata, and resting chrome use neutral ink on neutral surfaces.
  On colored surfaces, secondary ink follows the surface hue (see below). `--brand` equals `--primary`
  in light mode and lifts to the sidebar teal in dark mode for AA contrast on washes.
- **Project identity:** Projects are identified by the brand teal, never per-project hues: the
  sidebar project icon, `Badge variant="brand"`, breadcrumb links, chat origin lines, artifact
  format badges, and overview resource chips use `--brand` text on the shared `bg-brand/10` wash
  (`dark:bg-brand/15`). No new wash tokens — the badge `brand` variant is the canonical recipe.
- **The workspace tab strip carries the identity wash; its tabs do not.** The strip surface is
  `bg-brand/10` (`dark:bg-brand/15`); resting tabs and run group labels paint nothing at all —
  they are labels on that surface. The only painted tiles are the tabs currently on screen:
  `bg-brand/20` for a split's second pane, `bg-brand/30` for the focused one (+5% each in dark),
  `h-9 self-end` in the 40px strip so 4px of strip shows above. Never bold the active tab.
  Hairline ticks between tabs are a short 35% brand `::after` inset 10px top and bottom,
  matching the `my-2.5` divider after the group label. See `[data-slot='workspace-tab']` in
  `layout.css`.
- **The reader's own words carry the accent:** the user's chat turn takes the same `bg-brand/10`
  (`dark:bg-brand/15`) wash; `bg-muted` is the fill of disabled notices and hover rows. The text
  stays `foreground` — a wash marks the turn, tinted prose would be reading it aloud in colour.

## Text on colored surfaces

- Secondary labels, metadata, placeholders, and control icons on brand washes use opaque
  `text-brand-muted-foreground`; error-wash explanations use `text-destructive-muted-foreground`.
  The tokens have separate light/dark values. Neutral surfaces retain `text-muted-foreground`.
- Never reduce text opacity to create hierarchy on a colored surface. Primary prose keeps
  `text-foreground`; solid buttons retain their paired foreground token. Disabled controls and
  reveal/hide transitions are distinct states, not recipes for secondary text.
- Check actual composited backgrounds, including nested tab fills, hover, focus, and selected
  states: normal text needs 4.5:1 contrast, essential control icons 3:1. A hue match alone does
  not establish legibility. Scope corrections to the surface owner; neutral nested controls and
  portalled popovers must retain their own palette.

- Find candidates without a browser using `pnpm audit:surface-text` (`--json` for structured
  output). See [the audit guide](../src/content/docs/guides/audit-surface-text.md) for review
  rules, the quick ripgrep searches, and optional rendered contrast checks.

## Tokens and composition

- Colors use the semantic OKLCH tokens in `src/routes/layout.css`; do not introduce raw Tailwind
  palette colors.
- **Shade ladders are picked up front, never derived at render time.** Every shade a component
  uses is a token chosen by eye in `layout.css`; `color-mix()`, relative color syntax, and
  `lighten()`/`darken()` at call sites are banned. The documented alpha steps
  (`bg-brand/10`–`/30`, `dark:/15`) are the only sanctioned derivation. Within a ladder, chroma
  holds — and rises — at the lightness extremes so the ends don't wash out, and the greys keep
  the single olive temperature at every step.
- **Color never carries meaning alone.** Wherever color signals state — status badges, diff
  markings, deltas — it is paired with an icon, a sign, or a label. The proofreading marks are
  the model: hue plus underline style.
- **Faces:** Inter is the body, chrome, and metadata face. Newsreader is the display face and
  reaches the page only through the `page-title` utility — never `font-serif` by hand, never on
  chrome, controls, or metadata. JetBrains Mono stays reserved for code; monospace metadata was
  considered and rejected, because it breaks mono-means-code. The base-layer `h1..h6` rule stays
  Inter so section headings, dialog titles, and settings groups do not inherit the display face.
- **Chrome legibility floor:** primary navigation never renders below `sm` — the workspace tab
  strip (40px tall, `sm` labels), the sidebar wordmark, and the empty-strip placeholder are the
  exceptions, not content captions. `xs` is reserved for eyebrows and provenance captions.
- **Type scale:** app code uses the named utilities in `layout.css` — `page-title` (one per
  page), `section-title` (content sections), `eyebrow` (uppercase muted label above a group),
  `provenance-caption` (per-item metadata). The ladder is
  2xs → eyebrow/caption → label → body → section-title → page-title. Form labels are small and
  muted so values lead; `Field.Title` stays at body size above its muted description.
- **Two rungs below caption, for nested chrome only.** `text-label` (13px) is a line that titles
  the block under it; `text-2xs` (11px) is quoted machine output — an excerpt, a field list, a
  matched line. They exist because one surface stacks four levels inside a 384px column, and two
  rungs could not carry that. `caption` remains the floor for anything a reader reads as text: a
  label, a control, prose, a value. `2xs` is only ever skimmed, and the surface that uses it must
  offer a full-size way to actually read the content — the chat turn's "Read all of it" dialog is
  the reference. One pixel is not a level: a 1px step may narrow a boundary that colour, weight
  or indentation is already carrying, never carry one alone.
- **Authored note scale:** rich note and skill-editor content has its own document ladder: body
  16px/24.8px at 400/600; H1 32px/38px at 800; H2 24px/32px at 700; H3 20px/28px at 600; H4
  18px/26px at 600. Full-size read-only note diffs inherit it; compact diff previews embedded in
  chat deliberately keep their smaller local scale so they stay subordinate to the conversation.
- **Hierarchy spends weight and color before size.** De-emphasize secondary text with
  `text-muted-foreground` or a weight step before touching the ladder; primary content never
  exceeds its rung just to stand out, and secondary content never drops below `sm` just to sit
  back.
- **Three text-contrast tiers per surface, no more:** `foreground` for primary,
  `muted-foreground` for secondary, one lighter tier for tertiary — plus `--brand` only where
  Accent discipline sanctions it. A component mixing more is a wall-of-content smell.
- **Labels are a last resort.** Omit the label when the value's format (date, email, count) or
  position already identifies it; fold a necessary qualifier into natural phrasing
  ("3 bedrooms"). A genuinely needed label sits one tier below its value — the value leads.
- **One primary action per view.** A page or dialog carries at most one solid default `Button`;
  secondary actions take `outline`, tertiary take `ghost`/`link`. Destructive styling follows
  importance, not severity — the full `destructive` variant belongs only inside the confirmation
  step, where the destructive act is the primary action.
- **Mixed sizes on one line align by baseline,** not center — `items-baseline` on a flex row
  pairing a title with smaller text; `items-center` is for icons and controls.
- **Line-height runs inverse to font size.** Display sizes take tight leading, body text
  taller — the note ladder models it (H1 ≈1.19 against body ≈1.55). Loose leading on `text-xl`
  or larger is a violation, and widening a measure re-derives the leading with it.
- **Long-form text is never centered.** `text-center` is for headlines and self-contained
  blocks of two or three lines — the `empty-state.svelte` hero is the canonical case.
- **Numeric table columns right-align,** header and cells, so magnitudes compare down the
  column.
- **Links in chrome emphasize by weight and foreground,** not color; the tinted-underline link
  treatment is reserved for prose. Breadcrumb and project links keep their sanctioned `--brand`.
- **Spacing is the hierarchy.** Gaps step rather than repeat: 4px binds a label to its value (one
  unit); 8px separates items inside a group; 24px separates groups; a further step, or a change
  of row density, introduces a different kind of content. `PageShell` encodes the header end of
  the ladder — overriding its `header` snippet with a flat `gap-1` stack is a regression, not a
  shortcut — and `project-overview.svelte` is the reference for the content end. A screen whose
  every gap is equal has no hierarchy no matter how well its content is grouped, and the fix is
  never a divider. Spacing follows the Tailwind scale; corners use the shadcn radii family;
  elevation stays flat.
- **Ambiguous spacing is a violation.** Wherever spacing is the only thing grouping elements,
  within-group gaps are strictly smaller than between-group gaps; equal gaps at nested levels
  flatten the grouping, and the fix is a spacing step, never a divider.
- **Chrome takes a fixed width; content flexes.** The sidebar, the 24rem right panel, and
  drawers are sized for their contents — never as viewport fractions or grid-column shares.
- **Centered single-purpose surfaces use `max-w-*` or a measure token,** so they shrink only
  below their optimum — never fluid column spans that render wider on medium screens than on
  large ones.
- Use the installed shadcn-svelte controls for interactive elements. Domain wrappers may encode
  stable variants, but a wrapper that fights a shadcn base class is the wrong tool — where a
  control needs to escape its base scale, write the bare element.
- **Hairlines are inset rings; scroll content keeps a gutter.** A structural hairline is a
  `ring-inset ring-1` box-shadow (Card.Root, kanban columns), never an outward `ring-1` or
  `border` unless the element deliberately reads as in-flow. Content that can touch a
  scrollport's edge keeps an inset gutter ≥ the overlay scrollbar's width (~10px), because
  bits-ui scrollbars overlay rather than reserve space; see the `pr-3` chat-thread/right-panel
  gutters.
- Focus indicators, AA contrast, 44px touch targets for primary controls, reduced motion, and
  keyboard access are required.

### Interaction states

Every clickable surface says so: `cursor: pointer` and a 1px rise on hover and keyboard focus, at
`--duration-micro` / `--ease-standard`, settling back on `:active` so the press reads as a press.
**Motion, not elevation** — no hover shadows; the flat-surface rule still holds, and a 1px travel
is feedback rather than ornament.

Three lift exceptions, all for the same reason (a surface that moves out from under the pointer
mid-click causes mis-selection): menu/select/command rows, controls holding a nested control (a
workspace tab and its close button), and sidebar tree rows — cursor only, never the lift.

**The cursor is not your problem.** A `@layer base` rule in `layout.css` gives `cursor: pointer`
to every `button`, `summary`, `a[href]`, file-input `label`, and ARIA interactive role. A
`cursor-*` utility on the element still wins (drag handles keep `cursor-grab`, the split resizer
`cursor-col-resize`, the editable surface `cursor-text`). **Never hand-roll `cursor-pointer`**; if
a control lacks the pointer, the fix belongs in the rule.

The lift is stated in exactly three places:

- `buttonVariants.base` (`ui/button/button.svelte`).
- `@utility row-interactive` (`layout.css`) — list rows.
- `@utility tactile` (`layout.css`) — discrete targets that are not shadcn controls: a bare
  `<button>`, or a `<label>` standing in for one.

An unlayered `prefers-reduced-motion` block opts the lift out entirely — the base guard only
collapses durations and would turn the lift into a jump.

Inside the editor, `.tiptap` sets `cursor: text` for the whole editable surface, and `editor.css`
walks it back for anything that is not text — block node views, images, media, diagrams — with
nested `[contenteditable='true']` islands taking it back again.

### Disclosure

A row that opens onto its own detail grows into it, at `--duration-disclosure` (200ms) /
`--ease-standard`, via `@utility chat-disclosure` in `layout.css` (it animates against the height
the primitive measures before the state flips, so content below is pushed rather than jumped). It
is opt-in rather than a blanket rule on the collapsible primitive — a tree whose every branch
animates open is a slower tree, not a calmer one. The base reduced-motion guard collapses the
duration and is the whole fallback needed.

## Voice & tone

Calm, dry, second person, present tense. One sentence, period included, no exclamation marks. The
product celebrates the absence of work rather than apologizing for empty screens.

- Canonical empty-state lines: "Nothing overdue. Well held." · "Nothing due today." ·
  "Not waiting on anyone." · "Pin a note to keep it at hand." · "Notes you touch show up here." ·
  kanban columns use `todoStatusEmptyCopy` in `labels.ts`.
- The Today page greets with the date as an eyebrow ("Tuesday · 22 July") and a time-aware
  subtitle. No user name, no weather, no emoji.
- Errors state what happened and the fix, specifically and without apology.

## Empty states

Empty regions are invitations to act, never dead blank space. Use `empty-state.svelte`: a quiet
icon, one voice line, an optional hint, and at most one action. The default slot size (bare muted
icon, all-muted copy) fills inline gaps; `size="large"` is the hero treatment for a region that
carries a page or a whole section — a brand-wash icon tile (`size-16 rounded-lg bg-brand/10
text-brand dark:bg-brand/15`), a statement in foreground, one supporting line, then the action.
Kanban columns keep their drop zone and center the voice line inside it. The icon stays near its
drawn size at every scale — the `size="large"` tile is how an icon gets presence, never a
scaled-up glyph. Controls that only operate on content (tabs, filters, sort, bulk toolbars) hide
while the region is empty; the empty state and its one action are the whole surface.

## Surface pattern rules

- **Version history & conflict review:** a near-full-screen dialog with a two-pane side-by-side
  comparison of the same note at two points in time, each pane rendered faithfully through the
  editor's own schema in read-only mode. Changed blocks are painted by a ProseMirror node
  decoration — removed as a destructive wash with strikethrough, added as the brand teal wash,
  equal blocks unmarked; no accent bars. The note's title heads each side. The version rail is a
  borderless divided list (`row-interactive`), naming revisions by date and publication state
  (never a version number), with the change summary stated once. Panes are labelled "Previous"
  against "Current draft". Never editable.
- **Offline fallback:** a focused single-action status page — product mark, plain-language
  connection explanation, one retry action. Never imply that uncached server data or
  online-only mutations are available.
- **Todos:** Board and List are alternate URL-addressable views of the same set; the independent
  right panel is the complete master-detail editor. No second board-density toggle — a card shows
  its title plus whatever metadata is actually set. Editable popovers never resize cards or rows;
  provenance stays separate from the user-selected source. Controls use the flat shadcn Select,
  Popover, Calendar, Command, Input, and Textarea; selection commits immediately, text on
  blur/Enter (Escape restores), and saving/errors are announced without a Save button.
- **Data surfaces get their own measure:** boards and tables use `PageShell width="wide"` so the
  header keeps the reading measure while content widens; prose keeps default `prose` width.
- **Quiet at rest, control on hover:** metadata renders as text and reveals its control on hover,
  keyboard focus, or when open (`.field-quiet`). The affordance is deferred, never removed.
- **Project resources** use durable pages with a `Project > Resource` breadcrumb; the project
  name is always a link back to its overview — browser Back is never the only exit.
- **Project overview:** the five spaces group by what they do for you (produced versus what the
  agent works from), never as five equal nouns. An empty space states its purpose through a
  rotating tip instead of a zero, and every tip must describe behavior the code actually has;
  tips are chosen in the loader, never at render time.
- **Grouping is spacing and similarity, not more rules:** different kinds of thing get different
  density — spaces cluster at base size with no dividers while the documents list uses `sm` rows
  and hairlines; gaps step 8px → 24px → a further step. Equal gaps and repeated dividers flatten
  a page into peer sections however well its content is grouped.
- **Notes:** one continuous rich-text surface at `note-measure`, preceded by a quiet utility row
  (breadcrumb, save status, actions). The title lives only in the breadcrumb's current-page
  segment, edited in place through a pencil that reveals on hover (always visible while untitled);
  Enter commits and moves the caret into the body, Escape reverts, blur commits. The document's
  own first heading reads as its visual title.
- **Split notes:** note routes occupy the shell's fixed remaining height and never make the shell
  scroll; each pane owns independent vertical and horizontal scrolling; at narrow widths one pane
  shows at a time without discarding the canonical split URL or the saved divider ratio.
- Backlinks and AI suggestions are compact context: a forgiving title-and-URL hover preview, a
  compact bottom-right status card, opened from the editable document with Cmd/Ctrl+click. No
  trailing card section. Note actions stay contextual in the overflow or selection bubble menu;
  saving is automatic with a visible status (Cmd/Ctrl+S remains).
- **Proofreading marks the word, not the paragraph:** wavy underline on the flagged span — a
  misspelling in `--destructive`, a grammar or style note in `--muted-foreground`, because the
  first is an error and the second is advice; no wash on a single word inside prose. Clicking
  opens a small menu anchored to the word (never the caret) with the explanation, the offered
  fixes, and, for a misspelling only, one "Add to dictionary". Code blocks, maths, diagram
  sources, and inline code are never underlined, and exactly one checker underlines at a time
  (ours replaces the browser's). On by default; the note's overflow menu is the way out. The
  engine is fetched by the first note that opens, never on the way to Today or a board.
- **A selection action answers where it was asked:** while one runs, the bubble menu becomes a
  single status line in the same box and the selected text holds a brand wash until the result
  settles (revealing after `--duration-micro`); the header spinner is only the fallback for a
  selection scrolled out of view.
- Note synchronization stays in the quiet utility row: pending saves and conflicts are explicit;
  three-way comparison belongs in a focused dialog; resolution always preserves a complete rich
  document version.
- **Diagram editing is a canvas, not a preview:** the Mermaid preview half is a fixed box that
  scrolls in both axes with its own zoom — a floating −/percentage/+ cluster, ctrl/⌘+wheel and
  trackpad pinch, the percentage as a reset. The zoom is transient and never touches the block's
  width in the document. Centring on a scrollable canvas must be `safe`: `margin: auto` on a flex
  item puts overflow past the scroll origin where no scrollbar reaches it.
- Inline Mermaid diagrams may expose a compact draw.io conversion: while review is pending the
  block stays unchanged with a restrained review row; acceptance inserts a flat draw.io preview
  immediately after it, dismissal removes only the pending state. Accepted references render a
  reserved, non-shifting image preview with title, saved status, and one "Open in draw.io"
  action. The note-scoped draw.io editor is a focused editing mode — quiet back, explicit Save,
  accessible loading/saving/failure announcements, leave protection — reusing the document
  visual system, not a second workbench shell.
- **Chat:** the contextual right panel stays inline at `2xl` and opens as a Sheet below; durable
  links use full-page `/chats/new` and `/chats/[id]` routes. No more than five recent chats in
  the panel (one line each — title and time — showing three); full history on `/chats` with
  origin visible. A submitted turn renders immediate three-dot activity then human-readable
  tool/streaming state; stop, retry, failure, and cancellation are explicit and announced
  accessibly. User messages expose copy and edit-in-composer; assistant messages copy and retry
  when eligible — retrying never duplicates the visible user turn. Conversation origin is fixed
  on its first turn and distinct from context chips added later.
- **A turn reports the subjects it touched, not the calls it made.** Running, its steps arrive in
  order, because the point is watching it work. Settled, every call folds into the subject it was
  about — one entry per note, todo, project, skill or diagram, carrying the strongest verb that
  befell it. Six calls over one note are one row. The fold is the deduplication: keyed by call,
  a list can only state the same name once per call that mentioned it, and no amount of
  filtering afterwards fixes that.

  Seven rules follow from it, and they hold everywhere on this surface:

  1. **Navigation follows naming.** A row carries a way in only when it names one subject. A
     search is not a row, so no arrow ever stands for however many results came back and opens
     none of them in particular. The entry opens where that kind of subject opens — never by
     taking over the panel it was clicked in — and something the agent just created is openable
     too, its id arriving in the result rather than the arguments.
  2. **A subject is one line.** What the agent asked it, what came back, what it changed, and the
     passages it read are all behind its own disclosure. **A failure is stated on the subject it
     befell, and nowhere else** — its row reads `· not applied` in destructive and opens onto why,
     in the reader's terms, with the run's own words under that. A banner above the list stated
     the same failure a second time, once by name at the top and again on each of those names
     below it; the row is the better of the two places, because it is the one already carrying
     the identity and the way in. A run that failed outright is the turn's own error line, which
     sits under the whole turn with its Retry — never a second copy inside the block.
     **Everything behind the door is a row too**, including the looks that found nothing. Such a
     look has no subject to be titled by, so its row is titled by what it did — "Read project
     memory" — and the emptiness goes behind its chevron, on the same evidence wash a result
     would have used. An empty result is still a result, and it belongs where a result goes.
     Counting them instead ("3 looks came back with nothing") named a quantity where every
     neighbouring row names a thing; writing them flat put a request rung where a subject's name
     belongs and left one closing sentence speaking for every look at once.
  3. **Show the subjects; count only what you hide; word only what is absent.** `1 match` above
     one match and `1 edit` above one edit state the same fact twice. `…and 4 more` stays,
     because it counts what is not on screen; `nothing found` stays, because an absence has
     nothing to show. Results are otherwise stated in the reader's terms or not at all — an
     etag, a revision, or an internal tool name is faithful and useless.
  4. **Input and result are told apart by structure.** Inside a subject, each pass is a request
     line with what came back indented beneath it. Dot-joining the two into one string put the
     question and the answer at one size, separated by the same character that separated their
     own parts.
  5. **Three depths, one door.** The thread carries what changed. **One door per turn** carries
     what was only read, and it is labelled by what it holds — "Read 4 notes and your project
     memory" — rather than by how many calls it took to get there. A dialog, offered per subject,
     carries the passages at full width — the panel is 384px and file content is mono, so more
     than a few lines of it there is a column of fragments. That dialog is an escalation for
     raw passages only; the depths above it stay in place, and the reader never loses the
     conversation to read what was said about it.
  6. **One vertical ladder, declared once.** 4px binds a request to the evidence it introduces
     and to that evidence's own footer link; 12px separates one pass from the next; 20px
     separates one subject from another and from the read door. Each step is at least 1.6× the
     one below it, because a 4px difference at 12px type is below the size the eye reads as a
     grouping — which is exactly what an opened row was before: two gaps, 4 and 8, so the
     excerpt sat as far from its own request as the next request sat from it. 20px and not 24
     is deliberate: the turn stack spends 24px, and a gap inside a turn must stay under the gap
     between turns. The values live in `CHAT_GAP_*` in `chat-row.ts` and are never chosen at a
     call site, because two components each picking "about a `gap-2`" is how the flatness got
     there.
  7. **Teal is what the agent did, and nothing else here.** Every action the agent took takes
     the brand teal — "Read note", "Searched for", "Read lines 130–159", "Edited note", and a
     subject's verb on its statement line. Nothing else on the surface does: the search string is
     the reader's own words, the excerpt is the note's own content, the subject's name is the
     subject, and "Read all of it" is a control the reader operates, so it gave up the `link`
     variant's `text-primary` for muted. Weight then separates the actions from each other — a
     write is medium, a look is regular — so the column answers "what did it do" and "which of
     those changed my work" in one glance. Colour carries no size of its own: size says how deep
     a line sits, this says who acted. A refusal reads as a look, because nothing was written.
     The fold carries the fact (`SubjectPass.mutating`, `isWriteVerb`); no view reads a label
     back as English to recover it.

  Mechanism (tool searches, wrapper envelopes, workspace context, preference reads) never earns
  an entry; it is named once, last, behind the door. A failure a later call put right is a
  retry, not news — its record stays inside the subject, where a reader who opens it can see the
  agent correcting itself.

  The type hierarchy, one rung per level, declared in `chat-row.ts` and never chosen at a call
  site: a subject's statement line at `sm` (14px), level with the answer beside it rather than
  under it; a request at `text-label` (13px); what came back at `text-2xs` (11px). Nothing
  inside the block is ever larger than the answer. A search query renders italic and
  uncoloured, because it is the reader's words handed to a tool rather than our copy. Going
  deeper is smaller or equal, never larger — a request that titles an excerpt must never be set
  smaller than the excerpt.

  Evidence sits on the shared `bg-brand/10` (`dark:bg-brand/15`) wash wherever it appears —
  excerpt, field list, quoted prose — so quoted output is a surface rather than more page. Its
  ink follows the wash and not taste: the gutter takes `text-brand-muted-foreground`, the content
  takes full `text-foreground`, and neither grey nor an opacity is available here.

- **An approval is a flat block, never a card** — three same-weight rectangles nested inside a
  384px column. Marked by a pair of teal hairlines and 8px of air outside them: a pending
  approval is the live thing on screen. It leads with the action and its subject, then the
  change itself; a bundle draws one region around all of its changes, not one each. The inline
  change preview carries no frame and no pane label, and renders a step down in scale from the
  review dialog it links to. Never label content that sits directly beneath it ("Proposed
  change" over the only thing on screen; `Sent`/`Result` eyebrows over a call's own arguments).
- **A question stays where it was asked:** on send, the newest question is scrolled to the top of
  the port and its answer is written into space the thread reserves beneath it (collapsing as
  the answer fills). Auto-scroll otherwise only runs while the reader is at the latest turn;
  never scroll backwards to chase an end that sits above where they are.
- The empty thread teaches before it lists: route-aware starters name an action with a
  destination ("extract commitments into todos"), never a bare question; recent chats sit below
  them. Both groups are borderless divided rows, never filled or outlined buttons, and starters
  hold one line at panel width. The panel does not narrate its own context mechanics — the
  dismissible context chip is the explanation.
- **Agent context bar:** one plain-language sentence above the thread naming the scope, then a
  quiet row of text links with counts, including zero; every item explains itself on hover. Only
  the project name carries the brand accent; items are muted text with a hairline icon, never
  chips or washes. Artifacts are deliberately absent. Navigating re-derives the row with a short
  staggered re-entry. A capability renders at zero only here — the count is the teaching moment
  — never anywhere else.
- **What the next turn will do is stated in the composer, not hidden behind a gear:** execution
  mode and model live in the composer's own toolbar, inside the field. The model reads as a name
  plus, when the chat has chosen none, a muted `· default` — both halves are load-bearing.
  Prompt preferences and workspace defaults stay on `/settings`. Chat model and vision model
  are two tabs of one picker; the vision tab is disabled when the chat model reads images
  itself, and the explanation tooltip sits _outside_ the trigger (a disabled control emits no
  pointer events). The catalogue's long tail is reached by typing, not scrolling — matches grow
  uncapped once there is a query.
- **A popover's bands own their padding, and the popover owns none.** `Popover.Content` defaults
  to `flex flex-col gap-4`; leave that in place and every divider gains 16px of air the list
  never had. Set `gap-0`, give each band the same `p-1`, and let the divider carry the
  separation — one inset for everything: a row's text, a group heading, tab labels, and a
  footer link all land on the same line.
- **User-uploaded images render in fixed, center-cropped containers** — `object-cover` inside
  an `overflow-hidden` frame, separated from the surface by an inset hairline rather than an
  outward border that can clash with the photo. Lightbox and zoom views are the declared
  `object-contain` exception.
- **Screenshots are captured to fit their slot** — at a smaller viewport or cropped to a
  partial view — never shrunk into place until the UI inside them is illegible.
- **Heterogeneous menus use structure, not flat link lists.** A dropdown mixing destinations,
  actions, and destructive operations gets groups, supporting text, or icons, inside the
  popover band-padding contract above.
- **A primary choice between few options renders as selectable cards** — title, supporting
  description, the selected card marked by the brand accent — not a bare vertical radio stack.

## Anti-patterns

- Do not wrap the note in a card, add decorative shadows, or place a permanent formatting
  toolbar above it.
- Do not introduce a second copy of the note title above the body; the breadcrumb segment is the
  only one.
- Do not leave dead space beneath an empty note; the remaining document surface must accept
  focus.
- Do not introduce arbitrary colors, widths, typography values, or raw form controls.
- Do not hand-roll `cursor-pointer`, a hover lift, or a hover shadow on a control — the contract
  is global (see Interaction states).
- Do not add Mermaid theme variables in response to an unreadable diagram — they lose to the
  diagram's own `classDef`, `style`, and `linkStyle`. **Diagram export is the exception, and only
  at export time:** a diagram leaving the app lands in a document whose background we do not
  control, so the reader picks the palette (our light and dark token sets as presets) and
  whether to paint a background at all — nothing in the editor changes.
- Do not render a chip, badge, or control for a value that is not set — an empty field shows
  nothing on a card and an em dash in the property panel. The agent context bar's zero-count is
  the one sanctioned exception.
- Do not repeat the page title as the trailing breadcrumb crumb; the breadcrumb carries
  ancestors and the exit path, the `h1` names the current page.
- Do not render reference-specific background highlights, left-border callouts, or a separate
  bibliography below notes.
- Do not accept draw.io conversions from the general Suggestions inbox, render exported SVG as
  application HTML, enable iframe autosave, or add diagram revision/history chrome to the
  current editor slice.
- Do not show raw tool identifiers as primary chat status, silently wait for a first token,
  duplicate a prompt during retry, or hide chat entirely on mobile.
- Do not give a tool call a row, a name, or a disclosure of its own. The row is the subject it
  touched; the call is a pass inside it. Do not label a door by how many calls it opens onto, and
  do not print a count above the items it counts. Do not echo raw payloads or version-retention
  housekeeping copy.
- Do not wrap an approval, or the change preview inside it, in a card; do not repeat the change
  awaiting approval in the turn's touched list — it is already on screen in full.

## Agent context and transition UX

Agent context is ambient and has no raw JSON UI. The chat follows the user's actual interaction
focus in split panes without reordering panes or changing the URL-primary tab. Same-project
movement is silent. An ambiguous cross-project continuation uses one concise text clarification
naming both projects and offering either the existing New chat control or continuing in the
current chat — no structured resolution card or model-controlled navigation.

## Responsive application contract

- Standard Tailwind breakpoints only (`base`, `sm`, `md`, `lg`, `xl`, `2xl`); no bespoke
  viewport breakpoints. The note editor's container queries are the intentional exception
  (they respond to pane width).
- Base layouts prioritize one readable task at a time; dense master-detail and workbench layouts
  collapse to route-backed drill-down surfaces.
- Interactive controls on compact and touch layouts have a minimum 44 × 44px target;
  desktop-only dense controls may remain smaller from `md` upward.
- The application shell owns `100dvh` and prevents document-level overflow; boards, matrices,
  code editors, and independently scrolling panes may own intentional overflow.
- Compact bottom actions and composers include safe-area padding where they meet the viewport
  edge.
- Below `2xl`: contextual chat, suggestions, and project memory use a full-width Sheet on phones
  and a constrained Sheet from `sm`; Todo details use full-page routes.
- At `2xl`: the sidebar, content, and 24rem contextual panel may appear simultaneously, with
  independent scrolling; desktop content measures are preserved.
- Responsive geometry must be identical in light and dark modes; only semantic token values
  change.
