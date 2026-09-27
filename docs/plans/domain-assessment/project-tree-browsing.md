# Browsing and expanding project trees

W03.05 starts with active project and note records in the account workspace. The shell projection
filters archived projects and children and excludes skills from the ordinary note tree. ProjectTree
groups entries by project and parent, orders siblings by position and title, and passes each group to
the recursive view. Project links open their overview; note actions open workbench tabs, background
tabs or the split pane. Folder rows expand in place rather than navigating to a nonexistent folder page.

The project overview uses WorkspaceViews.project and the shared assembleProjectTree projection. The
server Projects.get uses the same assembler with owned project entries. The assembler preserves input
order and excludes skill documents. ProjectOverview keeps a separate in-page expanded set and recursively
renders only open folder children. Creation and movement enforce active same-project folder parents;
their locking and cycle rules remain in the existing creation and tree-transaction reviews.

## Active-note expansion

Sidebar projects default open and folders default closed. Browser storage records deviations from these
defaults, and the component restores that state before enabling transitions. Changing the active note
opens its project and ancestors. The reader can still collapse those ancestors afterward. Stored values
must be a string array; malformed JSON or a wrong shape fails rather than silently inventing a valid
preference. Storage errors remain visible failures and do not alter document data.

The ancestor walk stopped after 32 parents. A valid note under 35 folders therefore left its outer
folders closed and could not be found in the visible tree even though it was active. Creation has no
matching nesting limit. Replace the arbitrary stop with a visited-identity check. Walk all known
ancestors, retain a missing parent's known identity while metadata downloads, and report a repeated
identity as a corrupt parent cycle. The view also stopped rendering descendants at eight levels. Render every child while limiting
indentation to the former visual depth, so deeper labels keep usable width. These changes do not move
or reorder entries.

## Evidence and test disposition

The actual ProjectTree component with 35 nested folders reproduced the closed outer folder. Its browser
regression fails before the repair and passes after it. Additional mounted cases cover manual collapse,
restoring a saved collapsed project, persisting a folder expansion, and rendering the deep active note beyond the former eight-level cutoff. Pure cases cover a deeper valid
chain, a root entry, partial parent metadata and explicit cycle rejection. Retain the existing tree-view
open-note action and project creation/opening contracts; do not replace their storage assertions with
component-only checks.

Matched browser captures render the actual sidebar tree and styles with synthetic, production-valid
folder records. They show the active note's collapsed ancestry before and expanded ancestry after. These
are seeded component checks, not an authenticated database-backed navigation run. The temporary surface
fixture is restored before validation and commit.

W03.05 is assessed. Moving, reordering and drag/drop retain separate workflow entries.
