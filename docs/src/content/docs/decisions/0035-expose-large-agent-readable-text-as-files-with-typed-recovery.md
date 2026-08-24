---
title: 'ADR 0035: Expose large agent-readable text as files with Unix reads and typed recovery'
description: Let agents navigate large text with familiar commands while making failures explicit and recoverable.
---

# ADR 0035: Expose large agent-readable text as files with Unix reads and typed recovery

## Status

Accepted.

## Context

Large note bodies, attachments, diagram XML, tool results, and conversation history consume tokens
when the agent receives or replays them whole.

Separate read tools also give the same operation different pagination, error, and missing-value
contracts. Some current tools clamp invalid input, return empty content for missing data, or encode
resolved states with optional fields.

Agents already know how to list files, search text, and read line ranges. A small Unix-shaped read
surface can use that prior knowledge without granting shell access.

ADR 0015 requires visible failures. ADR 0034 requires distinct types for distinct resolved states.
ADR 0022 requires a small directly available tool set.

## Decision

We chose one virtual file namespace for large agent-readable text.

Each file has a stable path, an opaque identifier, a media type, a checksum, and exact byte, token,
and line counts. File listings always include size information.

Agents read this namespace through structured `ls`, `grep`, and read-only `sed` tools. Their names
and behavior follow Unix conventions. Their inputs remain typed tool parameters rather than shell
command strings.

Each result is a distinct state. Complete, partial, no-match, missing-path, invalid-pattern,
empty-file, and invalid-range results carry the fields that state requires.

A failure includes facts that explain the failure and exact tool calls that can make progress.
Advice is based on resolved state. The application does not execute the advice or silently change
the failed request.

We use optional inputs only for real Unix defaults. We do not use optional output fields to combine
states that require different data.

Semantic search and domain inspection remain separate tools. Mutation tools remain domain-specific.
Dedicated tools whose only purpose is to list, search, or page through large text are removed.

We will keep this design while agents benefit from Unix-shaped retrieval and large text competes
with task context. We will reconsider it if providers offer a cheaper native content-addressing
contract with equal recovery and ownership guarantees.

## Consequences

- Large text does not remain in repeated model history.
- Agents use a small and familiar retrieval vocabulary.
- Every partial result states what remains and how to continue.
- Invalid states cannot look like empty successful results.
- Some existing agent and MCP tool names are removed.
- A virtual path and authorization layer must cover several storage backends.
- Regex support needs a bounded non-backtracking engine.
- Domain tools may need one more `sed` call when they return a file instead of inline text.

## Evidence

- `src/lib/server/services/agent-files/virtual-files.ts` implements the namespace and typed command
  outcomes.
- `src/lib/server/services/agent/conversations/replay-virtualizer.ts` sinks large history and tool
  payloads while preserving the diagram-specific canvas recovery path.
- `src/lib/server/factories/agent/mcp-tool-factory.ts` promotes searched definitions as real MCP
  tools without a free-form wrapper.
- `src/lib/models/diagrams/index.ts` models an empty canvas separately from a present diagram.
- ADRs 0015, 0022, and 0034 establish the related failure, tool-loading, and type-shape rules.
