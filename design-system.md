# design-system.agent.md — compressed reference

> Machine-oriented digest of DESIGN_SYSTEM.md. Usage rules only. Values live in src/routes/layout.css. Conflict → flag, don't guess. Uncovered decision → append to DESIGN_SYSTEM.md.

## identity

- theme: stone(hue~~107) neutrals + teal(hue~~186) primary. one accent.
- light surfaces = paper, not white: bg/card/popover on stone hue, --sidebar held a step below. dark unchanged. muted-fg darkened only to clear AA vs paper
- surface rule: homogeneous scannable rows = borderless divided list (hairline + row-interactive wash). card ONLY for heterogeneous content or self-owned actions. never card-wrapping-bordered-rows
- principles: color=information | chrome-defers-to-document | data=gray
- teal=interactive/primary + identity accents (active nav, selected segment, provenance chips, product mark). red=destructive-only. all else gray.
- brand token: --brand (=primary light, lifted teal dark) for identity accents/washes. mark=brand-mark.svelte, always in sidebar header.
- project identity=brand teal, NEVER per-project hues. sidebar project icon, Badge variant="brand", breadcrumb links, chat origin line, artifact format badges, project-overview resource icon chips. canonical wash recipe=badge brand variant (text-brand + bg-brand/10, dark:bg-brand/15) — no separate wash tokens.
- voice: calm/dry/second-person, one sentence w/ period, no exclamations, celebrates absence of work. empty states=empty-state.svelte (icon+voice line+≤1 action), never blank space. two sizes: default slot (bare muted icon, inline gaps/panels) vs size="large" hero (brand-wash icon tile size-16 bg-brand/10 text-brand, foreground statement, pages/whole sections).

## tokens.color (semantic only — never raw oklch/hex/tailwind palette)

- bg/fg: document surface + body text
- card/popover: light=flat+border, dark=lighter step. elevation: light=border, dark=lightness. shadows≈none
- primary: 1 primary action per view max. links, active states, focus affordances
- secondary: stone-derived (zinc RETIRED). light oklch(0.955 0.006 106.5)/fg oklch(0.228 0.013 107.4); dark oklch(0.286 0.016 107.4)/fg oklch(0.988 0.003 106.5)
- muted(-fg): metadata, timestamps, placeholders, provenance captions, inactive
- accent: hover/selected wash only (=muted)
- destructive: delete/irreversible only. never validation/emphasis
- border/input/ring: hairlines. dark=white-alpha 10–15% — never hardcode gray borders
- success: light oklch(0.55 0.09 155), dark oklch(0.68 0.11 155). completed/confirmed
- warning: light oklch(0.62 0.1 75), dark oklch(0.74 0.12 75), fg dark-stone both modes. due-soon/degraded/contradicts
- chart-1..5: mono stone ramp. color only for semantic series (overdue→destructive etc.)
- sidebar-*: nav rail only. sidebar-primary=brighter teal=active nav item

## tokens.type

- font-sans: Inter Variable — body, chrome, metadata, controls. hierarchy via size/weight/color
- font-serif: Newsreader Variable — DISPLAY ONLY, reached solely via `page-title`/`note-title` utilities. never hand-applied, never chrome/metadata. base h1..h6 stays Inter
- font-mono: JetBrains Mono. code, mermaid/drawio source, inline code, IDs, URLs. ligatures: off editable, ok read-only
- REJECTED (do not relitigate): mono metadata — reads as developer tool, breaks mono=code
- NAMED SCALE (layout.css utilities — no raw heading size classes in app code):
  - `page-title` 3xl/500/serif/tight — one per page (page-shell h1 + custom-header pages)
  - `section-title` base/600/tight — real content sections (settings groups, skill editor sections)
  - `eyebrow` xs/500/uppercase/wide/muted-fg — labels a GROUP of items below it (list-group labels, table heads, kanban column headers)
  - `provenance-caption` xs/muted-fg — annotates ONE item (timestamps, provenance)
  - body sm (base) · `note-title` clamp/600/serif (note editor only)
- form labels: shadcn `Label` (and `Field.FieldLabel`) = xs/500/muted-fg — label recedes, value leads. `Field.Title` stays sm/500 fg over `Field.Description` xs/muted (settings rows). override per-site if a dialog label needs prominence
- ladder: eyebrow/caption (xs) → body (sm) → section-title (base) → page-title (3xl) → note-title (clamp)
- project-overview resource rows sit at base/500 — one step above the sm documents list, because a space outranks a document
- exceptions: right-panel + drawio chrome-bar titles, sidebar brand = chrome, not content scale
- chrome legibility floor: primary nav never below sm — workspace tab strip (h-10, sm labels), sidebar wordmark (base/semibold), empty-strip placeholder. xs=eyebrow/provenance only
- prose(editor): 16px, lh~1.7, @tailwindcss/typography mapped to tokens (links→primary, quotes→border, code-bg→muted)
- headings: w600 (Inter); display titles w500/w600 serif; tracking −0.01/−0.02em ≥20px

