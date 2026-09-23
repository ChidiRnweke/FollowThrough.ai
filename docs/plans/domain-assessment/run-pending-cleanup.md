# Pending run call cleanup

## Meaning and entry paths

This covers the server cleanup portion of W17.17 (cancellation) and W17.20 (abandoned calls).
Agent journals unresolved tool calls as failed when a run ends without executing them, clears the
saved pending calls and returns the settled run. Approval cards must agree with that saved state.

A controller regression reproduced a cancelled approval-paused run returning its old pending calls
even though the database had been cleared. RunSettlements.complete returned the snapshot captured
before cleanup. Review also found that a reviewed run cancelled while queued for resume skipped
pending-call cleanup entirely.

Settlement now reads the saved run after terminal events and controller cleanup in the same
transaction. Immediate queued cancellation performs the same journal/clear step before returning its
saved snapshot. Pending-call cleanup writes only the pending-call column. Missing storage rows throw
instead of returning an ignored false result. Repeated cancellation remains idempotent.

The whole-run update API is removed from the repository and fake after checking all callers. Its last
production caller only needed to clear pending calls. Checkpoint contracts now use actual claim/park
transitions and valid checkpoint payloads. The previous cancellation-versus-snapshot-write contract
is retained through the locked preparation owner; it still waits for the database row lock and proves
cancellation wins. No migration or public response shape change is required.

## Tests and remaining review

New controller cases verify empty pending-call lists both on the returned run and on the snapshot's
approval-card field, for paused and queued-after-review runs. PostgreSQL contracts check the same
views against the saved row. Existing lifecycle cases retain abandoned-call journal entries, atomic
settlement, cancellation races and duplicate-event protection. Workflow settlement regressions ensure
the fresh result read works for chat, diagrams, references, relationships and tasks.

Generic transition methods and model lifecycle helpers remain separate ownership work. This slice
does not complete the wider workflow inventory. The dependent PR records observed validation.
