# Run claims and approval checkpoints

## Meaning and entry paths

This covers the server claim and checkpoint portions of P17. RunPreparation claims queued chat
runs. NoteActionRequests claims queued note-action workflows inside the controller transaction that
also saves the start event. Agent parks a running chat run when the provider requests approval.

The owners now supply complete claim and checkpoint writes. Claims include the expected queued
state, running state and one timestamp for both start and update. The repository applies these
values only to the requested run kind and expected state. It cannot claim a workflow as a chat run.
The generic agent transition interface is removed.

RunCheckpoints resolves the resumable provider state, pending decisions and trace continuity. A new
provider trace wins; an omitted trace retains the prepared run's trace. Absent trace data is an
explicit null at persistence. This preserves ADR 0024. Agent owns the transaction containing the
checkpoint, session replacement, consumed decisions, approval events and conversation tool history.
It notifies readers after commit. Cancellation that wins the conditional write prevents publication.

The capability factory constructs RunCheckpoints with the actual run repository. Application wiring
and execution fixtures use that owner. Public commands and responses do not change. No migration is
required.

## Tests and remaining review

Service cases cover trace continuity and the supplied claim timestamps. Existing controller suites
cover approval reviews, event visibility, tool history, competing execution and cancellation.
PostgreSQL contracts add checkpoint rollback when approval publication fails and cancellation by
another execution before checkpoint publication. The PR records observed validation results.

The subsequent [terminal-settlement disposition](run-terminal-settlement.md) removes the remaining
generic transitions and model lifecycle helpers. Other P17 workflows still require review. This is
not an assessment completion.
