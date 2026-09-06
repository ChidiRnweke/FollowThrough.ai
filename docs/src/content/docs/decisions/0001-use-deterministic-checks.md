---
title: 'ADR 0001: Use deterministic checks'
description: Why shared project rules use automated checks.
---

## Status

Accepted.

## Context

Humans and multiple agents work in this repository. They do not share the same memory or judgment.
Written instructions can also be missed.

The project needs consistent architecture, tests, and user interface rules. The same code must get
the same result from a check. The result must not depend on who made the change.

## Decision

Use deterministic checks for important project rules.

Run these checks in `pnpm test:architecture`:

- Chisel checks the base architecture and design-system rules.
- The topology audit checks rules that are specific to this repository.
- The test audit checks the test rules.

Keep the human-readable rules in `AGENTS.md`, `ARCHITECTURE.md`, and `DESIGN_SYSTEM.md`.

## Consequences

- Humans and agents get the same result from the same change.
- A failed check names a rule that the change broke.
- New project rules may need a new automated check.
- The checks need maintenance when a rule changes.
- Some design decisions still need human judgment.

## Evidence

- `package.json` defines `pnpm test:architecture`.
- `chisel.config.json` configures Chisel.
- `scripts/audit-topology.ts` contains the project topology checks.
- `scripts/audit-tests.ts` contains the project test checks.
