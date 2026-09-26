# Source-anchor ranges

SourceAnchor records a quote and optionally its offsets in an observed note revision. SelectionOrigins
creates both offsets from the validated selection. NoteCatalog repairs both when the quote has one
unambiguous occurrence. Missing or ambiguous quotes retain their original anchor and revision;
reference-link presentation can locate an unambiguous quote without trusting stale offsets.

The prior model and SQL mapper accepted one offset without the other. Four mapper regressions also
reproduced acceptance of negative and reversed ranges. These are invalid range values, not a distinct
product state. The model now represents a complete pair or no recorded range. Its boundary schema
requires nonnegative integer offsets in order. A quote without offsets remains valid; no location is
guessed. Existing wire field names stay unchanged.

Provenance owns the source-anchor type and schema. Tasks and references use that type instead of
private copies. SQL and workspace readers use the same schema, and the sync field projection retains
both offsets. Selection validation, quote repair and editor positioning stay with their existing
owners. This change does not move those workflow decisions into the model.

Node identity and textual context remain separate optional facts. Neither is produced by current
selection capture, but either can accompany a stored quote independently of a recorded range. Prefix
and suffix can also vary independently at document boundaries. No inferred location or default
context is added.

Malformed stored anchors now fail reads. No live data audit, migration or repair has been performed.
The PostgreSQL contracts distinguish malformed raw storage from valid domain fixtures, verify sync
retains the pair, and retain quote-only anchors. Local PostgreSQL is unavailable; CI must establish
those contract results. Existing selection, note repair, task provenance and reference-link tests
remain the workflow evidence. This disposition does not close the full task or origin workflow review.

The four invalid-range mapper cases failed before the change. Afterward, focused regressions passed
37 files and 298 tests; the full local unit suite passed 442 files and 4,089 tests. Lint, architecture
and documentation checks passed. Type checking passed with a 4 GB heap after the local default 2 GB
process ran out of memory; the repository's standard check command is unchanged.
