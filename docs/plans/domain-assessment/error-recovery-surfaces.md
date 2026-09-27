# Rendering recovery surfaces

This is a partial assessment of W25.04. The baseline is the recovery behavior introduced in merged
PR 37 and retained by ADR 0040. Local storage repair and approval authorization have separate owners.

## Containment and retry

ErrorBoundary wraps the smallest available rendering surface: individual message segments, turns,
step disclosures, subject rows, change previews, the note editor, task descriptions and right panels.
PageShell supplies another boundary around page content. Route-level error pages cover failures
that escape those surfaces; the app route retains the surrounding shell when that layout survives.
These are rendering boundaries, not catch-all handlers for asynchronous events or failed commands.

The generic fallback names the failed content, preserves supplied raw source and calls Svelte's
reset callback when the user chooses Try again. A successful retry replaces the fallback with the
child. A persistent failure keeps the source and another retry available. The error boundary does
not write to workspace storage or start a domain mutation.

Existing browser tests checked the notice, source and presence of the retry button. Two additional
mounted tests exercise the button: one recovers after the rendering dependency becomes available;
the other verifies that raw source survives a second rendering failure. All seven boundary tests
passed. No production UI or styling changed.

## Route and account recovery

Both route error pages offer reload, navigation to Today and WorkspaceRecoveryDownload. The latter
exports raw account storage through the independent recovery path without starting the normal
workspace. The account-hint cookie identifies which local records to export; it is not server
authorization. Missing identity fails visibly. Reset warns about unsent edits and other tabs,
requires a separate confirmation, stops the session, deletes account-local storage and reloads only
after success. Export/reset failures render an alert and clear busy state.

Three existing mounted tests use real IndexedDB records to verify no deletion before confirmation,
no deletion after Cancel and removal after explicit reset. Together with the boundary tests, ten
browser tests passed. Storage export contents and cross-tab coordination remain owned by the
separate storage-recovery tests and assessment; this review does not claim a live full-app crash.

## Remaining specialized behavior

The editor fallback names a rendering failure and offers retry/reload. Its statement that nothing
was written while the renderer was down needs comparison with independently running autosave work.
The change-preview fallback tells the user to reject or retry. Its footer availability is derived
from prepared review data; rendering failure itself is not part of that predicate. Determine a
production-reproducible failure case and assess standalone, expanded and grouped approval behavior
before treating that specialized recovery flow as complete. These are inspection findings, not
confirmed defects. W25.04 remains open.
