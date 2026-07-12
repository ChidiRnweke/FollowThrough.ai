# Backend Verification

This document maps the independent invariants in `domain-invariants.md` to executable evidence. A row is covered only when both the production path and a behavior or live Postgres contract enforce it.

## Architecture

| Boundary                                                           | Evidence                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared models are infrastructure-free                              | `src/lib/models`; import audit finds no service, repository, server, or Drizzle dependency.                                                                                                     |
| Services contain domain behavior behind capability contracts       | Domain folders under `src/lib/services`, each separating `contracts.ts` from management or transformation implementations.                                                                      |
| Controllers are domain nouns and orchestrate injected capabilities | Domain folders under `src/lib/controllers`; `ControllerFactory` exposes workspace, projects, notes, todos, relationships, references, diagrams, suggestions, skills, agent, and trust policies. |
| Repositories own SQL and map database rows to domain models        | Explicit ports under `src/lib/repositories` and Postgres adapters under `src/lib/server/repositories`.                                                                                          |
| Runtime composition is production-only                             | `src/lib/server/app-factory.ts` memoizes `createProductionFactory()`; no demo, stub, mock, or unimplemented factory is exported.                                                                |
| Transactions reach every injected Postgres adapter                 | `src/lib/server/db/transaction-context.ts` supplies an async-local contextual database and reuses the outer transaction for nested work.                                                        |

## Invariant coverage

| Invariant group                                                                                                      | Executable evidence                                                                                           | Status  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| Actor-owned projects; normalized, non-empty, case-insensitively unique active names                                  | `services/projects/management.spec.ts`, `controllers/projects/controller.spec.ts`, Postgres project contracts | Covered |
| Folder/note/skill filesystem kinds and folder content restrictions                                                   | `services/notes/management.spec.ts`, note-kind schema contract                                                | Covered |
| Parent ownership, folder-only parents, same-project moves, and cycle prevention                                      | Project service/controller behavior suites                                                                    | Covered |
| Stable sibling order, closed move gaps, and preserved subtrees                                                       | Project service/controller behavior suites                                                                    | Covered |
| Archived projects hide trees, notes, todos, suggestions, and enabled skills without deleting history                 | Project behaviors plus Postgres note, todo, suggestion, project, and skill adapter contracts                  | Covered |
| Actor isolation reports foreign project, note, todo, conversation, and search identities as missing                  | Controller behaviors and live Postgres repository contracts                                                   | Covered |
| Non-empty note titles; immutable project/kind/location during content saves                                          | `services/notes/management.spec.ts`                                                                           | Covered |
| Stale saves fail, no-op saves stay at one revision, meaningful saves create one immutable revision                   | Note service and note controller save behaviors                                                               | Covered |
| Anchors require current revisions, non-empty exact text, and valid offsets                                           | Note service anchor behaviors and source-anchor schema constraints                                            | Covered |
| Anchor repair updates only unambiguous quotes and leaves ambiguous anchors intact                                    | Note service repair behaviors                                                                                 | Covered |
| Save, revision, anchor repair, and indexing succeed or roll back together                                            | Note controller transaction behaviors and live transaction contracts                                          | Covered |
| Todos require actor-owned active projects, non-empty titles, and named waiting-on counterparties                     | `services/todos/management.spec.ts`                                                                           | Covered |
| Todo anchors and provenance are owned and project-consistent on create and update                                    | Todo service behaviors and repository isolation contracts                                                     | Covered |
| Completion timestamps, reopening, deletion, partial edits, and filters remain consistent                             | Todo service/controller behaviors and live status/list contracts                                              | Covered |
| Relationships connect distinct actor-owned notes in one project using the closed semantic label set                  | Relationship service behaviors and relationship-kind schema contract                                          | Covered |
| Duplicate relationship writes are idempotent and retain source/provenance links                                      | Relationship service behaviors and live Postgres idempotency contract                                         | Covered |
| Reference discovery can be empty, ranks authoritative sources first, and never auto-accepts                          | Reference controller/service and trust-policy behaviors                                                       | Covered |
| Persisted references retain actor-owned source anchors and provenance                                                | Reference service behaviors and live reference isolation contract                                             | Covered |
| Every AI artifact is proposed with provenance and selection anchors when applicable                                  | Promise, relationship, reference, diagram, skill, and agent controller behaviors                              | Covered |
| Suggestion terminal transitions are single-use; expiry blocks acceptance; only accepted artifacts revert             | Suggestion management and lifecycle controller behaviors                                                      | Covered |
| Artifact application/reversion and suggestion transitions are atomic and reversible                                  | Suggestion lifecycle controller behaviors and live nested/rollback transaction contracts                      | Covered |
| Auto-acceptance is pipeline-specific, thresholded, never applies to references, and retains AI provenance            | Trust-policy and promise-extraction behaviors                                                                 | Covered |
| Diagrams are actor/note scoped; Mermaid revisions cannot mutate draw.io; promotion retains its source                | Diagram service and controller behaviors                                                                      | Covered |
| Diagram searchable labels coexist with note chunks in project-scoped retrieval                                       | Retrieval indexing behaviors and live pgvector contracts                                                      | Covered |
| Skills are project documents selected by summary, loaded in full when relevant, and usage records context/provenance | Skill service, selector, and agent-context behaviors plus live skill-usage contract                           | Covered |
| Search chunks are deterministic, SHA-256 hashed, revision/model aware, and actor/project isolated                    | Retrieval service behaviors and live pgvector actor/project contracts                                         | Covered |
| Relationship reranking produces only generic relationship labels                                                     | Semantic retrieval and OpenAI relationship adapter behaviors                                                  | Covered |
| Agent context includes project, note, selection, retrieval, conversation history, and relevant skill instructions    | Agent controller and enriched-context behaviors                                                               | Covered |
| Conversations, prompts, assistant text, and tool lifecycle events persist chronologically and remain actor-owned     | Agent controller behaviors and live conversation contracts                                                    | Covered |
| Agent tools reuse the domain controllers and mutations remain suggestion-based                                       | Production composition and OpenAI agent adapter behaviors                                                     | Covered |
| External provider failures become typed domain errors without partially committed workflows                          | OpenAI adapter behaviors, controller rollback behaviors, and live transaction contracts                       | Covered |
| Nested transactions join the outer transaction; failed work commits no domain mutation                               | Live Postgres transaction-context contracts                                                                   | Covered |

## Test quality

- Test doubles are hand-written fakes under `src/lib/testing/fakes`; production code imports none of them.
- No `vi.mock`, `jest.mock`, spies, or mocking library calls exist in the test tree.
- The TypeScript AST audit finds exactly one `expect` call in every test case.
- Repository and migration contracts use the real pgvector Postgres Testcontainer, never SQLite.
