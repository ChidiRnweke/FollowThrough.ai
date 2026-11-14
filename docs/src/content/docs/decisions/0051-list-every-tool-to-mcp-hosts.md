---
title: 'ADR 0051: List every tool to MCP hosts'
description: The MCP endpoint lists every permitted tool in tools/list, and search_tools only helps a host find one. ADR 0022's on-demand promotion applies to the in-app agent only.
---

## Status

Accepted. Narrows the scope of [ADR 0022](../0022-give-the-agent-a-small-common-tool-set-and-find-other-tools-on-demand/)
to the in-app agent.

## Context

ADR 0022 gives the agent a small set of direct tools. The agent finds other tools with
`search_tools`, and a found tool becomes callable under its real name and schema. Over MCP, the
server listed the 14 first-class tools and `search_tools`. A `search_tools` call added its matches
to the server's tool list and sent `tools/list_changed`.

This did not work on MCP hosts, for two reasons:

- The `/mcp` endpoint is stateless. Each request builds a new server, so the tools that one
  request added are gone in the next request. The endpoint answers with plain JSON and keeps no
  event stream open, so `tools/list_changed` never reaches the host.
- Hosts read `tools/list` once. Claude.ai builds its tool list when a conversation starts and does
  not refresh it.

As a result, an agent in Claude.ai found `archive_note` with `search_tools`, and the result said
`callable_directly: true`. The call then failed with "tool not found". The host could not archive,
restore, rename or delete a note.

Claude.ai and Claude Code already hide MCP tool schemas behind their own tool search, and load a
schema only when the model asks for it. For these hosts, a short server-side list saves no context.

## Decision

The MCP endpoint lists every tool that the token's scope and the user's tool selection permit.
`search_tools` stays available as a ranked finder over the same tools, and every match is already
listed. The server keeps no promotion state and does not advertise `tools/list_changed`.

The in-app agent keeps the ADR 0022 design. Its harness is stateful within a run and controls
which schemas reach the model.

We do not add a free-form `call_tool` wrapper. ADR 0022 rejects a wrapper because some model
families receive an empty schema for it, and a wrapper validates arguments only on the server.

## Consequences

- A host can call any permitted tool by its real name. This works from the first request of a
  session and in every later request.
- Measured with the cl100k encoding, `tools/list` for a full-scope token holds 79 tools in about
  24,200 tokens. Before this change it held 15 tools in about 5,800 tokens. A read-scope token
  lists 37 tools in about 12,700 tokens, against about 4,600 before. A host that loads every
  schema into the prompt pays this cost. A host that defers schemas pays it only for the tools
  that the model loads.
- A tool that the user disables in Settings is not listed, cannot be called, and is not returned
  by `search_tools`.
- If the catalog grows enough that deferring hosts also suffer, revisit this decision. Do not
  bring back promotion over a stateless endpoint.

## Evidence

- `createMcpServer` in `src/lib/server/factories/agent/tools/mcp.ts` lists and resolves calls
  against the full permitted set.
- `mcp-tool-factory.spec.ts` archives a note on a fresh connection that never called
  `search_tools`, and checks that a disabled long-tail tool is neither listed, found nor callable.
