# Where domain behavior lives

Use this map to find the code and tests for a change. Paths in the table are relative to `src/lib/`.

| Change                                  | Code to inspect                                                                                                                                                                        | Existing regression coverage                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task fields or completion status        | `models/todos/index.ts`: `applyTodoEdit`; `server/services/todos/catalog.ts`: `create`, `change`, `update`                                                                             | `server/services/todos/catalog.spec.ts`                                                                                                              |
| Folder placement or sibling order       | `server/services/projects/catalog.ts`: `decideProjectEntryMove`; `models/notes/index.ts`: `decideNoteCreation`                                                                         | `server/services/projects/catalog.spec.ts`; `controllers/workspace/command-creation.spec.ts`                                                         |
| Archive or restore a note               | `models/notes/index.ts`: `decideNoteArchive`, `decideNoteRestore`; `stores/workspace/resources.svelte.ts`: `prepareCommand`                                                            | `server/controllers/notes/restore.spec.ts`; `controllers/workspace/command-trash.spec.ts`                                                            |
| Save a document or publish a snapshot   | `server/controllers/notes/controller.ts`: `save`, `publish`, `discardDraft`, `restoreRevision`; `server/services/notes/catalog.ts`: `save`, `record`                                   | `server/controllers/notes/save.spec.ts`; `server/controllers/notes/restore-revision.spec.ts`                                                         |
| Skill metadata or imported instructions | `server/controllers/skills/controller.ts`: `update`, `restoreVersion`; `server/services/skills/library.ts`: `prepareEdit`, `commitEdit`                                                | `server/controllers/skills/import-document.spec.ts`; `server/controllers/skills/restore-version.spec.ts`                                             |
| Trace a proposal back to selected text  | `server/services/notes/selection-origin.ts`: `resolve`, `record`; `server/services/suggestions/inbox.ts`: `selectionProposal`, `createProposalRecord`                                  | `server/controllers/todos/extract-promises.spec.ts`; `server/controllers/skills/create-from-selection.spec.ts`                                       |
| Accept or undo an agent proposal        | `server/controllers/suggestions/controller.ts`: `accept`, `revert`; `server/services/suggestions/effects.ts`: `record`, `restore`                                                      | `server/controllers/suggestions/lifecycle.spec.ts`; `server/services/suggestions/effects.spec.ts`                                                    |
| Finish or cancel a durable run          | Chat and note-action controllers; `server/services/agent/runs/note-action-requests.ts`; `server/services/agent/runs/settlement.ts`: `claim`, `complete`                                | `server/services/agent/runs/settlement.spec.ts`; `server/controllers/agent/lifecycle.spec.ts`; `tests/integration/agent/settlement.contract.spec.ts` |
| Change search indexing                  | `models/knowledge-search/index.ts`: `IndexPlan`; `server/services/knowledge-search/indexing.ts`: `ContentIndex`                                                                        | `server/services/knowledge-search/indexing.spec.ts`                                                                                                  |
| Process or retry an uploaded file       | `server/controllers/attachment-processing/controller.ts`: `run`, `process`; `server/services/attachments/extraction.ts`: `extract`                                                     | `server/controllers/attachment-processing/recovery.spec.ts`; `tests/integration/attachments/processing.contract.spec.ts`                             |
| Change exported content                 | `server/services/deliverables/export-preparation.ts`: `prepareExport`; `models/notes/index.ts`: `documentTextMarks`; format layout in `server/services/deliverables/docx.ts`, `pdf.ts` | `server/services/deliverables/docx.spec.ts`; `server/services/deliverables/pdf.spec.ts`                                                              |

## Note views

The Notes and Suggestions controllers assemble suggestion views from resolved context records.
The shared projection is `services/suggestions/presentation.ts`; producer labels come from
`services/provenance/presentation.ts`. `WorkspaceViews` uses those same presentation rules for
downloaded records. Keep record loading and missing-download reporting in the adapters.

Backlink and reference presentation also lives in shared services. Their server services read the
related records; Notes applies the same presentation rules that WorkspaceViews uses offline.
Note view assembly and revision tokens live in `services/notes/presentation.ts`.
Models are intended to retain values, types and schemas only.

`server/controllers/notes/view.spec.ts` compares server and downloaded views from the same records.

## Record types and wiring

- The owning record types are `Note` in `models/notes`, `Todo` in `models/todos`, `Diagram` in
  `models/diagrams`, and `Suggestion` in `models/suggestions`.
- Narrow service interfaces are in each service domain's `contracts.ts`. Consumers import those
  interfaces rather than declaring another copy of the contract.
- `server/factories/capabilities/` constructs services. `server/application.ts` supplies those
  instances to controllers. Add shared dependencies there rather than constructing a second service
  inside a controller.

For offline lifecycle failures, inspect `controllers/workspace/commands.ts`:
`workspaceCommandNeedsInventory` declares the required inventory. `prepareWorkspaceCommand` rejects
partial inventory when the command needs it. `stores/workspace/resources.svelte.ts` obtains that
inventory online and retains the draft when it is unavailable offline.

For replayed agent results, inspect `client/agent/runs/subscription.ts`. It reconnects from the last
successfully handled cursor. Chat and note-action handlers must finish their work before returning;
starting an unawaited promise there would acknowledge an event before applying it.

## Reviewed note changes

`PreparedNoteChange` owns the target, reviewed base, prepared content, and operation result.
`Notes.prepareChange` resolves the authoritative note and uses the editor conversion adapter.
`Notes.applyReviewedChange` checks that review against current state and coordinates the
existing save consequences. Patch matching remains a pure function in the notes domain.

Agent checkpoints carry the serialized domain review with the tool call identity. The agent
transport does not interpret note content. The tool boundary and client reader use the notes
schema to recover the same value. Preview rendering reads this value, not a newer cached note.
This preserves the self-contained model namespaces and the parsing boundary in ADR 0037.

## Project rules

Project controllers and downloaded workspace commands use `services/projects/details.ts` for
name and description normalization. Controllers apply `services/projects/presentation.ts` to
resolved entry records. ProjectCatalog owns move validation and sibling ordering against its real
repository. The project model contains values, types and schemas only.
