---
title: "ADR 0003: Require approval before agent-proposed changes become saved data"
description: Let a user or an explicit trust policy decide which agent-proposed changes are saved.
---

# ADR 0003: Require approval before agent-proposed changes become saved data

## Status

Accepted.

## Context

An agent can find commitments, links, references, diagrams, and facts in a user's work. Its output
can still be wrong. It can also misunderstand what the user meant.

A saved change outlives the agent run that produced it. It can affect later searches, agent runs,
todo lists, and documents. The agent must not decide by itself that its proposal becomes saved
data.

Users also need a way to inspect where a proposed change came from. They need to accept it, reject
it, or undo it later.

## Decision

We chose to store agent-proposed changes as proposals before applying them.

A user decides whether to apply a proposal. An explicit trust policy can make that decision
automatically for a proposal type that the user has chosen to trust.

Each proposal keeps a record of its source. Its status shows whether it is pending, accepted,
rejected, or reverted.

We apply a proposal and mark it accepted in one transaction. We also undo a proposal and mark it
reverted in one transaction. This prevents the approval history from disagreeing with the saved
data.

## Consequences

- The agent cannot silently make these changes durable.
- Users can inspect and reject agent output before it changes their data.
- Users can trace an accepted change back to its source.
- A user can allow automatic approval for proposal types they trust.
- Useful changes may remain pending until they are reviewed.
- Each proposal type needs apply and undo behavior.
- Proposal status and saved data must change together.

## Evidence

- `src/lib/server/controllers/suggestions/controller.ts` accepts, rejects, and reverts proposals.
- `src/lib/server/controllers/suggestions/lifecycle.spec.ts` checks that proposal status and applied
  data cannot partly change.
- `src/lib/server/controllers/references/controller.ts` creates reviewable reference proposals.
- `src/lib/server/controllers/relationships/controller.ts` creates reviewable link proposals.
- `src/lib/server/controllers/todos/controller.ts` creates reviewable todo proposals.
- `src/lib/server/controllers/memory/controller.ts` creates reviewable memory proposals and applies
  the configured trust policy.
