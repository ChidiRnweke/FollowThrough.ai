---
title: 'ADR 0044: Own the icon set'
description: Draw every icon in-house, with the state motion built into the set, and remove the icon library.
---

## Status

Accepted.

## Context

The application used two icon sources. A set of 63 custom `Ft*` icons covered the app chrome, and
`@lucide/svelte` covered the rest: the editor toolbar, the diagram node menu, sync status and
several sidebar entries. The custom icons were close copies of Lucide, so the product had no
visual voice of its own, and the two sources drifted in stroke weight and naming. Some names
described a shape rather than a meaning, so the same sliders glyph stood for both settings and
preferences.

Animation on state change was also missing. Adding it per component would repeat the same code
in every row, tab and toggle, and would drift in the same way the icons did.

## Decision

The application draws all of its icons. `src/lib/components/icons` is the only icon source, and it
is imported as a namespace: `import * as Icon from '$lib/components/icons'`. Each glyph is named
for what it means.

The set follows one style, Through-line, taken from the product mark. Marks for places and things
are one stroke that ends in a dot. Utility glyphs (verbs, arrows and editor formatting) have no dot.
The dot is the only part that takes the brand colour, and only when an ancestor is live.

Motion is part of the set, not of the components that use it. Each glyph marks its strokes
`ft-stroke` and its dot `ft-accent`. One block in `src/routes/layout.css` animates them when a live
attribute that the primitives already set appears on an ancestor. No component contains icon
animation code.

`@lucide/svelte` is removed. The `no-icon-library` rule in `scripts/audit-source-rules.ts` fails
any import from an icon library at zero baseline. `components.json` keeps `iconLibrary: "lucide"`
because the shadcn-svelte CLI requires a value; a component added with the CLI has its icon imports
replaced before it lands.

## Consequences

- A new icon is a new glyph file in the set. There is no library to pick an icon from, so each new
  icon costs a drawing.
- Primitives added with the shadcn-svelte CLI need their icon imports changed. The audit makes a
  missed change fail the build.
- State animation is consistent everywhere a primitive sets `aria-current`, `aria-pressed`,
  `data-state` or `data-active`. A component that marks a live state some other way gets no
  animation until it uses one of those attributes.
- Reduced motion is handled in one place, next to the animations.
