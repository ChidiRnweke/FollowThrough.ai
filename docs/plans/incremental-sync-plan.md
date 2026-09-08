# Incremental workspace synchronization

ADR 0040 records the accepted scheme. Worktree: `artifacts/worktrees/incremental-sync`.
Branch: `feat/incremental-sync`. Commit and push each completed, verified checkpoint.

## Acceptance contract

Initial warming downloads all current workspace records and metadata, including saved chats.
Later synchronization pulls the compact account journal since a durable cursor, applies explicit
tombstones, and downloads only changed bodies. The initial complete-inventory proposal is superseded.
Lists use local projections. Cached objects open immediately; known-updating objects wait online
and use their previous copy offline. Ordinary edits persist offline and reconcile using ADR 0010.
File bytes, history, generation, uploads, server search, and security operations remain on demand
or online. There are no guessed read windows, silent fallbacks, or automatic conflict merges.

## Execution checklist

- [x] Record the accepted design and implementation checklist.
- [x] Define and test pure cache transitions, journal application, and mutation lifecycle.
- [x] Implement the generic resource cache, in-memory fakes, IndexedDB cache, and account isolation.
- [ ] Add cross-tab coordination and durable mutation queue persistence.
- [x] Add database sync versions and a compact authenticated journal with commit-ordered account cursors.
- [x] Add typed object readers and expose synchronization through controller/remote boundaries.
- [x] Add atomic guarded mutation replay and durable idempotency receipts for the initial command set.
- [ ] Build shared normalized projections and migrate app routes to browser-shell loading.
- [ ] Wire offline mutations across supported domains and preserve legacy note/skill drafts.
- [x] Replace private page snapshots with a data-free service-worker app shell.
- [ ] Test database contracts, offline warming/reload/replay, and incremental payload transfer.
- [ ] Pass lint, check, architecture, unit, contracts, docs, and targeted PWA checks.
- [ ] Push final changes, open the PR, and resolve required checks.

## Implementation rules

Pure state rules belong in models, browser I/O in ordinary client modules, and server cross-domain work
in controllers with factory-provided capabilities. Parse external records at their boundaries.
Keep domain mutation rules in their existing services. One assertion per test and shared fakes.
Do not claim a checkpoint complete until its verification passes. Record blockers and remaining
integration explicitly. Do not delete the existing note outbox before migration is verified.

## Verified checkpoints

- `d6b24ef`: ADR and execution checklist.
- `757a77f`: 25 pure cache and mutation behavior tests; type check and architecture checks passed.
- `b7b5313`: 16 coordinator tests and 6 Chromium IndexedDB tests; lint, type check, and architecture checks passed.
- `f1de5c0`: database version registry and inventory; 12 PostgreSQL contracts passed. The inventory
  polling path is superseded by the compact journal.
- `32a6307`: conditional typed resource reads and the explicit foreground read barrier; 18 PostgreSQL
  contracts, 45 focused node tests, type check, scoped lint, and architecture checks passed.
- `f26ada5`: compact journal, account cursor, durable tombstones, and offline read-barrier release;
  48 focused node tests, 24 PostgreSQL contracts, and 7 browser persistence tests passed.
- `541d2d5`: shared controller/remote reads and versioned deletion ordering; 51 focused node tests,
  24 PostgreSQL contracts, and 7 browser persistence tests passed.
- `0e86091`: durable operation receipts; 29 PostgreSQL synchronization contracts passed.
- `e92797e`: stable IDs for projects, folders, notes, tasks, and skill notes; creation checks passed.

The initial guarded commands cover project create/rename/archive/numbering; folder creation and
note moves; note create/rename/save/archive/restore/publish/discard/delete/numbering; task
create/update/delete; and skill creation. Each owning controller supplies its existing operation
to the shared transaction service. Further ordinary operations and the browser queue remain to be
connected; this checkpoint does not claim complete offline mutation support.

The version metadata lives in one database registry keyed by resource type and a JSON tuple of
primary-key values. This avoids leaking database synchronization fields into existing domain
serialization. Source triggers cover all registered resources; journal metadata changes in the same
transaction. A per-account head lock prevents commit-order cursor gaps. Tombstones retain ownership
after cascading deletes. PostgreSQL and PGlite result formats are parsed at the repository boundary.
The read cache consumes only journal deltas; it persists each cursor with its invalidations and
tombstones, then downloads bodies. Offline transitions release waiting readers to their saved copy.
The helper is `client/sync/resource-cache.ts`, not an additional architectural layer.

