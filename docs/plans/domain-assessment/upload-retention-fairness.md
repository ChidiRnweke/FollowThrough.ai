# Expired upload reclamation

This assesses W26.06 and continues W14.15 and W26.07 under ADRs 0016 and 0032. It covers abandoned
upload reservations and their staging objects, not every unreferenced committed object.

## Entry path and existing guarantees

The attachment capability constructs UploadRetention with the repository and S3 adapter. Application
backgroundTasks exposes it alongside indexing and attachment processing. The worker schedules those
tasks immediately and then at their configured intervals; scheduler tests cover non-overlap, retry
after failure, independent tasks and shutdown drain. The web process does not start this scheduler.
The existing defaults remain a 15-minute interval, a 500-reservation work budget and an hour of grace
past upload expiry. No new read cap is introduced.

A reservation identifies an owned staging object. The worker deletes that object before deleting the
reservation row. An object-store failure leaves the row available for retry. An already-absent object
is successful cleanup. A later database failure also leaves a retryable row; the next attempt can
remove an already-absent object and finish the row deletion. Each failure is reported, and the worker
continues the selected batch. Successful completion reports reclaimed and selected counts.

## Reproduced starvation

The repository selected the oldest expired rows up to the work budget on every tick. Failed rows stay
in the table. When a failed set filled the budget, every subsequent tick selected the same set and
never reached later expired uploads. A regression uses a one-reservation budget, an object that
persistently fails deletion and a later reclaimable reservation. After two ticks, the later row still
exists before the repair. This is an observed scheduling failure, not just a query-order concern.

## Traversal ownership and repair

The repository orders by expiry and upload ID and accepts a cursor containing both required fields.
The worker carries one traversal value: its cutoff and cursor belong to the same pass. It advances
past attempted rows even when removal fails. A finished pass starts again from the oldest eligible
reservation, so retained failures are retried. The cutoff remains fixed during a pass; new expiries
cannot indefinitely extend that pass and postpone retrying older failures.

The cursor is a work schedule, not a deletion receipt. Only successful object and row deletion removes
work. A worker restart starts a fresh pass from the beginning; no data is skipped durably. Multiple
workers can repeat an idempotent cleanup, and this repair adds no distributed claim or database
migration. The existing grace policy is retained, not replaced by the traversal cursor.

## Tests, dispositions and limits

Retain seven reclamation tests for object-first removal, reservation deletion, grace, absent objects,
per-item failure and empty work. Move their stateful fakes into the shared testing directory and make
the reservation fake actually remove deleted rows. Add starvation, retry-on-wrap and continuing-arrival
cases, plus recovery after object deletion succeeds but row deletion fails. Retain the nine scheduler
tests. All 20 focused tests pass; the starvation case fails before
the repair.

Add a PostgreSQL contract with tied expiry times and a one-row budget. It runs the real retention
service and repository with the existing failing-object behavior, then verifies that the later row
is reclaimed while the failed reservation remains. Local and CI results are recorded in the PR.
No live object-store deletion, OCR or model request is made.

General committed-object garbage collection, reservation/finalization crash compensation,
configuration validation and multi-instance operational sizing remain separate reviews. This closes
the expired-reservation worker assessment, not all of W14.15 or W26.07.
