---
title: 'ADR 0025: Save agent runs before starting them so retries and cancellation are safe'
description: Make long agent work survive refreshes, lost responses, and process interruption.
---

## Status

Accepted.

## Context

An agent run can outlive an HTTP request. The user can refresh, cancel, retry after a lost response,
or restart the application while work is active.

Starting work before its record commits can leave an executor with no durable state to finish or
cancel. Repeated submissions can also run the same request twice.

## Decision

We chose to save the run and its initial event before starting execution.

Each submission has a request key. A repeated submission with the same key returns the existing
run. Events are appended with cursors so a client can resume after refresh.

Cancellation commits the cancelling state before it asks the executor to stop. Startup recovery
settles interrupted work from durable records.

The same run mechanism supports long note actions as well as chat.

## Consequences

- A lost response does not duplicate a run.
- Refreshing does not lose progress or the final result.
- Cancellation has durable state even if execution does not stop at once.
- Run state and events need idempotent transitions.
- The system needs recovery rules for interrupted processes.

## Evidence

- Agent run submission stores request keys and returns duplicate receipts.
- Run lifecycle services append durable events and settle cancellation.
- Workflow runs reuse the same lifecycle for note actions.
- Commit `6c9fe76` introduced cancellable, resumable note actions.