The browser shell now initializes the shared account resource store. Note panes read through its
foreground barrier, and normalized shell/list/note projections have focused tests. Remaining page
server loaders and the old service worker still need replacement. The note editor now uses the shared
outbox, with legacy draft migration completed before exposing local writes.
This is an integration checkpoint, not completed offline support. Legacy drafts without synchronization ETags and interrupted sends are covered by migration and submission tests.

Further verified checkpoints:

- `44226c7`: atomic IndexedDB queue acknowledgement and authoritative cache persistence; 18 browser tests passed.
- `eebadff`: account writer lock, frozen retries, conflict isolation, and logout handling; 8 submission tests passed.
- `a012235`: shared workspace resource entry point and local overlays; browser and model tests passed.
- `54246c0`: explicit edit ancestry, competing-tab conflict protection, and removal of the superseded mutation model; 72 focused node tests and 11 browser tests passed.
- `75a9659`: normalized shell, task, and project projections and stopped-account error handling.
- `e263dd3`: validated bootstrap and server-set account hint; 30 focused configuration/startup tests passed.

The browser shell integration passes type, scoped lint, and architecture checks, 13 focused
bootstrap/view tests, and 5 browser resource-store tests. Full app/PWA validation remains pending.

Legacy migration foundation now retains unversioned base/local/remote copies, excludes unresolved
bases from submission, validates before sending, and imports with atomic durable markers while
keeping the source database. Startup now invokes this migration before exposing the shared outbox; the old writer has been deleted.
Validation: 42 focused node tests, 15 IndexedDB browser tests, 6 PostgreSQL mutation contracts,
type checking and architecture audits. The contract exposed and fixed numbering persistence in
guarded imported saves.

Shared conflict recovery now persists authoritative conflict bodies/tombstones atomically, exposes
keep-local and exact-set discard through the queue, and refuses to strand unreviewed descendants
or discard unknown submission outcomes. Verified with 40 business tests, 20 browser tests, type
checking, scoped ESLint and architecture audits. Feature conflict UI is still being integrated.

The note and skill document editors now use the shared durable outbox. They capture their observed
base, preserve later typing through acknowledgements, and expose shared conflicts. Browser startup
imports old drafts before loading the queue; workbench layout storage remains compatible with the
upgraded legacy database. Conflict UI shows explicit server deletion and retains the dialog on
failed resolution. Invalid queue input rolls back before it can corrupt persisted state.
Verification: 9 editor business tests, 2 full IndexedDB upgrade/editor tests, 22 focused browser
tests in the final batch (including upgrade tests), 23 earlier browser integration checks, type
checking, scoped ESLint and architecture audits. Other mutation call sites and offline navigation
through the remaining server page loaders still need integration.

Replacement cleanup checkpoints:

- `86fe41a`: Today and both task list routes render shared normalized projections.
- `2874ebf`: deleted the old note coordinator, transport, IndexedDB writer, inventory API, and their superseded tests. Historical storage survives only as the one-time migration source; workbench layout persistence is separate UI state.
- `280a0ad`: deleted the note sync store and its registry. Note and skill document editors use generic resource drafts, which capture an editor's observed base without owning a second cache. Verified with 11 business tests, 13 browser tests, lint, type checking, and architecture audits.

Task integration now removes the per-note todo cache, manual cross-pane fan-out, right-panel resource copy, chat title cache, task server page loader, and direct task read/write remotes. Shared projections supply lists, embedded tasks, and detail panels. Creates use stable IDs and the provisioned inbox; edits and deletes use the durable outbox. Rendered text fields retain their observed base and dirty input across background refreshes. Creation forms retain input until persistence succeeds. Verification includes 72 business tests, 14 draft/base tests (overlapping draft coverage), two PostgreSQL contracts, and nine task browser tests.

Still outstanding: remaining resource route loaders, project/note action mutations, other ordinary mutation domains, cross-tab refresh notifications, generic conflict review beyond documents, full app validation, full required gates, and PR checks. This remains an implementation checkpoint.

- `2bcbba0`: task details and mutations use shared resources; superseded task caches and direct read/write remotes are deleted.
- `621e6bb`: memory and attachment collections use normalized projections; private collection state, query refresh paths, and their server page loaders are deleted. Twelve projection tests, type checking, lint, and architecture audits passed.

The service worker now precaches a generated data-free SPA entry and public assets, deletes old page caches, and never caches private HTML, page data, or synchronization RPCs. The node adapter generates the fallback in the client output before copying it, so preview and production serve the same file. Install metadata lives in the HTML template and is available before client initialization. Synchronization RPCs use uncached commands; the shared resource cache owns coalescing and refresh.

