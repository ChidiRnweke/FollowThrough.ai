---
title: "ADR 0004: Let the agent decide when to search the user's work"
description: Give the agent a search tool instead of searching before every prompt.
---

# ADR 0004: Let the agent decide when to search the user's work

## Status

Accepted.

## Context

The agent can search notes, uploaded documents, diagrams, and project facts.

One common approach searches this data before every prompt. The search results are then added to
the agent's input.

That approach spends context space before the agent knows whether search will help. It can add text
that the user did not ask for. It also treats the first search query as final. The agent cannot see
that the query was poor and try a better one.

## Decision

We chose to give the agent a search tool instead of searching before every prompt.

The agent decides whether search can help. It chooses the query and scope. It can search again with
a more focused query when the first results reveal a gap.

We will keep this approach while the agent can choose and evaluate its own tool calls. A feature
that needs fixed search behavior can use its own search flow outside the agent.

This decision does not remove context that the user selected. A note that the user attaches can
still be included with the request. Small profile facts can also remain in every run because they
are standing user context.

This decision covers search over the user's saved work. It does not cover discovery of agent tools.

## Consequences

- Search results use context space only when the agent asks for them.
- The agent can correct a poor query during the same run.
- The agent can search only one note or project when the request has a clear scope.
- The agent can fail to search when search would improve the result.
- Agent evaluations need to check whether the agent searched when needed.
- Search quality includes the tool description, query, results, and the agent's next decision.

## Evidence

- `src/lib/server/services/agent/runs/context.ts` does not load project knowledge into every run.
- `src/lib/models/agent/tool-catalog.ts` defines `search` and `search_note` as agent tools.
- `src/lib/server/factories/agent/agent-tool-factory.ts` connects those tools to knowledge search.
- `src/lib/server/services/agent/runs/reasoning.ts` points the agent to `search_note` when an attached
  note is too large to include.
- `src/lib/server/controllers/knowledge-search/controller.ts` still has a legacy path that replaces
  an agent query with a condensed conversation query. This path conflicts with the decision and is
  tracked in `docs/architecture/suspicious-findings.md`.
