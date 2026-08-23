---
title: "ADR 0034: Model each agent execution path with distinct input types"
description: Keep submission, resolved runs, in-app tools, MCP tools, and catalog generation separate while sharing product operations.
---

# ADR 0034: Model each agent execution path with distinct input types

## Status

Accepted.

## Context

Agent work passes through several execution points. A submission may not yet have a conversation.
A resolved run always has one. In-app tools need run data and current tool authority. MCP tools need
MCP request data. Catalog generation needs only static metadata.

A shared input or execution context combines states that cannot occur on every path. It makes
resolved values optional. It also invites fabricated identifiers, sentinel values, runtime guards,
and silent fallbacks.

The web UI, agent, and MCP still use the same product operations under ADR 0002. This decision does
not split those operations or their controllers.

## Decision

We chose distinct types for agent submission, staged input, resolved runs, in-app tool construction,
MCP tool construction, and catalog generation.

Each type represents only states possible at that execution point. A resolved value is required.
Zod validates each transition from external or persisted data into a resolved type.

The web UI, agent, and MCP continue to share controllers and product operations. Their protocol
contexts and construction inputs remain separate.

We share a small pure helper only when two paths perform the same work with the same inputs. We keep
local construction separate when the paths need different data.

We will keep this design while these paths have different inputs and authority. We will reconsider a
shared type only if the paths gain the same possible states and the same required data.

## Consequences

- Invalid cross-path states are not representable.
- Resolved code does not need nullable fields or runtime path guards.
- Tests cannot use sentinel identifiers or incomplete executable contexts.
- Some schemas and construction code are duplicated near their protocol boundary.
- Fixtures must construct more complete states.
- Local duplication is accepted when sharing it would add variants or optional fields.

## Evidence

- `src/lib/models/agent/index.ts` defines staged and resolved run input schemas.
- `src/lib/server/factories/agent/agent-tool-factory.ts` constructs in-app tools from resolved run
  context.
- `src/lib/server/factories/agent/mcp-tool-factory.ts` constructs the MCP protocol surface from MCP
  request context.
- `src/lib/server/factories/agent/agent-tool-catalog-factory.ts` generates static catalog metadata
  without an executable context.
- `src/lib/server/repositories/agent/postgres/agent-settings.ts` is being changed to validate the
  persisted resolved run input instead of returning an untyped snapshot.
- The source audit still reports shape casts while this refactor is in progress. Those casts are
  implementation violations, not exceptions to this decision.
