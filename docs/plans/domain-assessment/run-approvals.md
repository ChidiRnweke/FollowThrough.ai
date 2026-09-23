# Run approval ownership

## Meaning and entry paths

The remote decideAgentRun and decideAgentRunBatch commands call Agent.decide and Agent.decideMany.
These commands answer saved pending tool calls; they do not themselves apply the proposed changes.
The resumed executor retains the reviewed preparation and tool-write approval boundary from ADR 0003.
ADR 0025 requires durable run state and idempotent lifecycle events.

Previously the controller validated an unlocked run snapshot, recorded decisions and asked the
repository to choose a requeue transition. A concurrent cancellation or requeue could change that
snapshot. In particular, the repository could return an already queued run while the controller
appended a second queue event based on its earlier awaiting-approval snapshot.

Agent now locks the actor's authoritative run before validation. RunApprovals checks the accepted
states and every requested call against the saved pending calls, then produces a resolved queue write
only for an awaiting-approval run. The controller records all decisions, persists that write and
appends its event in one transaction. A queued run accepts another pending decision without rewriting
the original queue timestamp or event. Execution starts only after commit.

Cancellation and approvals use the same row lock. Once cancellation wins, an approval fails before
recording any decision. Actor scoping, contradictory duplicate-decision rejection, reviewed content,
partial batch answers and all-or-nothing recording are preserved. No schema or public command change
is required.

## Test dispositions

Keep controller cases for same-run resume, all pending calls in a batch, missing-call rejection,
no partial batch writes and contradictory decisions. Add separate answers producing one queue event
and rollback of decisions and state when event storage fails. The focused service tests cover each
accepted/rejected state, the timestamp and whole-batch validation.

PostgreSQL contracts hold a concurrent queue or cancellation write open, wait for the command to
reach the row lock and then commit the competing state. They check that an already queued run gets
no duplicate queue event, and a cancelling run gets no approval record. The successful case runs the
real controller execution path with the shared in-memory provider runner, then cancels and settles it.

## Remaining scope

The repository retains uniqueness and contradiction checks for immutable decision records. General
run transitions, run preparation and the remaining ledger operations still require their own semantic
ownership review. This disposition does not close the entire agent workflow family.
Observed validation and delivery status are recorded on the dependent PR and continuation register.
