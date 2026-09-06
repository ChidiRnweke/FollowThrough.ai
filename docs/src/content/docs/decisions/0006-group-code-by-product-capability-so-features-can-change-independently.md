---
title: 'ADR 0006: Group code by product capability so features can change independently'
description: Keep feature ownership visible and reduce overlap between parallel changes.
---

## Status

Accepted.

## Context

Humans and agents often work in the repository at the same time. A layout based only on technical
layers spreads one feature across broad shared folders. That makes ownership harder to see and
increases overlap between unrelated changes.

Each product capability also needs its own services, repositories, controller, and construction.

## Decision

We chose to group code first by product capability. Notes, todos, memory, search, diagrams, and
other features keep their own domain code within each technical role.

Each server capability has a factory that creates its collaborators. The application root combines
capabilities but does not construct their internal services.

We will keep this shape while capabilities remain the main units of product ownership and change.

## Consequences

- A feature's code and owner are easier to find.
- Parallel work on different capabilities has less file overlap.
- Capability factories hide internal construction from the application root.
- Shared behavior needs an explicit home instead of an informal common folder.
- The structure adds factory and entry-point files.

## Evidence

- `src/lib/server/factories/capabilities/` constructs server capabilities.
- `src/lib/server/application.ts` combines capability outputs.
- `scripts/audit-topology.ts` checks factory placement and capability entry points.
- Commit `bfd0b3d` introduced capability factories.
