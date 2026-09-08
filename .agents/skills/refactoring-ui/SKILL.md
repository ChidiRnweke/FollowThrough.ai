---
name: refactoring-ui
description: Judgement checks for building, reviewing, and polishing UI in this repo — visual hierarchy, spacing, typography, color, depth, imagery, empty states, finishing touches. Triggered when creating or reviewing screens, components, or design-system changes. The deterministic half of these checks lives in `pnpm test:ui`; this skill is the half that needs eyes.
---

# Refactoring UI — judgement checks

Distilled from *Refactoring UI* (Wathan & Schoger) and localized to this codebase.
DESIGN_SYSTEM.md is the law; this skill is how you apply it. It is the judgement half of the
design system — `pnpm test:ui` (part of `pnpm test:architecture`) is the deterministic half.

When the audit covers a check, quote the rule id instead of re-deriving the mechanics:
`no-raw-font-family`, `font-weight-bounds`, `no-em-font-size`, `uppercase-needs-tracking`,
`no-wide-tracking-on-display`, `no-hex-rgb-color`, `no-runtime-color-derivation`,
`no-pure-black`, `token-contrast-aa`, `heading-needs-utility`, `justify-needs-hyphens`,
`text-shadow-glow-only`, `no-accent-bars`, `no-ad-hoc-shadow`, `alpha-fixed-steps`.
Suppress with `audit-allow: <rule-id> — <reason>` (`//` or `<!-- -->`) on the line above; the
reason is the point.

## Starting new work

- **Build the feature before the shell.** New work starts with the feature's fields, actions,
  and data — not with `src/routes/(app)/+layout.svelte`, `AppSidebar`, or `RightPanel`. A diff
  that rearranges shell chrome before a feature component exists is ordered wrong.
- **Grayscale first, earn the teal.** Establish hierarchy with spacing, contrast, and size
  alone; introduce `--brand` last, on the single live element. The end state is DS "Accent
  discipline" — this is the process that gets there.
- **Ship the smallest useful version.** Cut the nice-to-have sub-feature into a follow-up;
  never block the whole feature on its hardest part.
- **No unbuilt chrome.** No disabled controls awaiting a future feature, no "coming soon"
  areas, no placeholder tabs. A legitimately disabled state (the vision-model tab) carries its
  explanation — that is the distinguishing test.

## Hierarchy

- **Weight and color before size.** De-emphasize secondary text with `text-muted-foreground`
  or a weight step first; never push primary content above its rung on the type ladder to
  stand out, never drop secondary text below `sm` to sit back.
- **Three text-contrast tiers per surface, no more:** `foreground`, `muted-foreground`, one
  lighter tier — plus `--brand` only where Accent discipline sanctions it. A component mixing
  more is a wall-of-content smell.
- **Emphasize by de-emphasizing the competition.** When the live element reads weakly, soften
  its resting siblings (muted text, no fill) instead of inflating it. The workspace tab strip
  is the model: resting tabs paint nothing, the active tab is never bolded.
- **Labels are a last resort.** Omit the label when the value's format (date, email, count) or
  position already identifies it; fold a necessary qualifier into natural phrasing
  ("3 bedrooms"). A genuinely needed label renders one tier below its value — the value leads.
  On dense spec-style pages where the user scans for the label itself, invert: darken the
  label, lighten the value.
- **One primary action per view.** At most one solid default `Button` per page or dialog;
  secondary actions take `outline`, tertiary take `ghost`/`link`. Multiple solid primaries are
  a hierarchy violation regardless of semantics.
- **Destructive styling follows importance, not severity.** The full `destructive` variant
  belongs only inside the confirmation step (AlertDialog), where the destructive act is the
  primary action. A delete on a row, card, or toolbar is `ghost`/`outline`.
- **Icons beside text sit back.** An inline icon takes a softer color than its text (muted
  token or inherited `currentColor`) unless it is itself the affordance; the agent context
  bar's hairline icons are the model.
- **A faint separation becomes a hairline, never a darker line.** `ring-inset ring-1` is the
  whole separation vocabulary — see Deviations.

## Layout & Spacing

- **Density is a per-surface decision, never inherited.** Airy is the default;
  `PageShell`/`project-overview.svelte` are the reference. Boards, matrices, and workbenches
  choose density explicitly. A screen dense "because it ended up that way" fails review — the
  fix direction is more room, not rearrangement.
- **Ambiguous spacing is a violation.** Within-group gaps are strictly smaller than
  between-group gaps (DS "Spacing is the hierarchy": 4px binds, 8px separates items, 24px
  separates groups). Equal gaps at nested levels flatten the grouping; the fix is a spacing
  step, never a divider.
- **Chrome takes a fixed width; content flexes.** The sidebar, the 24rem right panel, and
  drawers are sized for their contents — never viewport fractions (`w-1/3`) or grid-column
  shares.
