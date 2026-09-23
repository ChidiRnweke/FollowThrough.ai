# Task completion values

Todo's documented invariant requires a completion timestamp exactly when status is done. Its
previous interface and record schema allowed either field to disagree with the other. Two mapper
regressions reproduced acceptance of done without a timestamp and open with a timestamp.

Todo now carries a discriminated completion state. Shared creation and edit rules construct that
state explicitly. Completing records the supplied clock time, edits to completed tasks retain the
original completion time, and reopening clears it. SQL, workspace cache, sync and batch receipt
readers share the record schema. Request field schemas still accept partial commands; the resolved
record schema enforces the pair. The sync projection retains the completion column.

Existing valid command and response shapes are preserved. Invalid persisted records now fail reads
instead of entering the domain. This change does not guess historical completion times or rewrite
data. No production data audit or repair has been performed. There is no database migration.

Fixture builders now produce valid completed tasks. A storage contract that set done without its
completion time is corrected. Negative mapper and PostgreSQL contracts deliberately write malformed
external rows; those rows are not used as domain fixtures. Existing controller completion, reopening,
nullable clearing, atomic creation and browser/server parity tests remain authoritative for workflows.

Focused regressions passed 16 files and 120 tests after the two mapper refusal cases failed before
the change. The full local unit suite passed 441 files and 4,083 tests. PostgreSQL contracts also
cover restoring both completion states through suggestion effects, so the new schema retains the
completion column for rollback. Local PostgreSQL was unavailable; CI must establish those results.

This is the completion-state disposition for Todo. Source-anchor values and the remaining task
workflow reconciliation still require review; this slice does not close the repository assessment.
