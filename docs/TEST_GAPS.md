# Test gap ledger

This working ledger records concrete, runnable tests discovered during the capability-first
refactor. Entries stay open until the named executable test exists and passes in its normal lane;
this file is not permission to replace tests with prose.

## Open application journeys

| Behavior to protect                                                                                                              | Test layer and intended file                        | Setup and observable assertion                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capability smoke path covers shell, Today, notes, todos, Agent, project overview/todos/memory/attachments, skills, and artifacts | Playwright, `tests/e2e/capabilities.e2e.ts`         | Start from deterministic seed data, derive entity IDs from rendered links, visit every capability, and assert its primary landmark/heading without browser errors. |
| Attachment content preserves its external redirect contract                                                                      | Playwright, `tests/e2e/capabilities.e2e.ts`         | Derive an attachment content link from project UI, request it without following redirects, and assert an external `302` location.                                  |
| Artifact library preserves filtering, grouping, pagination, downloads, links, and empty results                                  | Browser component, colocated with `ArtifactLibrary` | Render structural loader data, operate each visible control, and assert the corresponding group/page/link or empty state.                                          |
| Saved Drawio nodes retain preview, title, and resolved href after editor reload                                                  | Browser component, Edra/notes integration spec      | Load a saved opaque reference through `NoteEditor` and assert its visible title, injected preview, and resolved link.                                              |

## Open Edra boundary cases

| Behavior to protect                                                 | Test layer and intended file                                       | Setup and observable assertion                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mermaid conversion stores an opaque pending reference               | Browser component, Edra Mermaid extension spec                     | Invoke conversion and assert the node transaction contains only the returned opaque string.                                                         |
| Completed conversion notifies the product workspace for review      | Browser component, notes editor adapter spec                       | Resolve a pending conversion and assert the structural callback receives the opaque reference.                                                      |
| Dismissal clears the pending editor reference                       | Browser component, notes workspace spec                            | Dismiss review and assert the editor no longer exposes the reference.                                                                               |
| Acceptance inserts Drawio only after product-service success        | Browser component, notes workspace spec                            | Complete acceptance and assert one Drawio node appears with the opaque reference.                                                                   |
| Rejection clears pending state without insertion                    | Browser component, notes workspace spec                            | Reject through the workspace dialog and assert the document is otherwise unchanged.                                                                 |
| AI quick-action keyboard navigation scrolls the bound active option | Browser component, `components/edra/AI.svelte.spec.ts`             | Overflow the menu, send ArrowDown/ArrowUp, and assert active-button scrolling and Enter behavior without a document query.                          |
| Mermaid asset runtime handles concurrent callers and load failure   | Browser component, `components/edra/mermaid-script.svelte.spec.ts` | Request the runtime twice before load completes, assert both receive the browser API, then assert an asset error becomes the explicit load failure. |

## Open server-composition contracts

| Behavior to protect                                                              | Test layer and intended file                  | Setup and observable assertion                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Every capability factory wires its typed bundle from interface dependencies only | Node unit, colocated capability factory specs | Supply hand-written dependency fakes and assert the cohesive public bundle.                  |
| Suggestions finalization occurs only after dependent capabilities exist          | Node unit, suggestions factory spec           | Create the core bundle, call typed `finalize(...)`, and assert the finalized surface.        |
| Agent lifecycle resolves controllers lazily without placeholder mutation         | Node unit, agent factory spec                 | Resolve the lazy controller provider after composition and assert a usable lifecycle bundle. |

## Open coordinator boundary cases

| Behavior to protect                                                                                  | Test layer and intended file                                                          | Setup and observable assertion                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Chat composer preserves drafts, image limits, pasted images, mentions, modes, and focus registration | Browser component, `components/chat/workspace/chat-composer.svelte.spec.ts`           | Render explicit state callbacks, exercise one behavior per test, and assert visible composer state.     |
| Chat thread preserves edit/resubmit, copy, retry, approvals, tool detail, and suggestion decisions   | Browser component, `components/chat/workspace/chat-thread.svelte.spec.ts`             | Render structural entries, operate one visible turn control, and assert the resulting state or content. |
| Note dialogs preserve conflict resolution, export inputs, and Drawio acceptance ordering             | Browser component, `components/notes/workspace/note-workspace-dialogs.svelte.spec.ts` | Complete each visible dialog action and assert only its explicit callback after service success.        |
| Note header preserves responsive status/actions and the 44px split-close target                      | Browser component, `components/notes/workspace/note-workspace-header.svelte.spec.ts`  | Render narrow/wide states, operate controls, and assert callbacks plus non-overlapping layout.          |
| Pasted note media preserves checksum, object upload, finalization, and stable content URL            | Node unit, `components/notes/attachment-upload.spec.ts`                               | Use hand-written transport collaborators and assert the stable content URL and each error boundary.     |
| Project tree preserves expansion, inline edits, menus, moves, archive, and drag finalization         | Browser component, `components/projects/project-tree-view.svelte.spec.ts`             | Render deterministic rows, perform one interaction per test, and assert visible navigation/tree state.  |
| Input-group addons focus their owned input but preserve nested button activation                     | Browser component, `components/ui/input-group/input-group-addon.svelte.spec.ts`       | Click addon and nested button targets and assert focus changes only for the addon click.                |

## Open build, schema, and runner contracts

| Behavior to protect                                                             | Test layer and intended file                           | Setup and observable assertion                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Production client chunks remain below 500 kB without changing the warning limit | Build audit, `scripts/audit-build-output.ts`           | Read the generated manifest and fail for any emitted JavaScript chunk above 500 kB.                                      |
| Browser-full emits no application-owned `wrapDynamicImport` stack               | Minimal runner regression under `tests/browser-runner` | Run infrastructure-only and application fixtures separately and assert both exit cleanly with isolated generated output. |
| Schema registry exports and physical table names remain exact                   | Contract suite under `tests/integration/schema`        | Inspect the Drizzle registry and database metadata and assert the export set and physical names.                         |
| Workspace rollback stays atomic across capability repositories                  | Contract suite under `tests/integration/workspace`     | Fail a multi-repository operation and assert no partial rows persist.                                                    |

## Covered during this refactor

| Behavior protected                                                                          | Executable test                                                |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Chat composer focus requests are delivered on registration and released on unmount          | `src/lib/stores/shell/right-panel.spec.ts`                     |
| Command palette navigation reaches quick capture and quick todo                             | `tests/agent-workbench.e2e.ts`                                 |
| PWA offline fallback works and remote/API responses stay out of Cache Storage               | `tests/e2e/pwa.e2e.ts`                                         |
| Input, Tooltip, Separator, and SidebarSeparator forward actual native refs                  | `src/lib/components/ui/ref-contracts.svelte.spec.ts`           |
| Application composition rejects concrete construction and cyclic placeholder casts          | `scripts/audit-topology.ts`                                    |
| Repository behavior remains intact in capability suites using the shared PostgreSQL harness | `tests/integration/<capability>/repositories.contract.spec.ts` |
