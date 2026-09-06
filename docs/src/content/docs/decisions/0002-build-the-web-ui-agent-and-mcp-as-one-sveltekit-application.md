---
title: 'ADR 0002: Build the web UI, agent, and MCP as one SvelteKit application'
description: Use one TypeScript application instead of separate web and agent backends.
---

## Status

Accepted.

## Context

The web UI, the agent, and MCP act on the same product data. They need the same product rules and
operations.

A common design is to build a web application and a separate Python service for the agent. That
design creates a network boundary. It also creates a second application contract and often a
second copy of the domain types.

FollowThrough has one delivery channel today. It may have a desktop app or another channel later.

## Decision

We chose one SvelteKit and TypeScript application because the web UI, agent, and MCP use the same
product rules and operations.

The web UI, agent tools, and MCP call the same controllers. The controllers contain no Svelte
logic. This keeps the product rules available outside the web framework.

We will keep this shape while FollowThrough has one delivery channel. A separate agent backend or
shared package would add a boundary without serving another channel.

If FollowThrough adds a desktop app or another delivery channel, we will reconsider this boundary.
We expect to move the controllers and shared types into a package in the monorepo. Each channel can
then use that package.

## Consequences

- Product rules have one implementation.
- The web UI, agent, and MCP use the same types and operations.
- The project has one application to build and deploy.
- A new delivery channel will require package extraction work.
- The project delays that work until a real channel defines its needs.

## Evidence

- `src/lib/server/controllers/` defines the product operations.
- `src/lib/remote/` connects the web UI to controllers.
- `src/lib/server/factories/agent/agent-tool-factory.ts` connects agent tools to controllers.
- `src/lib/server/factories/agent/mcp-tool-factory.ts` connects MCP tools to controllers.
