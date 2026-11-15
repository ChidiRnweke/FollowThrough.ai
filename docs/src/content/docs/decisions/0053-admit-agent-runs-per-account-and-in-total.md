---
title: 'ADR 0053: Admit agent runs per account and in total'
description: Count the chat runs that execute now under one database lock, and refuse a new run when its account or the deployment is at its limit.
---

## Status

Accepted. This decision amends the consequence of ADR 0052 that set no limit on concurrent runs.

## Context

The only guard on concurrent agent runs was the partial unique index
`agent_runs_active_conversation_unique`: one active run for each conversation. An account could
start any number of runs in different conversations. Each scheduled run creates its own
conversation, so many schedules at the same minute start many runs in one worker (ADR 0052).
Every run calls the model provider and holds worker memory until it ends.

No measurement of provider quota, worker memory or database load per run exists. A limit is
still needed, so that one account, or a burst of schedules, cannot take the whole deployment.
The limits below are starting values for an operator to tune, not measured ones.

## Decision

- A chat run is admitted only while fewer than `AGENT_MAX_ACTIVE_RUNS_PER_USER` of its account's
  chat runs execute, and fewer than `AGENT_MAX_ACTIVE_RUNS` of the deployment's. The defaults
  are 5 and 50.
- A run executes while it is `queued`, `running` or `cancelling`. A run parked for approval is
  not counted: it executes nothing until its owner decides. Its resume after a decision is not
  admitted again.
- Admission is decided inside the transaction that saves the run. The transaction takes one
  advisory transaction lock for the deployment, then counts. The lock is held until the
  transaction commits, so the next admission counts the run this one saved. One lock serves both
  limits, because the total spans every account. The partial index
  `agent_runs_executing_user_idx` holds exactly the rows the count reads.
- Building the run reads the model catalog, which can call the provider, so admission happens
  after the run is built and just before it is saved. The lock is not held across that call.
- A chat message, a retry and a schedule's "Run now" over a limit are refused with a
  `ConflictError` that says how many of the user's runs are in progress, such as "You have 5 agent runs in
  progress. Wait for one to finish." At the deployment limit the message names no count, since
  the total is not the user's to know. Nothing is saved for the refused request.
- A due run of a schedule over a limit is saved as a failed run whose failure says why. Its
  occurrence is recorded, the schedule moves on in the same transaction, and the next
  occurrence is admitted on its own. The run never executes, and its owner can retry it from
  its chat.

## Consequences

- One account cannot hold more than five executing runs, and the deployment not more than fifty,
  unless an operator changes the settings. Neither number is measured. An operator who sees
  provider rate limits or worker memory pressure should lower them, and one who sees refusals
  with resources to spare should raise them.
- Every admission on the deployment waits on one lock. The lock is held from the count until
  the transaction commits: the insert of the run, its first message and its first event, and
  for a scheduled run also its occurrence. The wait is short, but it has not been measured
  under load.
- A run can be saved as `failed` without having run. Before this decision a run failed only from
  `running`.
- A schedule's run that is refused fails visibly instead of waiting. A busy account sees failed
  scheduled runs that it must retry by hand.
- Runs that resume after approval, and note-action workflow runs, are not admitted. Several
  approvals in a row can take an account past its limit.
- A retry now locks its conversation before admission, in the same order as a submission. A
  retry and a submission in one conversation therefore wait for each other instead of
  deadlocking.

## Evidence

- `src/lib/server/db/schema/registry.ts`: `agent_runs_active_conversation_unique` was the only
  index that bounded active runs, and it is per conversation.
- `src/lib/server/controllers/agent/controller.ts`: `runDueSchedule` creates a conversation for
  each scheduled run. `submit` reads the model catalog while it builds a run with images.
- `src/worker-tasks.ts`: the `due-schedules` task starts every due schedule on each 30-second
  tick.
- `tests/integration/agent/admission.contract.spec.ts`: six submissions at once on six
  connections, with a limit of three, admit exactly three. Without the advisory lock, all six
  were admitted.
