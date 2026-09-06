---
title: 'ADR 0022: Give the agent a small common tool set and find other tools on demand'
description: Keep tool schemas out of the prompt until the agent needs them.
---

## Status

Accepted.

## Context

The agent can use many application actions. Sending every tool name, description, and input schema
with every request consumes context before the user asks for any of them.

Hiding all tools behind one free-form wrapper is also unsafe. Some model families receive an empty
schema for that wrapper and cannot form a valid call.

## Decision

We chose a small set of directly available tools for common grounding and recovery. The agent uses
tool search to find other actions when it needs them.

A found action becomes directly callable with its real name and input schema. The agent does not
send it through a free-form wrapper.

We will keep this design while the tool catalog is large enough to compete with user context.

## Consequences

- Long-tail tool schemas use no prompt space until discovered.
- Frequently needed grounding tools remain immediately available.
- A found tool keeps its real validation contract.
- A tool is unreachable when tool search cannot find it for a clear request.
- Tool-search quality needs tests separate from full agent evaluations.

## Evidence

- `FIRST_CLASS_TOOL_NAMES` defines the small direct tool set.
- `search_tools` retrieves other tool definitions and promotes their real schemas.
- Tool-search tests check discovery and direct calls.
