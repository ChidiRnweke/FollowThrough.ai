# Note revision comparison

W04.10 has two callers with different baselines. The history dialog compares the selected published
snapshot with the current local draft. Its NoteHistory store owns remote selection and prevents a late
response from replacing a newer selection. NoteVersionDiff receives both full documents and their
titles. It aligns document blocks and embedded resource identities, and intentionally ignores incidental
formatting attributes. That presentation rule is documented in [note comparison](note-comparison.md).

The agent's diff_note_versions tool validates note and revision IDs, then calls Notes.compareRevisions.
An explicit baseline is another snapshot of the same note. Without one, the controller uses the note's
published revision, not its current working draft. Revision reads go through NoteCatalog and the actor-
scoped NoteRecords query. An unavailable note, archived project, missing target, or missing explicit
baseline fails the read. The result reports the baseline revision and a plain-text unified patch.
No comparison mutates the note or selects a restore policy.

## Count repair

The text diff previously counted lines in the formatted patch and excluded every line beginning with
three plus or minus signs as a presumed file header. A real added line beginning with `++`, or a removed
line beginning with `--`, therefore disappeared from the totals even though it remained in the patch.
Count the structured diff's hunk lines before formatting. Hunk lines do not include file headers.
The existing output format, title-change line, clipping marker, and complete pre-clipping totals remain.
The existing output budget is retained; this introduces no read limit.

## Evidence and test disposition

Both header-like body-line regressions fail before the repair and pass after it. Retain ordinary line
counts, unchanged content and revision labels. Add title-only and truncated-count cases. Keep the
mounted document-diff cases for title changes, nested resource identity, unchanged blocks, and layout.
The existing history request tests own stale selection and failure behavior.

The PostgreSQL comparison contracts exercise default publication versus a later working draft,
explicit baseline direction, a baseline from another note of the same account, and a foreign account.
Existing history-read contracts cover archived project visibility and full old-snapshot reads through
the agent version path. A legacy test that requested a nonexistent target before first publication was
renamed: it never reached default-baseline selection and must not claim that coverage.

W04.10 is assessed. Restore remains separate, including the D03 distinction between ordinary-note and
skill snapshot recording. This change makes no visible frontend change and requires no migration.
