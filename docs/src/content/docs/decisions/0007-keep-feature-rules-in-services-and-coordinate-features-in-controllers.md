---
title: "ADR 0007: Keep feature rules in services and coordinate features in controllers"
description: Prevent hidden service coupling while keeping feature rules reusable.
---

# ADR 0007: Keep feature rules in services and coordinate features in controllers

## Status

Accepted.

## Context

A rule that belongs to one feature should be reusable without starting a larger workflow. A
service that calls another feature's service hides ownership and can create a dependency chain that
is hard to see or test.

Some user actions still need several features. Saving a note can repair anchors, update links, and
refresh search. Accepting a proposal can create another kind of record.

## Decision

We chose to keep rules for one feature in that feature's services. Services do not import services
from another feature.

Controllers coordinate actions that cross feature boundaries. They also own the transaction when
the results must commit together.

We will keep this boundary while controllers remain the shared application entry point.

## Consequences

- Feature services can be used and tested on their own.
- Cross-feature work is visible in one controller method.
- Transaction boundaries are easier to find.
- Controllers need explicit dependencies for every feature they coordinate.
- A controller can become too large and may need a smaller workflow collaborator.

## Evidence

- `src/lib/server/services/` contains feature rules.
- `src/lib/server/controllers/` coordinates application workflows.
- `scripts/audit-topology.ts` rejects service-to-service dependencies.
- Note and suggestion controller tests check cross-feature transactions.
