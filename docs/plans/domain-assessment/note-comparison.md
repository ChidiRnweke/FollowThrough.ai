# Note comparison and revision highlights

## Distinct comparison rules

Version review and live revision highlights have different purposes. The shared note-diff service
aligns blocks across the two documents so an insertion does not mark later unchanged blocks. It
preserves the existing text/type signature and resource-identity comparison. Titles become heading
blocks before comparison so a rename is visible in history and conflict review.

The shared note-shimmer service preserves index-aligned highlights when an external revision reaches
the editor. An insertion marks the changed region, including subsequent shifted blocks. Formatting
and mark-only changes remain ignored by this existing presentation rule. These two meanings stay
separate; neither decides whether a document may be saved or approved.

Both services now receive the actual ProseMirrorDocument/ProseMirrorNode types. Remove the duplicate
DiffDocument, DiffNode, ShimmerDocument and ShimmerNode projections. Models retain only comparison
result values. Private text/signature readers accept present nodes; the outer highlight loop handles
an absent prior block once.

## Caller and test dispositions

NoteVersionDiff accepts one optional title pair with required base and candidate values. History,
conflict and workspace previews supply that pair. Typed title insertion returns a document directly,
so the component no longer casts it or supplies empty strings for missing halves. Rendered behavior,
styles and comparison layout remain unchanged.

Move all 20 comparison/highlight cases beside their service owners. Replace loose fixture shapes
with typed editor nodes; the formatting-noise case uses a supported text-alignment attribute.
Add review cases for a title-only change and a nested diagram-identity replacement, plus a mounted
component case showing the changed title pair without marking the unchanged body. Existing mounted
diff, conflict, history and editor coverage remains in place. Observed results belong in the PR.

This records presentation ownership within note history and conflict review. Approval, revision
concurrency and sync conflict resolution retain their separate workflow dispositions.
