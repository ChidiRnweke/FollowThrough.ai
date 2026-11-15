# Schedules

A schedule is a saved prompt with a recurrence, a time zone and an execution mode. The worker
starts each occurrence as an agent run for the schedule's owner, with nobody present. One
occurrence is a **run**; the word "task" belongs to todos and to the worker's maintenance tick.
[ADR 0052](../src/content/docs/decisions/0052-run-saved-prompts-on-a-schedule-in-the-worker-as-the-user.md)
records the decision. This page describes how the parts connect.

## Parts

| Part          | Location                                               | Role                                                                                            |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Models        | `models/schedules/`                                    | Branded ids, the `Recurrence` union, schedule states, occurrences, request schemas and views.   |
| Rules         | `services/schedules/rules.ts`                          | The next occurrence after an instant, every edit of a schedule, and whether a schedule is due.  |
| Presentation  | `services/schedules/presentation.ts`                   | How a schedule and a run read: recurrence in words, the caption, the run's state and one line.  |
| Controller    | `server/controllers/schedules/controller.ts`           | List, read, create, change, pause, resume, set the mode, delete, mark a run opened.             |
| Backlog       | `server/controllers/schedules/backlog.ts`              | Lists due schedules across all users for the worker.                                            |
| Services      | `server/services/schedules/{library,runs}.ts`          | Stored schedules; the record of each run and whether a run of a schedule waits for approval.    |
| Repository    | `server/repositories/schedules/`                       | Rows in `schedules` and `schedule_occurrences`.                                                 |
| Run start     | `server/controllers/agent/controller.ts`               | `runDueSchedule` and `runScheduleNow` on the harness: claim the occurrence and enqueue its run. |
| Worker task   | `src/worker-tasks.ts`                                  | `due-schedules`, every 30 seconds: one `runDueSchedule` per due schedule, as its owner.         |
| Agent tools   | `server/factories/agent/tools/definitions.ts`          | Read, create, change, pause, resume, delete and run a schedule.                                 |
| Browser views | `controllers/workspace/views.ts`                       | The list, one schedule with its runs, and what the bell shows, derived from the replica.        |
| Entry points  | `remote/schedules/`, `routes/(app)/scheduled/`         | Commands only; the pages read the synchronized workspace.                                       |
| Components    | `components/schedules/`, `components/shell/attention/` | The list, the sentence, the runs, and the shared bell.                                          |

## The recurrence rule

`ScheduleRules` is a shared service (ADR 0041). The server uses it to decide every stored next
instant. The browser uses the same class only to preview a schedule that is not saved yet, so the
preview and the saved value cannot differ.

A recurrence is a closed union: `once`, `hourly`, `daily`, `weekdays`, `weekly`, `monthly`. Times
are local to the schedule's IANA time zone and have a resolution of one minute. The rule converts
through `@internationalized/date`:

- A local time that does not exist on a day (a daylight saving gap) runs at the later instant.
- A local time that occurs twice runs once.
- A monthly day that a month does not have runs on the last day of that month.

A schedule is `active` with a `nextRunAt`, `paused`, or `finished`. Only a `once` schedule
finishes. The table holds the check `(status = 'active') = (next_run_at is not null)`, so the
states the union excludes cannot be stored.

## Starting a run

The worker task asks the backlog for schedules with `status = 'active'` and `next_run_at <= now`.
For each one it builds the owner's composition and calls `runDueSchedule`. That call does one
transaction:

1. Lock the schedule row.
2. Ask `ScheduleRules.due(schedule, now, waiting)`. `waiting` says that an earlier run of this
   schedule is parked for approval.
3. Save the schedule with its next instant moved forward.
4. On `due`: create a conversation in the schedule's execution mode, save a queued run with the
   prompt as its first message, and record the occurrence. The occurrence id is the run's request
   id.

The run executes after the transaction commits. A failure before the commit leaves the schedule
due, and the next tick tries again. A second worker waits on the row lock and then reads a
schedule that is no longer due. The unique index on `(schedule_id, scheduled_for)` for recurrence
occurrences is the second guard.

Three results need a statement:

- **Missed occurrences.** When the worker was down across several occurrences, the schedule runs
  once, for the latest missed occurrence. The next instant is computed from now.
- **A waiting run.** While a run of a schedule waits for approval, a due occurrence of that
  schedule is `skipped`: the next instant moves forward and no run starts. The schedule's page
  says so.
- **Run now.** `runScheduleNow` starts a run with the trigger `manual`. It does not move the next
  instant. Its caller's `requestId` makes a repeated request start one run.

A scheduled run carries a `ScheduledRunOrigin` on its frozen input (ADR 0034). The instructions
then state the local time in the schedule's zone and that nobody is present. The run is offered
the tools that read schedules and is not offered the tools that change them.

## Who may set the mode

`setExecutionMode` is excluded from the agent's tools, and the tool that creates a schedule
accepts no mode. A schedule that the agent creates always asks before a change. Only the user can
let a schedule act without asking, on its page.

## Two processes execute runs

The web process and the worker both execute agent runs. Each process is built with its kind,
`'web'` or `'worker'`, and `RunTransitions` writes that kind to `agent_runs.executor` when it
claims a run. Startup recovery settles only the runs that its own kind was executing:

- A web restart does not fail a run that the worker is executing.
- A worker restart fails the scheduled runs it had in flight. Each shows as a failed run and can
  be retried from its chat.
- A scheduled run that parks for approval is resumed by the web process when the user decides.
  The claim then writes `'web'`, and the run belongs to the web process from that point.

Two replicas of the same kind still fail each other's runs at startup. That was true of the web
process before this decision, and it is why the worker stays at one replica.

## What the browser reads

`schedules` and `schedule_occurrences` are synchronized resource types (ADR 0040). The pages and
the bell read the replica; the remote functions are commands, and each caller refreshes the
replica with `workspaceSession.serverChange`.

`WorkspaceViews` joins an occurrence to its run and its conversation in the replica:

- `schedules(viewer)` gives each row its caption, whether a run waits, and its count of unopened
  runs.
- `schedule(id, viewer)` adds the runs, newest first, each with its state and one line. The line
  is the first sentence of the run's final answer, the failure, or what the run waits for. No
  summary is stored.
- `scheduledAttention(viewer)` gives the bell its two groups: runs that wait for approval, and
  runs that finished and were not opened.

A run is **unopened** when it has ended and its occurrence has no `openedAt` at or after the run's
last update. Showing the run's chat calls `markRunOpened`. Opening a chat before its run ends does
not count, because the result arrived afterwards.

Sync is pull-based, so nothing tells the browser that the worker started a run. The app shell asks
for a sync 35 seconds after the earliest `nextRunAt` (the worker's 30-second tick plus a margin),
and every 30 seconds while a scheduled run in the replica is queued or running.

## Testing

- `services/schedules/rules.spec.ts` holds the recurrence rule with literal instants: Brussels
  02:30 across both 2026 daylight saving changes, the 31st in February, Friday to Monday, several
  missed occurrences, and a waiting run.
- `server/controllers/agent/scheduled-runs.spec.ts` holds the run start against `InMemory*` fakes:
  the frozen mode and origin, the second call that is not due, and a `once` schedule that finishes.
- `tests/integration/schedules/` and `tests/integration/agent/executor-recovery.contract.spec.ts`
  hold the PostgreSQL behavior: the checks, owner scoping, one occurrence for one instant, and
  recovery by process kind.
- `controllers/workspace/scheduled-views.spec.ts` holds the browser views and the unopened rule.
