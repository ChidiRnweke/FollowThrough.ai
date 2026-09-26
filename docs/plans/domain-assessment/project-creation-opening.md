# Project creation, opening and folder creation

## Callers and local results

W03.01 begins with the sidebar's New project action and the project-tree name dialog. ProjectActions
creates a stable UUID and stages createProject through the account's WorkspaceResources. Shared project
detail preparation trims the name and rejects an empty result. A successful stage adds an ordinary
workspace project to the shared projection and navigates to its stable project URL. Failed staging
returns the store's explicit failure and keeps the typed name in the dialog. Later synchronization
conflicts remain visible through the shared outbox/review state rather than inventing a second project.

Project listing uses the active account's local records and omits archived projects. The route parses
the ID, opens the resource, distinguishes missing/deleted/offline/failed access, and prepares inventory
before rendering. WorkspaceViews constructs the project tree from active notes in that project and
omits skill documents. The project page renders that view through PageShell and its entry components.
The account-scoped record store supplies isolation here; WorkspaceViews is a pure projection, not an
authentication boundary. Server list/get remain actor-scoped independently.

W03.04 uses the selected project and optional folder from the tree or project-page creation dialog.
ProjectActions opens the project and requires complete inventory before assigning a sibling position.
prepareWorkspaceCommand and the server use the same note-creation decision. Names must be nonempty,
the destination must be an active project, and a supplied parent must be an active folder in that
project. A folder has an empty document and text, a stable ID and a resolved parent/position. A locally
created project and parent folder can be referenced by later local creations; resource dependencies
order those outbox writes. The result immediately joins the same tree projection used when reopening.

## Server and storage

The Projects controller prepares project details and delegates one insert to ProjectCatalog and
ProjectRecords. PostgreSQL enforces case-insensitive active-name uniqueness per actor and translates
that conflict into a domain result. Another actor can reuse the name; an archived name can be reused
with a distinct project identity. The default role is workspace, so naming an ordinary project Inbox
does not replace the actual Inbox role.

Server get joins an active owned project with its owned entries, then uses the shared tree assembler.
An archived or foreign project is not opened. Folder creation owns a transaction, locks the active
project before reading parent/sibling facts, resolves the shared creation decision and inserts the note
record. The [tree transaction review](project-tree-transactions.md) records the concurrency races and
lock order. Those locks remain justified; this review does not add a second placement algorithm.

## Test disposition and limits

Replace the project controller's InMemoryProjects service double with real ProjectCatalog and the
existing repository fake. Retain ownership, naming, ordering and move-refusal assertions. Keep the real
folder-controller tests for note-parent refusal, archived sibling positions and nested empty folders.
Keep shared route-access tests that distinguish 404, 410 and 503, partial-inventory refusal, local
resource creation/outbox tests, and the SQL tree races. No test asserts a deleted method or file shape.

Add six SQL cases for normalized creation/reopening, active owner-only listing, case-insensitive name
conflict, archived-name reuse with a new identity, foreign-project refusal and persisted nested folders.
Add two command-to-view cases for opening a new local project and nested local folders before server
acknowledgment. The SQL cases exercise actual database predicates and indexes, not just their declared
shape. Local PostgreSQL is unavailable; these contracts run in CI.

W03.01 and W03.04 are assessed. This does not complete project archival across every child surface,
expanded-state persistence, drag/drop, or move/reorder interaction review. The production behavior and
visible controls are unchanged by this test and source review.
