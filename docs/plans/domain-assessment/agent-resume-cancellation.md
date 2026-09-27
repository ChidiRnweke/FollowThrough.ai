# Cancellation ownership across approval resumes

This continues W17.03, W17.12–W17.14 and cancellation review under ADR 0025. It does not mark the
whole agent run workflow assessed.

## Reproduced failure

RunApprovals accepts another pending decision while a run is queued. Only the first decision changes
awaiting_approval to queued, but Agent.decideMany previously launched background execution after
every accepted decision. With two decisions recorded before execution claimed the run, both local
attempts registered an AbortController for the same run. One attempt won the durable execution claim.
The losing attempt then released the shared slot. Cancellation could settle the durable state while
leaving the running provider's abort signal untouched.

The controller regression uses the real submission controller, run lifecycle services, transactional
in-memory persistence and existing provider fake. It parks an approval, records two separate pending
call decisions while execution is queued, starts the resumed provider and cancels it. Before the
repair, the provider signal remains un-aborted. This is more than a registry-presence assertion.

## Ownership and repair

The approval transaction now returns whether it actually requeued the run. Only that transition
launches execution. Later decisions on the queued run still commit and are available to the pending
executor; they do not replace its cancellation handle. Batch decisions still requeue once.

An execution releases its registry slot only when its AbortController is still the registered owner.
This also protects a newly resumed attempt from delayed cleanup of an older attempt. Each note-action
controller already holds its own controller, so its finally block passes that existing identity.
No durable state, public API or cancellation grace policy changes.

The controller still persists cancelling before requesting an abort. Workflow executors continue to
claim their durable run before registering local execution, and every terminal path releases only
its own local handle.

## Test dispositions and limits

Add the controller regression and a registry regression for stale cleanup; both fail before the fix.
Upgrade the existing registry abort test to inspect the actual signal. Retain approval requeue,
duplicate decision, batch rollback, cancellation and restart recovery tests. All 45 focused tests
passed; full local and CI results are recorded in the PR. No live model call is required.

This is an in-process ownership repair. It does not add cross-process abort delivery, establish a
multi-instance recovery policy, or settle application shutdown for independent background runs.
Those boundaries and the remaining approval UI review stay open.
