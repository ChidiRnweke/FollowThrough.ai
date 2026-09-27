# Unit test audit

## Decision rule

Review one product capability at a time. Start with its accepted ADRs and maintained product docs, then check current code and merged PR history for behavior the docs do not explain. Keep a test only when it protects a distinct feature rule or a distinct failure boundary. A service rule, a PostgreSQL query, and a rendered workflow can each need a test for the same user guarantee; two tests of the same fake do not.

For each capability, record the baseline, retained guarantees, removals, replacements, and uncovered behavior in its PR. Replace missing protection before deleting a test that was the only apparent guard. Do not treat line coverage or a target test count as a deletion criterion. Run the affected specs, `pnpm lint`, `pnpm check`, `pnpm test:architecture`, and `pnpm test:unit`; run contracts and browser workflows when the affected guarantee crosses those boundaries. Work in a task worktree and land one capability per PR.

## Todos pilot

The 25 Todos unit spec files in `src/lib/{client,components,services,server/services,server/controllers}/todos/` had 159 test declarations before this audit and have 144 after it. The source of truth is the [Todos subsystem](../src/content/docs/subsystems/todos/index.mdx), [user guide](../src/content/docs/using/todos/index.mdx), and ADRs [0003](../src/content/docs/decisions/0003-require-approval-before-agent-proposed-changes-become-saved-data.md), [0008](../src/content/docs/decisions/0008-scope-notes-tasks-files-memory-diagrams-and-search-to-projects.md), [0013](../src/content/docs/decisions/0013-let-users-name-their-own-task-categories.md), and [0041](../src/content/docs/decisions/0041-share-domain-decisions-between-browser-and-server.md).

| Guarantee or boundary                                                                                                                         | Retained unit spec files                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Edits keep unrelated fields, normalize category and title, and keep completion and responsibility states coherent in offline and server paths | `services/todos/edits`, `server/controllers/todos/complete-edit`, `edit-rules`, `controller`, `create`                                         |
| Direct and batch creation keep task identity, project scope, and receipt semantics                                                            | `server/controllers/todos/create`, `create-batch`; `server/services/todos/batch-receipts`, `catalog`                                           |
| Extraction creates reviewable, ordered proposals with provenance; trust, cancellation, retries, and publication remain atomic                 | `server/services/todos/promise-rules`, `promise-discovery`; `server/controllers/todos/extract-promises`, `durable-promises`                    |
| Linked and origin notes remain distinct in task views                                                                                         | `services/todos/presentation`; `server/controllers/todos/view`, `edit-rules`                                                                   |
| Board and list show, filter, sort, and move tasks as described to users                                                                       | `client/todos/list-filter`, `local-date`, `return-url`; `components/todos/kanban-board.svelte`, `todo-card.svelte`, `todo-filter`, `todo-sort` |
| Screenshots become linked attachments and readable Markdown; failures leave the task unchanged                                                | `components/todos/screenshot-upload`, `screenshot-markdown`                                                                                    |
| Board PDF includes the correct tasks and readable metadata                                                                                    | `services/todos/board-export`; `server/controllers/todos/board-export`                                                                         |

PostgreSQL contracts remain the authority for actor and project list filtering, category listing, and deleted-row visibility. This pilot adds three repository contract cases for list isolation that the previous controller tests exercised only through `InMemoryTodos`.

### Decisions made

| Removed or replaced test                                 | Reason and retained protection                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Controller category listing                              | Sorting and deduplication came from `InMemoryTodos`; the PostgreSQL repository contract already checks both and actor isolation. |
| Controller completion and reopening pair                 | Shared edit tests and controller tests wired to the real catalog cover the same transitions.                                     |
| Controller project, actor, and deleted list filters      | The fake implemented all three filters. New PostgreSQL contracts exercise the real query instead.                                |
| Controller detail returns an ID and foreign detail fails | The former checked only an ID; real repository identity isolation and the task-view tests cover the meaningful guarantees.       |
| Extraction suggestion count                              | The adjacent ordered-title assertion already requires exactly the two resulting suggestions.                                     |
| Title filter returns the same array object               | Empty-query output is tested separately; array identity is not part of the user contract.                                        |
| Empty clipboard returns an empty array                   | This restated `Array.from(files ?? [])`; accepted-image and rejected-file cases remain.                                          |
| Card contains no three invented placeholder phrases      | Those phrases never appear in the component. The replacement checks that an unset card renders no badges.                        |
| Extraction creates one todo when trusted                 | The accepted-status test already dereferences the created todo and verifies its ID matches the accepted proposal.                |
| Extraction returns the fake's proposal list              | Comparing the result to the fake's internal list adds no independent acceptance or persistence guarantee.                        |
| Empty project export uses its project name               | The project export filename test already covers resolution to a real project name; the PDF bytes test covers empty board output. |
| Screenshot insertion clamps an out-of-range caret        | The only caller uses textarea selection positions or the current text length; neither can exceed the current text length.        |

### Open findings

- The user guide says an extraction with no candidates creates no anchor or suggestion. The current controller records an origin before iterating candidates, and no empty-result test exists. Confirm the stored outcome, then fix the behavior and add a test in a separate PR; do not weaken the documented guarantee to make this audit pass.
- The user guide calls the title filter URL-shareable, while the workspace keeps the title query in local state. Resolve the product intent before changing either tests or docs.
- The guide also describes Enter-to-create on the board, a three-click sort cycle, and overdue styling. Existing unit specs mainly cover lower-level callbacks and comparators. Add browser-level coverage where these workflows are not already exercised by end-to-end tests.

## Remaining capabilities

After review of the Todos pilot, rank the remaining capabilities by test volume and runtime. Apply the same decision rule and PR evidence format, starting with the largest service/controller clusters. Keep existing integration and end-to-end suites unless replacing a weak unit test requires a stronger verification boundary. The campaign is complete when each unit-test capability has an invariant map and every deletion has a recorded reason.
