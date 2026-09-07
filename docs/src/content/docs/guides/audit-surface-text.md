---
title: Audit text on colored surfaces
description: Find gray or translucent text on colored backgrounds from source, then verify contrast.
---

The source inventory runs without a browser, server, or database:

```sh
pnpm audit:surface-text
pnpm audit:surface-text --json
```

It walks all application Svelte, TypeScript, and CSS files. Svelte ancestry connects a
background on a container with text on its descendants. Class arrays, same-file aliases and `$derived(cn(...))` bindings, class recipes, focus/theme variants,
placeholders, imported icons, opacity, and typography utilities such as `provenance-caption`
are included. Each candidate names its file, line, text/background classes, state, and uncertainty.

For a quick first pass with ripgrep:

```sh
rg -n 'bg-(brand|primary|destructive|success|warning)' src
rg -n 'text-muted-foreground|text-(gray|slate|zinc|neutral|stone)-|text-[a-z-]+/[0-9]|opacity-' src
```

These searches locate the two sides of the problem; the inventory relates them. Neither command
requires painting a page. A candidate is not necessarily a violation: the gray text and colored
background may belong to mutually exclusive states, or a nested control may paint a neutral surface.
The report stays informational rather than weakening the zero-violation architecture checks.

## Correcting a finding

Use opaque, surface-related secondary ink: `text-brand-muted-foreground` on teal washes and
`text-destructive-muted-foreground` for secondary copy on error washes. Keep neutral secondary
ink on neutral surfaces, primary prose in `text-foreground`, and solid buttons on their paired
foreground token. Correct the surface owner or the relevant state; do not globally recolor muted
text or alter user-authored document colors.

The audit corrects the workspace strip, memory-review captions, MCP token notices, chat
editing and unreadable-content hints, note/diagram revision metadata, editor error explanations,
dragging dropzone hints, focused input/textarea placeholders and composer labels, lifted todo metadata, selected sidebar actions, calendar selection, and user-message blockquotes and prose metadata.

## Reviewing conditional candidates

The remaining source findings are deliberately visible:

| Component               | Review result                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File dropzone           | `dragging` chooses the brand wash and brand ink together. Neutral text belongs to the other arm. `disabled` opacity represents a disabled control, not secondary text. |
| Chat thread             | The user turn receives both brand wash and brand secondary ink. The assistant turn retains neutral secondary ink on its neutral surface.                               |
| Diagram version history | The selected revision receives both the wash and brand ink. Other revisions remain neutral.                                                                            |
| Todo cards              | Lifted cards use brand ink; resting cards use neutral ink. Completion opacity is a transient animation.                                                                |
| Calendar                | Disabled and unavailable dates retain their explicit state styling; enabled selected dates retain paired primary ink on hover.                                         |
| Editor AI menu          | The copied destructive variant selectors have no corresponding `data-variant` attribute on this button. The Enter hint renders on a neutral selected row.              |

Cross-element boolean correlations are not solved by the inventory. Component-internal CSS,
portals, cross-file or runtime class values, arbitrary colors, and selector inheritance still need manual
review. A clean report never claims exhaustive visual coverage.

## Measuring the corrected colors

```sh
pnpm test:surface-text
```

This optional browser regression suite renders the real workspace header and field primitives
with production CSS in a component-only fixture server on port 5174. It checks both themes,
header interaction states, focused placeholders, lifted todo cards, user-message quotes, selected calendar dates, and representative wash/token pairs. It does
not require Postgres or modify the production authentication configuration.

The reusable `inspectSurfaceText` helper in `tests/helpers/surface-text.ts` can also run through
`locator.evaluate()` in authenticated E2E tests. It measures foreground/background pairs with
ancestor transparency and group opacity, reports disabled text separately, and sends images,
gradients, painted pseudo-elements, filters, and unresolved canvas backgrounds to visual review.
It does not infer hue compatibility or claim pixel-accurate handling of overlapping siblings.
Reports and screenshots are attached to the Playwright results; normal text targets 4.5:1 and
large text/essential control icons 3:1. Review status is not a pass.

The expanded fixture run measured 882 light-theme and 904 dark-theme samples across 13 states per theme. Its lowest
normal-text ratios were 4.61:1 (light) and 6.93:1 (dark); its lowest control-icon ratios were
4.41:1 and 4.78:1. These measurements describe the fixture coverage, not every application route.

`pnpm test:surface-text:app` scans Today, Todos, Notes, Chats, and Settings in both themes
using the normal `tests/auth.setup.ts` session and a running
Postgres instance. It records review cases separately and fails measured contrast violations. Component coverage
is not a substitute for that route coverage.
