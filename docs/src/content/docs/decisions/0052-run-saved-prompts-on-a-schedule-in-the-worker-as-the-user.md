---
title: 'ADR 0052: Run saved prompts on a schedule in the worker, as the user'
description: Let a user save a prompt with a recurrence, run it in the worker as that user with nobody present, and show each run as a chat.
---

## Status

Accepted. This decision amends ADR 0025: startup recovery settles only the runs that its own kind
of process was executing. It amends ADR 0032: the worker also runs the agent. It adds one
execution path to ADR 0034.

## Context

The agent works only while a user has a chat open. ADR 0049 let it reach other services, but a
user who wants a brief every morning, or a check of an issue tracker every hour, must still open a
chat and ask.

Four facts decide what a scheduled run can be:

- A run does not need a browser. `submit` saves the run, then executes it as a detached promise
  in the process that called it (ADR 0025). The evaluations already start runs this way.
- The worker builds the same application graph as the web process (ADR 0032), and lists work
  across users before it acts as each owner. It has never run the agent.
- A run in approval mode parks at its first change and waits for a decision. No decision expires.
- Startup recovery in the web process fails every run it finds in the `running` state. It matches
  by status, so it would fail a run that the worker is executing.

Three things do not exist: a stored recurrence, a stored time zone for a user, and a record that a
user has seen a chat.

The word "task" is taken. `ScheduledTask` is the worker's maintenance tick, and todos own the
idea of a task in the product.

## Decision

We chose to let a user save a **schedule**: a prompt, a recurrence, a time zone and an execution
mode. The worker starts each occurrence as an agent run for that user. One occurrence is a
**run**. The domain is `schedules`.

### Recurrence and time

A recurrence is a closed union: once, hourly, daily, weekdays, weekly and monthly. Each arm
carries only its own fields. There is no cron expression. The fastest recurrence is hourly, so
the decision adds no rate limit.

A schedule stores an IANA time zone. The browser supplies it when the user creates the schedule,
and the user can change it. A schedule at 08:00 stays at 08:00 local time across daylight saving
changes and when the user travels.

One shared rule (ADR 0041) computes the next occurrence after an instant, with
`@internationalized/date`. A local time that does not exist on a day runs at the later instant. A
local time that occurs twice runs once. "The 31st" runs on the last day of a shorter month. The
server stores the next instant on the schedule. The browser uses the same rule only to preview a
schedule that is not saved yet.

### Starting a run

The worker asks every 30 seconds for the schedules whose next instant has passed. Times have a
resolution of one minute, so a run starts inside its minute. For each schedule, one transaction
locks the row, moves the next instant forward, creates a conversation, saves a queued run with
the prompt, and records the occurrence. Execution starts after the commit. If the transaction
fails, the next instant does not move and the next tick tries again. A second worker waits for
the lock and then finds nothing due.

If the worker was down, a schedule runs once when the worker returns, for the latest occurrence
that passed. Older occurrences are skipped.

While one run of a schedule waits for approval, the next occurrence is skipped. A schedule has at
most one waiting run.

The start is an operation of the agent harness. It takes a schedule id and builds the frozen run
input from the locked row. The input carries the schedule as the origin of the run. The
instructions take the local date and time from the schedule's time zone, and say that nobody is
present.

### Permissions

A schedule carries the execution mode that chats already have. The approval rule does not change.
A schedule that asks first parks at its first change, and the user decides when they return. A
schedule in auto-accept mode runs every tool that is not turned off, which includes changes in
connected services that cannot be reverted (ADR 0049).

The user and the agent can both create and change schedules. A tool cannot state an execution
mode: a schedule made through a tool always asks first. Only the user can set auto-accept, in the
application. A scheduled run can read schedules, but it is not offered the tools that change
them.

### Results

Each run is a new conversation in the chat history. It is marked as scheduled, and the prompt is
shown as sent by the schedule.

An occurrence records when the user opened it. The record is stored on the server, so every
device agrees. One menu in the application rail lists runs that wait for approval, runs that
finished and are not opened, and memory to review. Schedules and occurrences are synchronized
records (ADR 0040), so the menu is derived in the browser.

Each list shows one line for a run: the first sentence of its final answer, read from the
conversation. Nothing else is stored for it.

### Recovery

A run records the kind of process that executes it, `web` or `worker`, when a process claims it.
Each process settles only the interrupted runs of its own kind at startup. The worker runs the
same recovery that the web process runs. When the user approves a parked run, the web process
claims it and becomes its executor.

## Consequences

- The agent can work for a user who is away. The worker must run for a schedule to start, and it
  now calls the model provider and connected services.
- A schedule in auto-accept mode can change data in a connected service with nobody present. The
  setting must say so.
- A restart of the worker fails the scheduled runs it was executing. The user sees a failed run
  and can retry it.
- Two processes of the same kind still fail each other's runs at startup. That is already true of
  the web process. A fix needs a lease for each instance.
- Every run adds a conversation to each device's synchronized records, and nothing removes old
  ones. An hourly schedule adds 8,760 conversations in a year.
- Many schedules at the same minute start many runs in one worker. The decision sets no limit on
  concurrent runs, because none is measured.
- A schedule has no project, model or skill of its own. A run uses the whole workspace and the
  user's default model.
- A schedule sends no email or push notification. The user learns of a run when they open the
  application.

## Evidence

- `src/lib/server/controllers/agent/controller.ts`: `submit` saves the run and then calls
  `executeInBackground`, which starts execution without awaiting it. `recoverInterrupted` fails
  an interrupted agent run with the message "Process restarted".
- `src/hooks.server.ts`: `init` calls `recoverInterrupted` for every run that
  `RunRecoveryController.interrupted()` returns. `src/worker.ts` runs no recovery.
- `src/lib/server/db/schema/registry.ts`: `agent_runs_user_request_unique` makes a repeated
  request key return the same run. `agent_runs_active_conversation_unique` allows one active run
  for each conversation.
- `src/worker.ts` builds `createProductionComposition()`, the composition of the web process, and
  runs each user's work through `forActor`.
- `src/evals/lab/run-case.ts` starts runs through `agentHarness().submit` with no browser.
- `src/lib/server/services/agent/runs/instructions.ts` takes the time zone from the browser's
  context and uses `UTC` when there is none.
- `package.json` lists `@internationalized/date` 3.12.2 under `devDependencies`. The worker image
  installs production dependencies only, so the package must move to `dependencies`.
- `docker-compose.prod.yml` runs one worker replica.