Production validation against an isolated temporary PostgreSQL database passes all eight PWA tests: install metadata, service-worker registration, visited and unvisited cached note navigation offline, unknown-route fallback, offline task creation retained through reload and acknowledged on reconnect, and absence of private page/API snapshots. Type checking, formatting, scoped lint, and architecture audits also pass. This verifies the integrated note/task read and task write paths; remaining route and mutation integration is still outstanding.

- `381b8cf`: project overview, trash, diagram/artifact galleries, and skill catalog use shared projections; their server page loaders and private list mutation copies are deleted.
- `79f7be8`: project, note, and folder creation uses stable IDs and the shared outbox; project/note renaming captures the rendered version. Offline creation, reload, and reconnect keep the same URL identities.
- `bc056cd`: skill detail reads use the resource barrier and shared records; the server page snapshot is removed.

Settings now derives preferences, tool overrides, and trust policies from shared records. The bootstrap retains only deployment defaults and metadata, avoiding stale user overrides after deletion. The settings server loader and tool-preference query cache are removed. Verification: type checking, lint, architecture audits, focused preference tests, and all ten production PWA checks pass, including direct offline skill, trash, and settings navigation. Chat and diagram editor integration, remaining ordinary writes, and generic conflict review remain outstanding.

Acknowledgement ancestry now uses one exact applied receipt per account/resource, stored atomically with queue settlement. Late appends resolve that proof inside their own transaction; content equality adoption and its superseded tests are removed. Deleted outcomes retain later edits as conflicts, and explicit keep-local updates the mounted draft's operation identity. Sixty-two focused business tests, thirty-six browser tests, type checking, lint, and architecture audits validate this checkpoint.

Diagram editor integration removes its private save coordinator, query cache, and per-diagram description registry. Shared drafts and guarded commands now handle saves, renames, publication, revision restore, and conflict decisions. Diagram routes and pickers use shared reads. Canvas/export state remains editor state; an unchanged acknowledgement does not remount the editor. Four PostgreSQL contracts, nineteen focused editor/browser tests, type checking, and architecture audits pass. The external diagrams.net iframe still requires its own network load; this change caches app resources, not third-party editor assets.

Chat lists and transcripts now use shared conversation, message, and run records. The old session query, server loaders, and tool-specific query invalidation map are deleted. Cached approvals remain readable offline but cannot execute until a live run check succeeds; stale navigation responses cannot replace another chat. Malformed stored messages remain explicit unreadable entries. Validation: forty-seven browser tests, nine PostgreSQL object contracts, controller tests, type checking, architecture audits, lint, and eleven production PWA tests pass. Remaining work includes the shared write review UI and ordinary mutation integration.

Shared write review now exposes queued changes, rejections, and conflicts from the existing outbox. Reviews retain exact operation IDs and include dependent edits; new unreviewed descendants prevent discard. Creation conflicts require explicit recreation. Open editors retain discarded buffers with an error instead of a synced label. Five review browser tests, three durable draft tests, forty outbox business tests, type checking, architecture audits, and twelve production PWA tests pass. The isolated PWA setup is reproducible through `pnpm test:sync:pwa`; starting/result screenshots are under `docs/pr-evidence/incremental-sync/`.

Suggestion replacement removes the per-note tray cache, its registry, the global tray copy, and the synthesized view wrapper. Editors and the right panel read shared note projections; the remaining suggestion actions retain only busy/review IDs. Agent action completions and imports request shared synchronization. Unused note/trash/template/artifact query wrappers and workbench page-data invalidation are deleted. The editor's product context now belongs to the notes capability; closed diagram pickers mount only when requested. Validation: sixty-eight focused node tests, an additional note-scoping test, thirty-eight editor/conflict browser tests, type checking, architecture audits, and twelve production PWA tests pass.

Note publication and section numbering now enter the shared durable outbox. Pending publication covers earlier edits without fabricating a server revision; later edits remain unpublished. The direct remote commands are removed. Twenty mutation model tests, six PostgreSQL mutation contracts, type checking, architecture audits, scoped lint, and thirteen production PWA tests pass, including offline edit/publication through reload and reconnect.

Export dialogs now read shared export-setting records, and bulk export projects shared notes instead of retaining a private body cache. The obsolete read remotes are deleted. Optional record lookup distinguishes known absence, tombstones, failed reads, and bodies not yet downloaded; defaults are available only for proven absence/deletion. Fourteen browser resource tests, type checking, architecture audits, and scoped lint pass. Export generation remains an online server operation; settings mutation replay remains outstanding.

