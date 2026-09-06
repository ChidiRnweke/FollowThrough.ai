---
title: 'ADR 0029: Send telemetry through OpenTelemetry instead of coding for each backend'
description: Let deployment route one portable telemetry stream to its chosen services.
---

## Status

Accepted.

## Context

The application produces traces and logs for normal requests, background work, and agent runs.
Different tools are useful for different views of that data.

Sending directly to each tool would put vendor clients, routing rules, and credentials in the
application. Changing an observability service would then require an application change.

## Decision

We chose OpenTelemetry as the application's telemetry format and transport.

The application sends one stream to an OpenTelemetry collector. Deployment config decides which
records go to Phoenix, Tempo, Loki, or another compatible backend. Backend credentials stay at the
collector boundary where possible.

Telemetry remains optional for deployments that do not configure an endpoint.

## Consequences

- Application instrumentation is not tied to one storage or viewing tool.
- Deployment can filter and route records without changing product code.
- Web and worker processes use the same telemetry contract.
- The collector is another component to configure and monitor.
- A routing error can lose telemetry even when the application emitted it correctly.

## Evidence

- `scripts/otel-instrumentation.js` starts OpenTelemetry for the application processes.
- `otel-collector-config.yaml` filters and routes telemetry.
- Production configuration sends one OTLP stream to the collector.
- Phoenix smoke scripts test the full delivery path.
