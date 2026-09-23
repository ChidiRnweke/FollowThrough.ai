# Chat run preparation ownership

## Meaning and entry paths

This covers the server execution portion of inventory workflows W17.03 (claim/start) and W17.04
(resolve/freeze inputs). It does not mark those wider workflows or the whole family assessed.

Agent.execute claims a queued chat run, records provenance, builds or reuses frozen context and emits
run_started before provider execution. Submission, approval resume and recovery use this path. The
claim remains a conditional storage write, so competing executors cannot both start the same run.

Preparation previously saved whole run snapshots for provenance and context, then appended the start
event separately. A regression reproduced prepared context remaining after event storage failed.
Broad snapshot writes also relied on transition errors to detect concurrent cancellation.

RunPreparation now owns claiming and preparation rules against the real repository. Agent owns short
transactions that lock the actor's running chat record and persist resolved provenance/context fields.
The context write and start event commit together. Existing authoritative provenance and frozen context
win over newly built values. Slow context assembly remains outside the write transaction.

Repositories write only the resolved fields and return a typed prepared run after the context write.
The controller's prepared-run assertion is removed. A locked read distinguishes cancellation in
progress and cancellation already settled elsewhere; execute returns the cancelled outcome even when
the local abort signal has not fired. Other preparation errors remain loud and enter normal failure
settlement. Public commands, provider inputs and storage schemas are unchanged.

## Test dispositions

The new controller regression failed before the change because context survived a rejected start
event. It now verifies failure settlement without that context. Existing context/grounding, approval,
recovery, lifecycle and cancellation tests use the real preparation service. Add the race where another
execution settles cancellation while context is blocked, with no local abort.

Service tests cover exclusive claiming, actor scope, both cancellation states and retention of frozen
context/provenance. PostgreSQL contracts reject the start event and verify context rollback before
failure settlement, and cancel a real run while the shared gated memory fake holds context assembly.
Settlement and approval contracts wire the new service to their transaction-bound repositories.

## Remaining review

The subsequent [pending-call cleanup disposition](run-pending-cleanup.md) removes the remaining broad
run update. Generic repository transition guards and model lifecycle helpers remain for separate
review. This slice does not close the full agent family or the assessment inventory. The dependent PR
records observed local and CI validation.
