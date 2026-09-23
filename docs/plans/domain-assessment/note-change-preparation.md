# Note change preparation and revision comparison

## Ownership and entry paths

The Notes controller prepares agent-requested note and skill body changes. It resolves the current
note, converts its document to Markdown, applies the requested replacements, and stores the exact
base and result for approval. The patch service owns matching, replacement and failure explanations.
It does not read storage, call another service or apply an approved write. The controller retains
those responsibilities under ADR 0003. The approval card still displays the saved preparation.

Revision comparison is a separate read capability. Notes.compareRevisions resolves two stored
versions; the revision-diff service produces the compact textual comparison. Publication and restore
behavior remain governed by ADR 0011. The existing explicit truncation result and full-version
recovery instruction are preserved.

Both rules have server callers only. They now live in server services rather than importing a
server owner into shared models. Models retain NoteEdit, NotePatchFailure, NotePatchResult,
RevisionText, NoteRevisionDiff and the existing display limit. No wrapper or second implementation
remains in models.

## Valid states and guarantees

- A patch returns either a complete proposed body with matched text evidence or explicit failures.
  Partial changes never become a successful preparation. Sequential edits can refer to earlier edits.
- Matching prefers exact anchors, then unique whitespace/punctuation-tolerant anchors. Ambiguous,
  missing, empty and unchanged edits retain their existing failure forms.
- Replacement text is literal. Untouched bytes, including source line endings, are preserved.
- Approval remains bound to the reviewed base and prepared result. Stale approval and already
  satisfied results retain their existing controller behavior.
- A revision diff carries its text and line counts in every state. Its truncation flag does not hide
  an optional payload. Patch failures use a discriminated union; optional nearest text is independent
  diagnostic evidence, not an absent success result.

## Test dispositions and limits

Move all patch and textual-diff tests beside their service owner. Keep their assertions unchanged:
they cover the matching and literal/line-ending guarantees established by the earlier note pilot.
Keep reviewed note/skill changes, compare-revisions and revision-history controller tests in place.
The focused run passes 27 files and 218 tests. This placement change adds no public capability,
storage migration or visible interface change.

This is a disposition for the change-preparation and compact-comparison portions of W05 and W04.
It does not close every note editing, revision or model-content finding. Other note lifecycle,
document-reader and offline revision rules remain in the continuation inventory.
