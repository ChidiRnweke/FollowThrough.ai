---
title: "ADR 0024: Trace each agent run from the user action to the saved result"
description: Join agent behavior and application outcomes in one trace.
---

# ADR 0024: Trace each agent run from the user action to the saved result

## Status

Accepted.

## Context

Agent traces show model calls, tool calls, and retrieval. Application telemetry shows controller
work and the result a user receives. Either view alone leaves a gap when a run fails.

Agent work starts after its submission transaction commits. Without saved trace context, that work
would start a new trace unrelated to the click that requested it.

## Decision

We chose one trace for the user action, durable run, model work, tool calls, controller work, and
saved result.

Submission freezes the trace context on the run before execution starts. Background execution
resumes that context.

Controller instrumentation is centralized so every delivery surface produces the same operation
span and trace-linked logs.

## Consequences

- A diagnosis can compare what the agent tried with what the application stored.
- Async execution remains connected to the user action.
- Controller coverage does not depend on call-site logging.
- Trace context becomes part of durable run submission.
- Instrumentation must avoid duplicate spans and raw payload logging.

## Evidence

- Agent submission and run records preserve trace context.
- `src/lib/server/controllers/instrumentation.ts` wraps controller methods.
- Agent telemetry tests check trace hierarchy across run work.
- `scripts/otel-instrumentation.js` connects spans and logs through OpenTelemetry.
