---
title: 'ADR 0030: Use Phoenix to inspect agent runs that logs cannot explain'
description: View model, tool, retrieval, token, and evaluation work as one structured run.
---

## Status

Accepted.

## Context

Log lines do not show the shape of an agent run. They do not make call order, repeated calls,
retrieval inputs, token use, or parent-child model spans easy to inspect.

An AI trace viewer is needed for production diagnosis and evaluation review. MLflow was considered,
but its deployment needed about 2 GB of memory. That cost was too high for this deployment.

## Decision

We chose Phoenix for agent and evaluation traces. It provides the needed AI views with a lighter
deployment than the considered MLflow setup.

The application does not call Phoenix directly. It emits OpenTelemetry so Phoenix can be replaced
without rewriting agent instrumentation.

We will keep Phoenix while it provides the required run inspection at an acceptable operating cost.

## Consequences

- Operators can inspect model, tool, retrieval, token, and evaluation spans together.
- Agent failures can be diagnosed from run shape instead of log order.
- Phoenix adds a service and stored trace data.
- The collector must preserve the fields Phoenix needs.
- OpenTelemetry remains the portable boundary if another viewer becomes better.

## Evidence

- The collector routes OpenInference spans to Phoenix.
- Agent and evaluation telemetry sets the Phoenix project name.
- Trace audit and validation scripts query Phoenix run structure.
- The README shows Phoenix as the agent observability view.
