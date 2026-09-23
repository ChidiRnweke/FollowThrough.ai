# Run cancellation ownership

## Entry paths and guarantee

Agent.cancel serves the durable run cancellation command used by chat and the durable diagram,
reference, relationship and task workflows. ADR 0025 requires the cancellation request to commit
before the executor is aborted. The controller owns that transaction and the terminal event.

Previously the repository read a run, chose its cancellation transition and attempted a conditional
write. Execution could start between that read and write, making cancellation report a missing run.
The controller also appended a cancelled event whenever the returned run was cancelled, including
repeated requests. A new regression reproduced two terminal events for two queued cancellations.

Agent now reads the actor-scoped authoritative row under a lock, asks RunCancellation for a resolved
write, persists it and appends the immediate terminal event in the same transaction. The service owns
the queued/active/terminal decision. Repositories and fakes receive resolved values. Terminal and
already-cancelling states produce no new write or immediate event. No migration or public response
change is required.

Queued runs become cancelled with matching request, update and finish timestamps. Running and
approval-paused runs become cancelling. Post-commit abort, grace settlement, out-of-process settlement
and pending approval cleanup retain their existing owners and behavior. Foreign actors receive the
same missing-run error as an absent identifier.

## Test dispositions

Keep the existing controller tests for queued cancellation, active executor abort, approval pause,
grace settlement and competition with executor settlement. Add repeated-request idempotence, actor
isolation and rollback when the terminal event write fails. Wire the real cancellation service into
the shared workflow fixtures; do not duplicate its policy in the fake repository.

PostgreSQL contracts exercise execution holding the row lock before cancellation, two connections
cancelling one queued run, and actor isolation. The existing execution/settlement race still marks
cancellation in a transaction before competing with completion; it now uses the cancellation owner.

## Remaining scope

This closes the cancellation request's read-decide-write ownership. Approval requeue is covered by
the subsequent [run-approval disposition](run-approvals.md). General run transitions still exported
from models and the remaining run persistence/service composition need separate assessment. This
does not establish completion of the agent family or the repository inventory.
Observed validation and delivery status are recorded on the dependent PR and continuation register.
