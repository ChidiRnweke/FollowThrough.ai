---
title: "ADR 0026: Always include small profile facts and search project memory when needed"
description: Separate facts that always apply from the larger history of one project.
---

# ADR 0026: Always include small profile facts and search project memory when needed

## Status

Accepted.

## Context

Some saved facts describe the user and can matter in every conversation. Project facts describe
one body of work and can grow into a long changing history.

Loading all project facts into every run would spend context on unrelated material. Requiring a
search for every small profile fact would make stable user context easy to miss.

## Decision

We chose two memory scopes with different context rules.

Small profile facts are included in every agent run. Project memory is not included by default. The
agent reads it when the active work can depend on that project's decisions, terms, or constraints.

Users can keep a memory entry private from agents in either scope.

## Consequences

- Stable user facts are available without a tool call.
- Large project histories do not fill every prompt.
- The agent must recognize when project memory can matter.
- Profile memory must stay small enough to remain standing context.
- Private entries must stay outside both direct context and search.

## Evidence

- Agent context includes shared profile memory.
- Project memory enters the retrieval index and is read through a scoped tool.
- The memory indexer excludes profile and private entries.
- Agent instructions describe the separate scope rules.
