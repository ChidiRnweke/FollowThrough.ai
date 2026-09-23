# Run output reconstruction

## Meaning and entry paths

This covers the saved-output portion of W16 conversation history and W17.22 terminal settlement.
An execution produces text, reasoning and tool events in order. The reopened conversation must keep
that order. Text on either side of a tool call is two messages, each carrying its own first cursor.
Reasoning stays distinct from visible response text. An unreadable event still marks a boundary.

The event repository previously reconstructed this domain output and exported the folding rule for
its fake. It now reads one attempt's typed stored event records in cursor order. Boundary parsing
retains unreadable records and their identities. The run-output service owns reconstruction; Agent
reads events, resolves segments and journals them in its existing terminal settlement transaction.
The output-segment value type belongs to models. There is one folding implementation, with no
repository-to-service import or injected service disguised as a repository.

Commands, event frames, conversation messages and transaction behavior stay unchanged. No migration
is required.

## Test dispositions and remaining review

Move the six folding tests from the repository contract module to the run-output service. Strengthen
the contiguous-delta test to check reconstructed text rather than only segment count. Keep separate
reasoning, tool-boundary, cursor, non-output and unreadable-event guarantees. Keep controller tests
that verify saved text/reasoning, ordering and distinct cursors, plus PostgreSQL settlement rollback.

Add a PostgreSQL contract that reads one attempt among other run/attempt events, retains an unreadable
row and reconstructs separate output on each side with the correct cursors. The PR records observed
validation. The subsequent [run-images disposition](run-images.md) covers image preparation. Provider
session encoding and remaining agent declarations still need their own dispositions; this is not a
complete P17 assessment.