## tokens.shape+density

- radius base 0.625rem: md=buttons/inputs/chips, lg=cards/popovers/suggestion-cards, xl+=modals, full=avatars/dots
- density: compact. controls 32–36px chrome. roomy only in editor/reading
- layout: 3 zones sidebar|document|right-panel(chat/review/todo, collapsible). boundaries=border hairlines, no shadows/blocks

## components

- base: shadcn-svelte, extend don't fork. edra shadcn flavor shares tokens — verify after edra customization
- icons: lucide-svelte. size-4 chrome, size-3.5 chips/captions. currentColor only
- buttons: default(teal)=single primary/view. else secondary/ghost/outline. destructive=click destroys
- interaction contract: every clickable surface = cursor:pointer + 1px hover/focus lift @ --duration-micro/--ease-standard, returns to 0 on :active. motion NOT elevation — no hover shadows. exceptions (cursor only, no lift): menu/select/command rows, a control holding a nested control, sidebar tree rows
- stated in exactly 3 places: buttonVariants.base (ui/button/button.svelte), @utility row-interactive, @utility tactile (bare <button>/<label>). cursor comes from the @layer base tag+role rule in layout.css — NEVER hand-roll cursor-pointer. a cursor-* utility still wins (cursor-grab handles, cursor-col-resize, cursor-text)
- focus ring visible on everything interactive. keyboard-first
- dark mode: class .dark, first-class. test every component both themes

## ai-provenance (signature — no per-feature variants)

- NO dedicated AI hue (no violet). shape carries meaning
- applies: suggestion cards, inserted todos, backlink chips, reference cards, agent chat proposals
- accepted block: teal gutter dot beside block, hover=provenance, first user edit clears. inline nodes self-identify, no dot
- rejected: no trace
- nothing AI-made indistinguishable from user writing until user edits it

## editor.nodes

- todo: inline checkbox+title, reads as prose line. done=strikethrough muted-fg. overdue=warning date. hover=due/owner. click=right-panel detail
- backlink chip: secondary/muted pill. relationship on hover. contradicts→warning tint (only relationship with color)
- reference card: icon+title+tier-badge(docs/standard/vendor/blog)+relevance-note muted-fg. docs/standards outrank blogs visually
- diagram frame: card+hairline, header=kind(mermaid/drawio)+actions(edit/promote/regenerate). mermaid error=muted error state inside frame + failing source, never blank
- mermaid edit mode = canvas: fixed box, both-axis scroll, floating −/%/+ on the canvas (not toolbar), ctrl/⌘+wheel + pinch continuous, % resets. zoom transient, NEVER writes node.attrs.width. centring on a scrollable canvas MUST be `safe` — plain center/margin:auto puts overflow past the scroll origin
- mermaid theme = our tokens only (background/foreground/muted/muted-fg/border/surface + brand on sequence activations). theme vars LOSE to a diagram's own classDef/style/linkStyle, so do not add more of them to fix an unreadable diagram
- editor cursor: .tiptap=text, non-text node views/images/media/diagrams=default, nested [contenteditable=true]=text again. a light-mode I-beam over a pale diagram fill is invisible

## chat panel

- sidebar surface tone. alignment+muted author label, NO colored bubbles
- tool activity=collapsed muted rows, expandable
- agent proposals=standard suggestion card inline, no chat variant

## motion (expressive, budgeted)

- svelte springs=physical (panels/cards/reorder), css=micro
- budget priority: 1) suggestion lifecycle: card springs in; Accept→card travels to destination (todo settles, chip pops w/ overshoot); Dismiss→quick exit. 2) panel slide choreography, animated-height tool rows. 3) hover lift = 1px @ --duration-micro (125ms), no shadow
- springs settle <400ms, no wobble. prose NEVER animates. 1 orchestrated moment/interaction
- prefers-reduced-motion→fast fades. day one. the hover lift is opted OUT entirely (unlayered block in layout.css), not just un-transitioned — the base guard only collapses durations, which turns a lift into a jump

## copy

- plain verbs, sentence case. name what user controls, not system internals
- action name stable through flow (Accept→Accepted)
- errors: what+fix, specific, no apology. empty states: invitation to act

## definition-of-done (per component)

[ ] light+dark ok (white-alpha borders)
[ ] keyboard focus visible
[ ] reduced-motion respected
[ ] zero hardcoded color/font/radius
[ ] motion within budget
[ ] copy rules followed
[ ] AI-touching → provenance treatment + standard card

## hard rules

- missing token → add token first (src/routes/layout.css + DESIGN_SYSTEM.md) → then build
- check shadcn/edra component exists before creating new
- src/routes/layout.css=values, DESIGN_SYSTEM.md=usage, this file=digest. digest conflicts with source → source wins, update digest
