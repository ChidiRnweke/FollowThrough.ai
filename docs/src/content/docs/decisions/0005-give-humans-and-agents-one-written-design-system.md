---
title: 'ADR 0005: Give humans and agents one written design system'
description: Use shared UI rules so the product does not change with its author.
---

## Status

Accepted.

## Context

Humans and several agents change the same user interface. They do not share memory or visual
judgment. A component library alone does not explain how to combine components, use space, show
state, or keep the interface accessible.

Without written rules, each change can look reasonable by itself while the product slowly loses a
common shape.

## Decision

We chose one written design system for all UI work. It records visual rules, interaction rules,
accessibility limits, tokens, and the failures that caused important exceptions.

Humans and agents use the same document and the same app-owned components. Stable rules can also
be checked by deterministic audits.

We will keep product rules in the design system while individual screens remain free to solve
their own content and task needs.

## Consequences

- UI decisions do not depend on who starts the change.
- A rule can explain why a locally attractive change is wrong for the product.
- Shared components and tokens carry stable decisions into new screens.
- The design system needs maintenance when the product learns a better rule.
- Some visual decisions still require human judgment.

## Evidence

- `docs/design/design-system.md` records product-wide visual and interaction rules.
- `src/routes/layout.css` owns the shared tokens and app-level component rules.
- `src/lib/components/ui/` contains the app-owned UI primitives.
- `scripts/audit-topology.ts` checks design-system boundaries.