Returning to the app now reloads the shared IndexedDB records and outbox even offline. Cache reload merges version knowledge without regressing it; overlapping queue reloads cannot publish an older snapshot. Thirty-nine cache/queue tests, seventeen browser resource/draft tests, type checking, architecture audits, scoped lint, and fourteen production PWA tests pass, including two offline tabs. Updates are read on focus, visibility, navigation, and normal synchronization; there is no background cross-tab polling loop.

Note archive and restore now use shared guarded writes and local trash projections. Restore checks the parent through the shared optional read and reproduces the project-root placement rule for a missing or trashed parent. The old archive/restore remotes are removed, and the note toolbar accepts locally saved pending edits. Twenty-six mutation model tests, eight PostgreSQL contracts, type checking, architecture audits, scoped lint, and fifteen production PWA tests pass. The full unit run found one older creation-conflict fixture that needs to reflect the explicit-recreation policy; that suite is not yet green.

Diagram archive, restore, and permanent deletion now use one shared feature action over resource drafts in the gallery, project view, and trash. The direct remotes and mutable reference-count query are removed. Diagram references use pure note traversal over shared records. Archive confirmation waits for IndexedDB persistence before closing; the production test exposed and fixed an immediate-reload race. Three reference traversal tests, eleven trash browser tests, type checking, architecture audits, scoped lint, and sixteen production PWA tests pass. Actual offline gallery/trash captures are committed with the other PR evidence.

Broad validation before this diagram checkpoint: 3,266 unit tests, 473 full browser tests, 162 PostgreSQL contracts, full lint, and documentation checking pass. These results include the corrected durable creation-conflict coverage. Further ordinary mutation integration and removal of the agent-context count query remain outstanding; this is not final acceptance.

The agent context bar now projects counts from shared records and labels incomplete counts as unavailable instead of zero. Its obsolete count query is deleted, along with unused skill form endpoints and their parsing helpers. Twenty-four projection tests, sixty-one agent browser tests, type checking, architecture audits, and scoped lint pass.

Memory creation, edits, sharing changes, and deletion now use stable identities and the shared durable queue. The direct memory mutation remotes are removed. Sixty-seven focused business tests, three PostgreSQL contracts, type checking, architecture audits, and seventeen production PWA tests pass. The offline memory flow creates, edits, deletes, and reloads without a connection. Delete confirmation waits for local persistence.

Revision-history indexes now use fresh on-demand commands instead of a second mutable query cache. Diagram history cancels obsolete requests and reports offline unavailability. Artifact staleness remains unknown when a required source note is unavailable. Twenty-five projection tests, twenty diagram browser tests, type checking, architecture audits, and scoped lint pass.

Skill descriptions, names, and enable/disable changes now use metadata resource drafts and version-guarded queue commands. The three direct mutation endpoints are removed. The skill editor waits for both metadata and text persistence before reporting a device save, and it preserves later typing during retry. Sixty-five business tests, two PostgreSQL contracts, type checking, architecture audits, scoped lint, and eighteen production PWA tests pass. The new PWA flow retains offline description and instruction edits through reload and observes two applied acknowledgements on reconnect. Compound skill creation/import remains outstanding.

Search results are now live projections of shared records, including queued text edits. The private result cache and direct search/replace remotes are removed. Bulk replacement captures each matching note base before writing through shared drafts. Partial downloads are explicit, and replacement waits for the current query. Twenty-eight search business tests, thirteen search browser tests, type checking, architecture audits, scoped lint, and nineteen production PWA tests pass. The new offline flow finds pending local text, replaces it, and retains the replacement through reload.

Export defaults now use shared optional-resource drafts and guarded queue writes; the direct update endpoint is deleted. Initial values are writable only after proven absence or deletion, and concurrent override creation conflicts. Export dialogs ignore obsolete settings loads. The repository rejects cross-account project writes. Nineteen shared-resource browser tests, forty-five business tests, seven export browser tests, three PostgreSQL contracts, type checking, architecture audits, scoped lint, and twenty production PWA tests pass. The new offline flow creates project export defaults, reloads them, and observes an applied acknowledgement on reconnect.

Document, model, and agent preference forms now use account-scoped optional drafts and guarded outbox writes. Their remote forms and hidden-input serialization are removed. Shared pure preference-update logic gives client and server the same omitted/clear/set semantics. Forms retain their observed base and entered values during background refresh. Twenty-six focused business tests, four PostgreSQL contracts, type checking, architecture audits, scoped lint, and twenty-two production PWA tests pass. The new PWA flows retain document defaults through reload and model/agent edits across offline tab navigation, then observe server acknowledgements.
