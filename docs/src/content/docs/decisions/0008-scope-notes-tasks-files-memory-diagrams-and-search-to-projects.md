---
title: "ADR 0008: Scope notes, tasks, files, memory, diagrams, and search to projects"
description: Use a project as the common boundary for durable work and context.
---

# ADR 0008: Scope notes, tasks, files, memory, diagrams, and search to projects

## Status

Accepted.

## Context

FollowThrough stores several forms of work. A note can produce tasks, files, diagrams, memories,
search results, and documents. These records need a common answer to two questions: which work do
they belong to, and which context can use them?

Separate scope rules for each feature would let related data disagree or leak into unrelated work.

## Decision

We chose the project as the common scope for durable project work.

Notes, tasks, files, project memory, diagrams, generated documents, settings overrides, and search
entries record their project. Project-scoped reads and agent actions use that boundary.

Profile facts remain outside a project because they apply to the user across projects.

We will keep this boundary while a project represents one durable stream of work.

## Consequences

- Related data shares one ownership and context boundary.
- Search and agent actions can stay inside one project.
- Project settings can apply to all work in that project.
- Moving data between projects is a context change and needs an explicit operation.
- User-wide data needs a separate scope.

## Evidence

- `src/lib/server/db/schema/registry.ts` gives project-owned records a `projectId`.
- Project ownership checks appear across feature repositories and services.
- Agent tools accept or inherit a project scope.
- Search chunks record the project of their source.
