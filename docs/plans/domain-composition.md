# Domain composition implementation checklist

## Remaining work

- [x] Generic aggregate participants: PR #44 merged; required CI checks passed.
- [x] Shared placement, lifecycle and task decisions and incomplete-inventory checks: PR #47; required CI checks passed.
- [x] Shared skill document writes and import drafts: PR #48; required CI checks passed.
- [ ] Resolve selection origins once in the reference, relationship, task and skill controllers.
- [ ] Persist proposal application effects and reverse them under version checks; refuse legacy undo.
- [ ] Share agent/workflow settlement and browser event consumption; test cancellation races.
- [ ] Share indexing plans; recover queued attachment work with PostgreSQL advisory claims.
- [ ] Share export preparation and replace the named-entity decoder with `entities`.

Each item needs its own PR with the deleted implementations and observed verification results.
Before marking a stage complete, run its focused tests and the lint, type, architecture, unit,
PostgreSQL contract and docs checks. Command, storage and editor changes also require the production
sync/PWA suite. Capture matched screenshots for skill-history and undo UI changes.

Required behavior checks:

- Browser and server callers produce equivalent decisions from equivalent facts.
- Partial inventory cannot prove a missing parent or empty folder.
- Domain writes and sync proofs commit or roll back together.
- Skill metadata-only edits leave history untouched; concurrent document edits conflict.
- Imports stay drafts; publication creates snapshots; restoration preserves attachments and links.
- Proposal undo reverses all recorded effects atomically and refuses stale or legacy effects.
- Cancellation and settlement races produce one terminal outcome and its required events.
- Restarted attachment workers resume queued work; competing workers cannot publish conflicting results.
- Shared projections and exports preserve displayed records, content and asset availability.

## Baseline measurements

Baseline commit: `285bfa51`. Counts include non-test TypeScript and Svelte source lines, including
comments and blank lines. Each row uses the paths below. Rows overlap and must not be summed.
These are extraction boundaries, not a claim that all lines or files are duplicate implementations.

| Stage                             | Files | Lines |
| --------------------------------- | ----: | ----: |
| 2 — decisions and views           |    20 | 3,575 |
| 3 — skill documents and revisions |     4 | 1,328 |
| 4 — origins                       |     4 |   654 |
| 5 — proposal application and undo |     6 | 1,236 |
| 6 — execution and consumption     |    21 | 4,763 |
| 7 — indexing and recovery         |     9 | 1,884 |
| 8 — exports                       |     8 | 2,202 |

## Counted paths

### 2 — decisions and views

- `src/lib/models/workspace-mutations/index.ts`
- `src/lib/models/workspace-views/index.ts`
- `src/lib/client/sync`
- `src/lib/server/services/projects/catalog.ts`
- `src/lib/server/services/todos/catalog.ts`
- `src/lib/server/services/notes/catalog.ts`

### 3 — skill documents and revisions

- `src/lib/server/services/skills/library.ts`
- `src/lib/server/controllers/skills`
- `src/lib/server/services/notes/catalog.ts`
- `src/lib/server/services/diagrams/drawio.ts`

### 4 — origins

- `src/lib/server/controllers/references`
- `src/lib/server/controllers/relationships`
- `src/lib/server/controllers/todos`
- `src/lib/server/controllers/skills`

### 5 — proposal application and undo

- `src/lib/server/controllers/suggestions`
- `src/lib/server/services/suggestions`
- `src/lib/models/suggestions/index.ts`

### 6 — execution and consumption

- `src/lib/server/services/agent/runs`
- `src/lib/client/agent/runs`
- `src/lib/stores/agent`

### 7 — indexing and recovery

- `src/lib/server/services/knowledge-search/indexing.ts`
- `src/lib/server/services/attachments`
- `src/lib/server/controllers/attachments`

### 8 — exports

- `src/lib/server/services/deliverables`

## Independent implementations to remove

- Workspace decisions and views: browser command preparation plus authoritative service decisions;
  browser view assembly plus service/controller assembly. Count each migrated rule in its PR.
- Skill documents: `SkillLibrary` and `NoteCatalog` both write documents and revision history.
- Origins: reference, relationship, promise extraction and skill selection paths establish origins.
- Proposal undo: current artifact-based reversal needs durable application effects before replacement.
- Execution: agent and workflow terminal sequences and chat/note event consumers need shared machinery.
- Indexing: four `Embedded*Indexer` wrappers prepare inputs for the existing shared `applyIndex`.
- Exports: DOCX and PDF each prepare document output; their format layouts remain separate.

The first contract extraction removes 67 duplicate implementation-exported `Pick` aliases and one
selection-anchor interface. `BuiltInSkillProvisioner` remains local because the built-in library
uses it internally; importing a service contract there would violate the existing import audit.
Six copied full-note declarations become identity/title references, project-entry references and
generic document participants. Note and workspace aggregates accept their foreign record types.
Proposal results accept the owning suggestion type, removing five duplicated proposal envelopes and
their unrelated payload copies. No runtime business branches are removed in this stage.
