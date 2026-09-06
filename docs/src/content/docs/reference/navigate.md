---
title: How to navigate the references
description: The layering behind the reference documentation — models, repositories, services, controllers, and capability factories.
---

The reference section documents five layers of the codebase. Each layer is a sidebar group whose
header links to its overview page (this page's sibling); the group expands into the generated
API pages for every module in that layer.

## The five layers

| Layer                                         | Holds                                                                   | Entry point                |
| --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| [Models](/reference/models/)                  | Pure types and logic shared by client and server. No I/O, no framework. | `/reference/models/`       |
| [Repositories](/reference/repositories/)      | Server-only data access against the database.                           | `/reference/repositories/` |
| [Services](/reference/services/)              | Server-only business logic on top of repositories.                      | `/reference/services/`     |
| [Controllers](/reference/controllers/)        | Orchestration across services; the only cross-service seam.             | `/reference/controllers/`  |
| [Capability factories](/reference/factories/) | Wiring that exposes collaborators to controllers and the agent.         | `/reference/factories/`    |

## How the layers relate

Requests arrive through a `remote` function, are validated there, and flow into a **controller**,
which is the only place allowed to coordinate across **services**. A service speaks to the
database only through a **repository**. **Models** hold the pure types every layer shares —
request shapes, entity types, parser schemas.

The direction of imports is enforced in CI (the topology audit), so the generated pages follow
the same dependency order the code does:

```
remote → controllers → services → repositories
                            ↘       ↗
                          models (shared)
```

## Also in reference

- **Architecture decisions** — every ADR, newest first. The decisions are the rationale behind
  the shapes above (for example [ADR 0001](/decisions/0001-use-deterministic-checks/) requires
  the deterministic checks this documentation relies on).
- **How each feature works** — subsystem walkthroughs that connect the layers to the user-facing
  surfaces.