- **Centered single-purpose surfaces use `max-w-*` or a measure token** (`note-measure`), so
  they shrink only below their optimum — never fluid column spans
  (`col-span-6 col-start-4`) that render wider on medium screens than on large ones.
- **Custom spacing tokens step at least ~25% apart.** A new `--space-*`/measure value in
  `layout.css` must keep the non-linear ladder — no linear 4px multiples, no one-off values
  squeezed between existing steps. The Tailwind scale already complies; this guards additions.
- **Control size variants are tuned independently.** Button `sm`/`default`/`lg` padding is not
  proportional — smaller sizes get disproportionately tighter padding. Never derive variant
  padding from font-size (`em`).
- **One corner personality per surface family.** Peers (cards, buttons, inputs, badges) share
  one step of the shadcn radii family; `rounded-none` next to `rounded-lg` is a statement or a
  bug — decide which.

## Typography

- **Text roles come from the named ladder.** `page-title` (one per page), `section-title`,
  `eyebrow`, `provenance-caption`, plus `text-sm` body — any other raw `text-*` size is a new
  rung and is banned. The audit owns the mechanical guards: `heading-needs-utility` (bare
  headings), `no-raw-font-family` (faces), `font-weight-bounds` (400/600 chrome, 700/800 note
  ladder), `no-em-font-size`.
- **Mixed sizes on one line align by baseline.** A flex row pairing text at two sizes takes
  `items-baseline`, never `items-center` (centering offsets the baselines). Icons and controls
  still center.
- **Line-height runs inverse to font size.** Display sizes take tight leading, small text
  taller; the note ladder models it (H1 ≈1.19, body ≈1.55). Loose leading on `text-xl`+ is a
  violation. Widening a measure re-derives the leading in the same review.
- **Long-form text is never centered.** `text-center` is for headlines and self-contained
  blocks of two or three lines — the `empty-state.svelte` hero is the canonical case. If a
  centered block runs long, shorten the copy.
- **Numeric table columns right-align,** header and cells, so magnitudes compare down the
  column.
- **Links in chrome emphasize by weight and foreground,** not color; the tinted-underline
  treatment is reserved for prose (`.tiptap`). Breadcrumb and project `--brand` links are the
  sanctioned exception. No naked `<a>` inheriting body text anywhere.
- **Authored-content headings carry more space above than below,** so a heading reads as
  belonging to the section it introduces — check `editor.css` and the note ladder when touching
  prose spacing.
- **Uppercase pairs with tracking, display sizes never widen it, justified text hyphenates** —
  `uppercase-needs-tracking`, `no-wide-tracking-on-display`, `justify-needs-hyphens` own these.

## Color

- **Shade ladders are picked up front, by eye, as tokens** in `layout.css`. Nothing is derived
  at render time: `no-hex-rgb-color`, `no-runtime-color-derivation`, `no-pure-black`, and
  `alpha-fixed-steps` own the mechanics; the documented alpha steps (`bg-brand/10`–`/30`,
  `dark:/15`) are the only sanctioned derivation.
- **Author a scale with breadth before you need it:** ~8–10 neutral steps, 5–10 brand steps,
  a light wash plus a dark text shade per semantic accent. Within a ladder, chroma rises at
  the lightness extremes so the ends don't wash out, hue rotates ≤30° toward the nearest
  bright/dark anchor, and the greys keep the single olive temperature at every step. Trust
  eyes over numbers; `token-contrast-aa` verifies the shipped pairs.
- **Color never carries meaning alone.** Every place color signals state — badges, diff
  markings, deltas — pairs it with an icon, a sign (`+`/`-`), or a label. The proofreading
  marks are the model: hue plus underline style.
- **On a tinted surface, text is `foreground` or the surface's own hue** — never neutral
  `muted-foreground` grey, never white-at-reduced-opacity. The project-identity recipe
  (`text-brand` on `bg-brand/10`) is the model.
- **Supporting colored elements flip contrast:** dark-hue text on a light wash of the same
  hue. White-on-saturated is the primary action's privilege, nowhere else.
- **Secondary text inside a dark colored panel rotates hue brighter** (toward
  cyan/magenta/yellow) until it reaches AA — never lighten it toward the primary near-white.
- **Gradients are a tripwire, not a tool.** Flat surfaces are the norm; if one ever appears,
  its hues stay within 30°.

## Depth

- **Flat by policy.** Depth comes from lightness steps between surfaces, hairline inset rings,
  spacing, and the 1px hover lift. `no-ad-hoc-shadow` bans shadows outside the shadcn overlay
  defaults — see Deviations for the book conflicts this settles.
- **A dragged element needs a z-cue.** The hover/press contract is motion, but motion can't
  raise a card above its peers mid-drag — solve it without shadows (scale, opacity, a ring),
  and never leave the dragging state identical to rest.
