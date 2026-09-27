# Cached notes after project archive

This is one part of W03.03, not a completed assessment of every child-resource path.
ADR 0009 requires a project archive to hide its content without individually archiving each child.
The server note repository joins the active project for ordinary reads, locking reads, search targets
and trash. The browser's normal note collection already filters by active project, but its individual
note projection did not check a known project archive. A direct cached open could therefore show an
editable note that the server no longer exposes.

WorkspaceViews.note now refuses a note whose known project is archived. The raw cached child remains
unchanged. A fresh NotePane displays an archived-project notice rather than an editor or an endless
loading skeleton. Project restoration makes the existing cached note eligible again. Missing project
metadata retains the separate existing missing-related-content behavior; this repair does not assert
that all workspace downloads arrive as one complete graph.

NotePane deliberately retains an already opened document after server deletion so the user can keep
unsaved work. Preserve that behavior after project archive too: do not unmount the editor and discard
its buffer when the projection disappears. Show an explicit archive warning above the retained pane.
This is a recovery surface, not an assertion that the archived project accepts server writes. Closing
and reopening the pane goes through the new archive guard. Editor buffers, draft identity and outbox
failures remain owned by the existing editor/session and synchronization code.

## Evidence and test disposition

The new archived-project projection regression failed before the guard and passes after it. Companion
cases keep the raw child intact and reopen it when the project is active. Keep the existing note and
list projection tests and SQL contracts for hidden normal/locking/search/trash reads; duplicating those
contracts would not validate the browser defect.

Seeded browser verification mounted the actual NotePane and NoteWorkspace with real WorkspaceResources
and an in-memory transport. A direct open showed the editor before the repair and a notice with zero
editable fields after it. A separate active-project scenario typed an unsaved sentence, delivered a
project archive through the transport and retained the same sentence and editor with the archive
warning. Captures record both cases. Temporary fixture/session substitutions were removed. This is
local browser evidence, not a live PostgreSQL or authenticated end-to-end archive journey.

W03.03 remains open. Diagram, attachment, artifact and other cached child surfaces need their own
caller and visibility review before the complete project archive workflow can be marked assessed.
