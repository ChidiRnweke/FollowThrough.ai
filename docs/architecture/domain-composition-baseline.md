# Domain composition baseline

Baseline commit: `285bfa51`. Counts include non-test TypeScript and Svelte source lines, including
comments and blank lines. Each row uses the paths below. Rows overlap and must not be summed.
These are extraction boundaries, not a claim that all lines or files are duplicate implementations.

| Stage                             | Files | Lines |
| --------------------------------- | ----: | ----: |
| 2 — decisions and views           |     5 | 2,064 |
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
- `src/lib/client/workspace`
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
Four copied full-note declarations become three identity/title references and a project-entry
reference plus generic create/move outputs. No runtime business branches are removed in this slice.