- **Overlap creates layers.** A card crossing a background seam (`-mt-*`) is the sanctioned
  flat-depth move — sparingly, and never as another nested-rectangle failure (DS "Surface
  rule — list before card" still governs).
- **Overlapping images never touch.** Stacked avatars/images carry a ring in the surface token
  behind them (`ring-background`), so the gap is guaranteed.

## Imagery

- **Icons stay near their drawn size.** Glyphs drawn at 16–24px never render at 3–4×; large
  presence comes from the enclosing tile. The `empty-state.svelte` `size="large"` brand-wash
  tile (`size-16 rounded-lg bg-brand/10`) is the recipe.
- **Screenshots are captured to fit, never shrunk into place.** Recapture at a smaller
  viewport or crop to a partial view; if in-shot text renders illegibly small, the answer is
  recapture. Applies to `shot.svelte`/`screenshot-slot.svelte` and `static/product-screenshots/`.
- **User-uploaded images render in fixed, center-cropped containers** — `object-cover` inside
  an `overflow-hidden` frame, separated by an inset hairline, never an outward border that can
  clash with the photo. Lightbox/zoom views (`image-lightbox.svelte`, `image-zoom.svelte`) are
  the declared `object-contain` exception.
- **No placeholder photography.** No placehold.co/picsum-style hosts, no "swap in real photos
  later" — a surface that needs photography gets real photos before it ships.
- **Text over an image needs a sanctioned treatment:** a semi-transparent overlay, lowered
  image contrast, single-color colorization, or a glow text shadow (`text-shadow-glow-only`
  owns the shadow shape). Overlay tone opposes the text — dark overlay under light text, never
  same-polarity. Relevant today: `src/lib/components/marketing/`.
- **Brand-colorized photos are an explicit exception.** The multiply-tint recipe fights Accent
  discipline (teal marks the live thing) — flag it for sign-off, never apply it silently.
- **Favicon-size artwork is redrawn, not resampled.** Small `static/icons/` entries get
  deliberately simplified variants of `brand-mark.svelte`, not the full-size mark shrunk.

## Finishing touches

- **Every user-content region has a designed empty state, and its chrome hides while empty.**
  `empty-state.svelte` renders in the `{:else}` branch; tabs, filters, sort controls, and bulk
  toolbars live in the non-empty branch, never as siblings that render unconditionally.
- **Heterogeneous menus use structure, not flat link lists.** A dropdown mixing destinations,
  actions, and destructive operations gets `*Group`/`*Separator`/`*Label` structure,
  supporting text, or icons — inside the popover band-padding contract ("A popover's bands own
  their padding").
- **Tables earn their cells.** Merge adjacent non-sortable columns of related data into one
  cell with internal hierarchy (primary line + muted secondary line); use badges or avatars
  where they carry real information. Cell accents stay within Accent discipline — data values
  stay gray.
- **A primary choice between few options renders as selectable cards** — title, supporting
  description, the selected card marked by the brand accent — not a bare vertical `RadioGroup`
  stack. Trivial binary choices are exempt.
- **Marketing-style bullet lists replace disc markers with icons** (`flex items-start gap-2`
  + icon + text); data lists are exempt.

## Deliberate deviations from the book

The design system has already decided these against the book; state them, don't relitigate
them.

- **Flat elevation replaces the shadow system.** Hairline inset rings (`ring-inset ring-1`)
  plus the 1px motion lift are the entire depth vocabulary. The book's light-source edges,
  elevation ladder, two-part shadows, and shadow-as-border guidance do not apply; overlay
  shadows are shadcn defaults, accepted as-is.
- **`--sidebar` sits a step below the other surfaces** ("Paper, not screen white"); the book
  suggests giving the sidebar no background.
- **`--note-content-width: 90ch` exceeds the book's 45–75ch measure ceiling.** A reviewed
  exception — if it ever moves, re-derive the leading with it.
- **The note scale's H1 runs weight 800,** past the book's two-weight guidance. Chrome stays
  400/600; `font-weight-bounds` holds that line.
- **Separations are fixed at 1px hairlines.** Where the book allows a heavier border to fix a
  faint separation, here the answer is the hairline or spacing — never `border-2`.
- **Accent bars are banned outright** (`no-accent-bars`); the book recommends them.

## Pre-ship checklist

- [ ] The screen reads correctly in grayscale; teal sits only on the live thing.
- [ ] Weight and color carry emphasis before size; at most three text tiers per surface.
- [ ] One primary action per view; full destructive styling only inside its confirmation.
- [ ] Gaps step — within-group strictly smaller than between-group; no divider fixed what
      spacing should.
- [ ] Every text role is a named rung; mixed sizes on a line align by baseline.
- [ ] Color never carries state alone (icon, sign, or label alongside).
- [ ] Every user-content region has its empty state, and content-operating chrome hides while
      it is empty.
- [ ] Icons near drawn size (tile for presence); images captured/cropped to fit, never shrunk.
- [ ] `pnpm test:ui` is green; every `audit-allow` names a real reason.
