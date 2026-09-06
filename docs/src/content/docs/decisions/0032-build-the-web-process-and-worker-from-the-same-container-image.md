---
title: 'ADR 0032: Build the web process and worker from the same container image'
description: Keep both processes on the same release while allowing separate execution.
---

## Status

Accepted.

## Context

The web process accepts work and the worker completes background work. They share domain types,
database tables, migrations, and processing rules.

Separate images can drift when only one is deployed. One combined process would prevent separate
scaling and restart behavior.

## Decision

We chose one versioned container image with separate web and worker entry points.

A deployment runs the same image as two processes. Each process starts only the code for its role.
Both receive the same application configuration and release version.

We will keep this packaging while web and worker are parts of one product release.

## Consequences

- Web and worker cannot use different code from the same release deployment.
- One build produces both process artifacts.
- The processes can scale and restart separately.
- The image contains code that each individual process does not use.
- A breaking worker change must remain compatible with the database rollout order.

## Evidence

- `Dockerfile` builds the web application and worker artifact.
- `docker-compose.prod.yml` runs app and worker from the same image.
- Both processes load the same application configuration.
