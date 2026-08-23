---
title: "ADR 0023: Evaluate agent actions and saved results, not only final answers"
description: Test what the agent chose and what changed in the real application.
---

# ADR 0023: Evaluate agent actions and saved results, not only final answers

## Status

Accepted.

## Context

A fluent final answer can hide a failed action. A tool call can use the wrong arguments, be rejected
by a controller, or change data in the wrong project. Checking prose alone can mark all of these
runs as successful.

Normal tests can prove deterministic application behavior. They cannot prove that an agent chooses
the right action for an open-ended request.

## Decision

We chose to evaluate the agent's tool choice, arguments, stopping behavior, and saved result. Final
prose is supporting evidence, not the main score.

Agent evaluations run against the real controller graph and database migrations. Deterministic
model-adjacent services can replay recorded results so the agent remains the main variable.

Normal tests continue to cover deterministic rules and failure cases.

## Consequences

- An evaluation can detect a plausible answer that changed nothing.
- It can detect a correct tool call that changed the wrong data.
- Results measure application outcomes, not SDK events alone.
- Evaluations take more setup than text comparison.
- Model uncertainty remains and needs repeated categorical judgments.

## Evidence

- `src/evals/` runs agent cases against application capabilities.
- Repository test infrastructure uses real PostgreSQL migrations.
- Evaluation cases inspect tool behavior and stored effects.
- Phoenix receives evaluation traces for later diagnosis.
