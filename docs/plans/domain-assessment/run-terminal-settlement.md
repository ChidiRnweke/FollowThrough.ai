# Terminal run settlement

## Meaning and entry paths

This covers the server settlement portion of W17.22 and cancellation settlement in W17.17/W17.20.
RunSettlements claims a terminal outcome while the caller holds the transaction that also saves
output, session changes, abandoned-call cleanup and terminal events. Completion and failure require a
running run. Cancellation settlement requires a prior cancellation request. A losing conditional write
does not publish terminal events.

RunSettlements now supplies a resolved union of completion, failure and cancellation writes. Each arm
correlates the expected and resulting state and carries its required fields. The repository writes
those values with an expected-state condition. It no longer accepts arbitrary run patches or decides
timestamps and transition legality. The generic transition API and model transition matrix are removed
after migrating every caller to its actual claim, checkpoint, approval or settlement owner.

Review found a persistence discrepancy: completion requested `serializedState: undefined`, which the
fake cleared but PostgreSQL's generic patch skipped. Completion now supplies an explicit null, clears
pending calls and uses the same timestamp for finish and update. A resumed run cannot retain its
provider checkpoint after completion. Failure and cancellation keep their previous saved-state policy.

The terminal-status selector is shared behavior used by retry and event-stream consumers. It moves
from models to shared services. The stream route asks Agent whether the terminal event tail has been
delivered; it no longer makes that domain decision or imports the service. Cursor comparison retains
integer precision. Model values and record types stay in models; the unused nonterminal
status list is removed. Public commands and response shapes remain unchanged. No migration is needed.

## Test dispositions and remaining review

- Keep controller and PostgreSQL race, rollback, tool-history and duplicate-event contracts.
- Rewrite fixture transitions through RunPreparation, RunCheckpoints, RunApprovals and RunSettlements.
- Remove the unused generic matrix's positive-edge tests. The running-to-queued edge has no production
  caller. Actual claim, checkpoint, cancellation and approval suites cover the supported operations.
- Replace generic terminal-revival and skipped-start assertions with settlement-owner refusal cases.
  Existing approval and cancellation cases cover all terminal states and paused cancellation.
- Move terminal classification coverage beside the shared selector and cover the nonterminal states.
- Verify terminal stream drainage after an unreadable final database event and precise large cursors.
- Add resumed-checkpoint clearing and consistent finish/update timestamps, plus PostgreSQL coverage
  of actual approval, resume and completion. Add a database refusal to complete a queued run.

The PR records observed validation. Event-output reconstruction and other P17 declarations remain
unresolved; this disposition does not complete the full workflow inventory.
