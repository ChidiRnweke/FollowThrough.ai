---
title: 'ADR 0003: Require approval before agent-proposed changes become saved data'
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

## How a tool is classified

A tool that writes asks at the approval prompt. A tool that writes nothing does
not. The classification is the whole rule, and it is checked by a map that must be
total over every controller method, so a new capability cannot quietly skip it.

- `create_note`, `edit_note`, `create_diagram` and `edit_diagram` all write, so all
  four ask.
- Reads never ask, because there is nothing to undo.

Diagrams used to be the exception. Creating one stored nothing and was shown on a
canvas, where a Save button was the only approval — so the consent for a diagram
lived somewhere the approval boundary could not see, and a diagram was the one
agent output that could vanish when a chat closed. Creating a diagram now writes a
row and asks first, exactly as creating a note does.

Approving a write does not publish it. Notes and diagrams are both created
unpublished, and publishing stays a separate decision the user makes (ADR 0011).
That is what lets an agent's work be saved and reviewable without being visible to
anyone else yet.

## Consequences

- The agent cannot silently make these changes durable.
- Users can inspect and reject agent output before it changes their data.
- Users can trace an accepted change back to its source.
- A user can allow automatic approval for proposal types they trust.
- Useful changes may remain pending until they are reviewed.
- Each proposal type needs apply and undo behavior.
- Proposal status and saved data must change together.
- A diagram an agent creates is recoverable rather than permanent: it can be moved
  to the trash and restored, which is what makes writing on approval reasonable.

## Evidence

- `src/lib/server/controllers/suggestions/controller.ts` accepts, rejects, and reverts proposals.
- `src/lib/server/controllers/suggestions/lifecycle.spec.ts` checks that proposal status and applied
  data cannot partly change.
- `src/lib/server/controllers/references/controller.ts` creates reviewable reference proposals.
- `src/lib/server/controllers/relationships/controller.ts` creates reviewable link proposals.
- `src/lib/server/controllers/todos/controller.ts` creates reviewable todo proposals.
- `src/lib/server/controllers/memory/controller.ts` creates reviewable memory proposals and applies
  the configured trust policy.
- `src/lib/server/factories/agent/agent-tool-factory.ts` holds the classification map and the
  approval boundary that reads it.
- `src/lib/components/chat/actions/tool-approval-preview.ts` builds what the prompt shows, so a
  diagram is approved by its labels rather than by its XML.
