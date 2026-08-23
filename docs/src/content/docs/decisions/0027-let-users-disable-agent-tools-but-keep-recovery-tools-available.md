---
title: "ADR 0027: Let users disable agent tools but keep recovery tools available"
description: Give users control without letting the agent remove every way to recover.
---

# ADR 0027: Let users disable agent tools but keep recovery tools available

## Status

Accepted.

## Context

Users need control over which application actions an agent can use. The agent can also help change
its settings when a user asks.

If every tool can be disabled through agent-accessible settings, the agent can remove the tools
needed to inspect settings or restore access. A retry must also respect a tool that the user
disabled after the original run.

## Decision

We chose user and project tool settings that can disable agent actions.

A small recovery set remains locked and cannot be disabled through the agent tool surface. The
agent can change other tool settings only through the same controllers as the settings UI.

A retried run keeps its original request but uses current tool authority. A disabled tool does not
return because an older run once had access.

## Consequences

- Users can limit agent capabilities by scope.
- Settings changed by UI or agent follow the same validation.
- The agent cannot disable every path back to a usable state.
- A retry can behave differently when authority changed after submission.
- The locked set must remain small and justified.

## Evidence

- Tool-preference controllers resolve user and project settings.
- `LOCKED_TOOL_NAMES` defines the recovery set.
- Agent tool tests check that promoted tools respect current enablement.
- Retry tests preserve request intent while using live authority.
