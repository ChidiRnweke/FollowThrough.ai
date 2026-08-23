---
title: "ADR 0033: Publish the maintainer's deployment as a reference that consumers may fork"
description: Keep today's product and deployment together without claiming one topology fits every operator.
---

# ADR 0033: Publish the maintainer's deployment as a reference that consumers may fork

## Status

Accepted.

## Context

The maintained production setup uses the services the maintainer already operates. It includes
Caddy, Komodo, Infisical, external Docker networks, PostgreSQL, object storage, and telemetry
services.

Separating every infrastructure choice behind a new abstraction would add work before another
operator has shown which boundaries need to vary. Presenting this setup as a universal standard
would also give self-hosters a false promise.

## Decision

We chose to publish the maintainer's production topology as a working reference deployment.

Consumers may fork or replace its deployment files. Core service boundaries use portable
interfaces where there is a current need, such as PostgreSQL, S3-compatible storage,
OpenTelemetry, and optional environment-based configuration.

We will reconsider further separation when real consumers show repeated needs that the current
topology cannot serve.

## Consequences

- The maintained deployment stays close to the product and remains usable by its owner.
- Self-hosters can see how all required services fit together.
- Consumers may need to fork network, proxy, secret, and deployment configuration.
- The project avoids speculative infrastructure abstractions.
- Adoption may later justify a more portable deployment package.

## Evidence

- `docker-compose.prod.yml` contains the maintainer's Caddy, Komodo, and external-network setup.
- Self-hosting docs call this topology a reference rather than the only supported arrangement.
- Configuration supports Infisical and plain environment modes.
- Storage and telemetry use portable service interfaces.
