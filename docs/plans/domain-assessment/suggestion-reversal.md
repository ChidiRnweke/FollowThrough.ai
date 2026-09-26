# Accepted suggestion reversal and effect consistency

## Current contract

W10.14 and W10.15 follow revert_suggestion through Suggestions.revert, SuggestionEffects,
SuggestionEffectRecords, the index and SuggestionInbox's state transition. The agent/MCP tool is a
mutation and carries only the suggestion ID plus authenticated context. PR #59 intentionally removed
the old Undo control from the review UI; the tool remains. This review does not reintroduce a button.

The controller owns one transaction. It locks the owned suggestion before reading its status,
restores its recorded changes, updates affected search records and transitions accepted to reverted.
It returns the stored reverted suggestion. Repeated or competing reversal cannot perform a second
successful transition. Another actor cannot resolve the suggestion or its effect.

An effect records created, modified or unchanged participants. Modified records retain both complete
snapshots. Created and modified participants carry the workspace version that existed after
acceptance. The repository flushes the deferred sync journal before recording that version. The
reader validates stored effects, unique participants and matching before/after identity. Missing
legacy effects and malformed stored effects fail; no artifact-ID-only fallback guesses what to undo.

SuggestionEffects locks changed participants in stable identity order and verifies every version
before restoring any participant. A later edit therefore leaves all saved data and accepted status
intact. It restores changes in reverse order. An unchanged participant is neither restored nor
version-checked, so later edits to a pre-existing unchanged relationship survive.

Created tasks and memory are retired; created diagrams are archived; created relationships and
references are removed. Modified records recover their saved preimage, including clearing absent
optional columns, with a fresh update time. Memory replacement restores the old entry and retires the
replacement together. The controller then reconciles memory/diagram search data. Index failure or
state-transition failure rolls the whole operation back.

Acceptance uses the same suggestion lock. It applies the kind-specific change, indexes it, records
the effect and transitions proposed to accepted in one transaction. A losing concurrent acceptance
cannot leave another artifact or effect. Memory auto-acceptance owns its transaction separately and
records the same effect format; its source and policy review is recorded in the memory dispositions.

## Test disposition

Keep the eight focused effect tests, but correct their fixtures. Memory effects now belong to memory
update/removal proposals. Existing relationship modification and unchanged outcomes use backlink
proposals. The old task-modification and task-unchanged fixtures described outcomes the task proposal
path does not produce. Keep the newly-created task case and the legacy-effect refusal.

Replace the seven SQL contracts' hand-assembled acceptance/reversal orchestration with real
Suggestions and SuggestionInbox composition wherever the behavior is a controller contract. The
fixtures now create the actual memory update or backlink proposal before accepting it. Keep the
malformed-effect test at the repository boundary.

The SQL contracts verify returned/persisted reverted status, replacement and original records,
restored/removed search chunks, stale refusal, backlink preimage, surrounding-transaction rollback,
competing acceptance and competing reversal. Add indexing-failure rollback and foreign-actor
refusal. They use real PostgreSQL repositories and transactions with the existing deterministic
embedding fake, configured with the database's vector dimensions. No live model is required.

The focused local effect/controller suite passed seven files and 43 tests. PostgreSQL contracts must
run in CI because local Docker is unavailable. W10.14 and W10.15 are assessed subject to those
contracts passing before merge. The wider proposal review surfaces and other pending workflow IDs
remain separate work.
