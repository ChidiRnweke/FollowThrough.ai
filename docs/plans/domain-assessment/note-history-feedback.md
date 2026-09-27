# Note history feedback

The note workspace opens history before requesting the revision list and preferred publication.
Previously the dialog rendered “No versions yet” while the initial request was pending. A failed
request only produced a toast and left the same empty state behind. Reopening could retain a stale
selected snapshot from the previous request.

Use an explicit ready/loading/failure read state from the workspace through its dialog host. Clear
old summaries and selection before a fresh read. Only a successful empty result shows the first
publication hint. A failed list or selected revision read stays visible in the dialog and tells the
reader to close and retry. Restore is available only after the selected snapshot has finished loading.

The history footer and restore confirmation also promised that the current draft remained in history.
Ordinary Notes.restoreRevision copies a selected snapshot into the working note and restores its
attachments and derived content. It does not snapshot the current unpublished draft. Warn that
unpublished changes will be replaced. This corrects the UI promise without changing the unresolved
ordinary-note versus skill restoration distinction in D03.

## Evidence

Three browser regressions failed before the change: the restore footer, confirmation warning and
initial loading state. They pass with the correction. Additional cases cover the persistent failure,
disabled restoration during a read and the workspace dialog host forwarding failure. The selected
revision fixture now has matching plain text and document content.

Actual NoteVersionHistory captures use the same seeded published and draft documents at 1280 × 900
with the application styles. A separate seeded actual NotePane/NoteWorkspace check uses real workspace
resources with an in-memory offline transport. Opening View changes after a failed remote history
request leaves a persistent failure in the dialog. This is browser failure-path evidence, not a
successful database history round trip. Temporary fixture/session substitutions were removed.

At this stage W04.08–W04.11 remained open. The later [history request review](note-history-requests.md)
completes W04.08 and W04.09 and addresses out-of-order selection responses and blocked restore feedback. Preserve the existing comparison and storage tests; do not
count this UI correction as a completed history assessment.
