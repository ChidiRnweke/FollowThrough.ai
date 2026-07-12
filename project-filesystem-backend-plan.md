# Blueprint: Project Filesystem Backend

## Executor Instructions

1. Read this file before every implementation loop; it is the backend source of truth.
2. Copy the unchecked steps into your scratchpad and execute the first unchecked step only.
3. Validate the step against the current tree before editing because the UI is being developed concurrently.
4. Do not edit Svelte components, page markup, or UI stores. Shared models and controller contracts are in scope.
5. Preserve the dirty worktree. Do not commit unless the user explicitly asks for commits.
6. Use hand-rolled fakes only. Tests describe behavior, have one primary assertion, and never assert calls or call counts.
7. Keep models infrastructure-free, business rules in services, orchestration in controllers, persistence in repositories, and wiring in factories.
8. OAuth, hosting, deployment, and Docker installation are owned by the user and remain out of scope.
9. When Docker is unavailable, mark database verification as externally blocked and continue with non-Docker work.
10. Update this blueprint after every completed step so it survives context compaction.

## Current Status — 12 July 2026

The project/filesystem foundation and every non-database workflow described by the original blueprint are implemented. The stable frontend seam is `ControllerFactory`; production and demo factories expose domain nouns only. Use cases are methods on those controllers—for example `notes().save`, `todos().extractPromises`, `diagrams().promote`, and `agent().listSessions`—rather than imperative controller objects. The backend suite has 172 behavior tests across 26 files. `pnpm check` passes.

The remaining architectural work is narrower than the original plan implied. Global database access has been removed: production composition injects Drizzle from `src/lib/server/production-factory.ts`. Projects, users, notes/anchors, search, and conversations have explicit Postgres repository adapters. Todos, automation, knowledge, diagram, and skill classes still combine domain rules with constructor-injected Drizzle, so they must be split into pure services plus narrow repositories. Docker-backed contracts are now enabled and green.

## Context

FollowThrough is a personal architecture workbench organized by projects, not a rigid client/engagement/system taxonomy. A project owns an arbitrarily deep filesystem of folders, notes, and skill documents. Notes can produce todos, diagrams, references, semantic relationships, suggestions, and agent context without leaking database rows into shared types.

Projects and their tiered filesystems are the only organizational taxonomy. There is no entity model, entity controller, entity UI, or entity persistence. Todos use free-text `waitingOn`; semantic relationships connect notes directly.

## Scope

**In scope:**

- Project roots and arbitrarily nested folder/note/skill entries.
- Stable sibling order, safe moves, cycle prevention, ownership, and project isolation.
- Project-scoped notes, todos, diagrams, references, retrieval, skills, suggestions, and agent context.
- Pure TypeScript models shared by frontend and backend.
- Domain services, orchestration controllers, repository ports/adapters, dependency-injection factories, and behavioral tests.
- Deterministic and OpenAI-backed promise extraction, web references, embeddings, relationship classification, and agent execution.
- Conversation/message/tool persistence and skill-usage recording.

**Out of scope:**

- Svelte UI implementation or visual review.
- OAuth2, identity-provider integration, and hosting.
- Installing or configuring Docker Desktop/WSL integration.
- Draw.io browser embed UI.

## Architecture Decisions

- `Project` is the aggregate root. Every active filesystem entry belongs to exactly one actor-owned project.
- `Note.kind` is `folder | note | skill`; `Note.parentId` is the recursive edge and `position` is stable sibling order.
- Folders cannot contain authored document content. Skills are ordinary project documents selected by summary and loaded in full only when relevant.
- Todos store `projectId` and free-text `waitingOn`; they do not require a global counterparty record.
- Models under `src/lib/models` never import Drizzle or server modules.
- Service interfaces are capability-shaped and use only domain models. Services may depend on repository ports, never concrete Postgres adapters.
- Controllers orchestrate services and transaction runners without business rules or database imports.
- Postgres adapters accept an injected `Database`; only `src/lib/server/production-factory.ts` imports the global `db` composition root.
- External clients sit behind narrow ports and have deterministic or in-memory substitutes.
- Repository integration uses Postgres Testcontainers, never SQLite. Unit tests use stateful hand-rolled fakes.

## Stable Interfaces and Models

- Shared roots and tree: `Project`, `ProjectId`, `ProjectTreeNode`, `Note`, `NoteKind`, `CreateProjectInput`, `CreateFolderInput`, `MoveProjectEntryInput` in `src/lib/models`.
- Project capabilities: `ProjectCreator`, `ProjectReader`, `ProjectLister`, `ProjectEditor`, `ProjectTreeReader`, `FolderCreator`, `ProjectEntryMover` in `src/lib/services/projects.ts`.
- Repository ports: one explicit domain file per port under `src/lib/repositories`, including `projects`, `notes`, `todos`, `source-anchors`, `suggestions`, `relationships`, `references`, `diagrams`, `skills`, `conversations`, and `retrieval-index`. There are no `content`, `automation`, or `knowledge` repository buckets.
- Stable controller seam: `workspace()`, `projects()`, `notes()`, `todos()`, `relationships()`, `references()`, `diagrams()`, `suggestions()`, `skills()`, `agent()`, and `trustPolicies()` in `src/lib/factories/controller-factory.ts`.
- Production composition: `createProductionFactory()` in `src/lib/server/production-factory.ts`.
- Test conventions: fixtures in `src/lib/testing/fixtures` and shared fakes in `src/lib/testing/fakes`.

## Completed Plan

- [x] **1. Specify domain invariants**
      **Evidence:** `docs/domain-invariants.md` covers project/tree, note/revision/anchor, todo, suggestion, retrieval, agent, and transaction behavior.
      **Verified by:** behavior-named tests and QA audit rules.

- [x] **2. Define shared project/filesystem models**
      **Evidence:** `src/lib/models/shared.ts`, `domain.ts`, `views.ts`, and `workflows.ts` define project IDs, project roots, folder/note/skill entries, positions, project-scoped todos, conversation events, and workflow I/O.
      **Verified by:** `pnpm check`.

- [x] **3. Define service, repository, controller, and factory contracts**
      **Evidence:** `src/lib/services`, `src/lib/repositories`, `src/lib/controllers`, and `src/lib/factories` use domain-oriented files rather than a single index implementation.
      **Verified by:** strict TypeScript and production factory construction.

- [x] **4. Implement project controller and shared factory seam**
      **Evidence:** `src/lib/controllers/projects.ts`, `src/lib/factories/controller-factory.ts`, `demo-controller-factory.ts`, and `production-controller-factory.ts`.
      **Verified by:** `src/lib/controllers/projects.spec.ts` and demo factory tests.

- [x] **5. Implement project domain service and Postgres repository**
      **Evidence:** `ProjectManagementService` in `src/lib/services/project-management.ts`; `PostgresProjectRepository` in `src/lib/server/repositories/postgres-projects.ts`; production wiring in `src/lib/server/production-factory.ts`.
      **Verified by:** `src/lib/services/project-management.spec.ts` and project controller tests.

- [x] **6. Add project-scoped schema and migrations**
      **Evidence:** `src/lib/server/db/schema.ts`, `drizzle/0002_wooden_blockbuster.sql`, `drizzle/0003_flawless_lester.sql`, and Drizzle snapshots. Migrations backfill Inbox projects before making project FKs non-null and add the pgvector HNSW index.
      **Verified by:** schema type-check and migration inspection. Runtime database verification is tracked in remaining step 16.

- [x] **7. Replace red scaffolds with executable behavioral suites**
      **Evidence:** shared fakes under `src/lib/testing/fakes`; focused controller/service/domain specs; obsolete unimplemented-proxy specs removed; only the real schema contract remains in the `contracts` project.
      **Verified by:** `pnpm exec vitest run --project server` — 155 backend tests pass.

- [x] **8. Implement transactional workflows and ownership checks**
      **Evidence:** Extract Promises, Relate, Reference, diagram generation, note saving, and suggestion lifecycle controllers use injected transaction runners. Concrete capabilities validate actor/project ownership before writes.
      **Verified by:** controller rollback, isolation, lifecycle, and ownership specs.

- [x] **9. Implement note and diagram indexing plus project retrieval**
      **Evidence:** `src/lib/services/search-indexing.ts`, `semantic-retrieval.ts`, `src/lib/server/repositories/postgres-search.ts`, and embedding adapters. Note and diagram chunks are isolated, SHA-256 hashed, reusable, and project-scoped.
      **Verified by:** search indexing and semantic retrieval specs.

- [x] **10. Implement structured external clients and relationship reranking**
      **Evidence:** OpenAI promise, reference, embedding, relationship, and agent adapters in `src/lib/server/domain/openai-*-capabilities.ts`; deterministic fallbacks remain available without API keys.
      **Verified by:** client fake specs for mapping, no-output, and typed failure behavior.

- [x] **11. Persist and ground agent runs**
      **Evidence:** `PersistentConversationJournal`, `PostgresConversationRepository`, `EnrichedAgentContextBuilder`, `KeywordRelevantSkillSelector`, and `DefaultRunAgentController` persist prompts/responses/tool activity and inject project retrieval, history, and selected skill instructions.
      **Verified by:** conversation, grounding, skill-selection, and OpenAI agent specs.

- [x] **12. Remove global database coupling and database-aware artifact orchestration**
      **Evidence:** concrete capabilities receive `Database` by constructor; `PersistentSuggestionArtifactApplier` depends on typed creator/deleter capabilities rather than Drizzle; only the production composition root imports `db`.
      **Verified by:** import audit, `pnpm check`, backend tests, and production build.

- [x] **12a. Enforce active project-tree lifecycle and naming semantics**
      **Evidence:** `ProjectManagementService` rejects archived projects for project-tree reads/mutations; `PostgresProjectRepository` filters archived roots, maps rename conflicts, and uses a partial active-name unique index generated in `drizzle/0004_huge_groot.sql`. Filtering archived-project notes and todos from their independent active-work queries remains part of steps 13 and 15.
      **Verified by:** project service behaviors for hidden archived trees, archived-name reuse, and conflicting renames; schema contract for the partial index.

- [x] **12b. Complete model-aware indexing and production agent tool events**
      **Evidence:** embedding clients expose their model identity and indexers reuse vectors only for the same model; `AgentToolEventMapper` maps Agents SDK `tool_called`/`tool_output` items into journaled domain lifecycle events.
      **Verified by:** search-indexing and OpenAI-agent adapter tests.

- [x] **12c. Correct controller and repository taxonomy**
      **Evidence:** imperative controller files and contracts were removed. Orchestration now lives in noun controllers under `src/lib/controllers`; routes, demo wiring, production wiring, and the agent toolbox all call their methods. Repository ports were split into explicit domain files, with `SourceAnchorRepository`, `NoteRelationshipRepository`, and `RetrievalIndexRepository` replacing ambiguous names. `AgentController` exposes `run`, `listSessions`, and `getSession`.
      **Verified by:** strict TypeScript, the complete controller behavior suite, demo-factory tests, and import/name audits.

## Remaining Plan

- [ ] **13. Split todo persistence from todo domain rules**
      **Files:** `src/lib/repositories/todos.ts`; `src/lib/server/repositories/postgres-todos.ts` (create); `src/lib/services/todo-management.ts` (create); `src/lib/server/domain/content-capabilities.ts` (remove after callers migrate); `src/lib/server/production-factory.ts` (modify).
      **What:** Align repository methods with current project-scoped models. Move all Drizzle queries into `PostgresUserRepository`, `PostgresNoteRepository`, and `PostgresTodoRepository`. Move title/revision/folder/anchor/todo transition/ownership rules into pure `NoteManagementService` and `TodoManagementService`. Keep existing service interfaces and controller signatures unchanged. Use `ProjectManagementService` plus `PostgresProjectRepository` as the structural pattern.
      **Tests first:** create `src/lib/services/note-management.spec.ts` and `todo-management.spec.ts` using shared repository fakes. Cover stale/no-op saves, folder content rejection, parent cycles, anchor bounds, immutable project IDs, completion timestamps, partial updates, and foreign IDs.
      **Verify:** `pnpm exec vitest run --project server src/lib/services/note-management.spec.ts src/lib/services/todo-management.spec.ts`, `pnpm check`, and `rg -n 'server/db' src/lib/services` returns nothing.

      **Progress:** Repository port taxonomy, users, and notes/anchors are complete through pure services, Postgres adapters, shared fakes, unit tests, and live repository contracts. Todos remain; there is no longer a `content.ts` repository bucket.

- [ ] **14. Split suggestion, provenance, and trust-policy persistence from domain rules**
      **Files:** explicit ports in `src/lib/repositories/suggestions.ts`, `provenance.ts`, and `trust-policies.ts`; `src/lib/server/repositories/postgres-provenance.ts`, `postgres-suggestions.ts`, `postgres-trust-policies.ts` (create); `src/lib/services/suggestion-management.ts`, `trust-policy-management.ts` (create); `src/lib/server/domain/automation-capabilities.ts` (remove after migration); `src/lib/server/production-factory.ts` (modify).
      **What:** Repositories perform owned CRUD and mapping only. Services enforce proposal ownership, anchor/note consistency, lifecycle transitions, expiry, and pipeline-specific trust. Preserve `SuggestionCreator/Finder/Lister/Accepter/Rejecter/Reverter`, `ProvenanceRecorder`, and trust-policy interfaces.
      **Tests first:** extend `src/lib/controllers/suggestion-lifecycle.spec.ts` only for orchestration; put transition/expiry/trust behavior in new service specs with repository fakes.
      **Verify:** focused service/controller tests, `pnpm check`, and no Drizzle import in the new services.

- [ ] **15. Split relationship, reference, diagram, and skill persistence from domain behavior**
      **Files:** explicit ports in `src/lib/repositories/relationships.ts`, `references.ts`, `diagrams.ts`, and `skills.ts`; `src/lib/server/repositories/postgres-relationships.ts`, `postgres-references.ts`, `postgres-diagrams.ts`, `postgres-skills.ts` (create); `src/lib/services/relationship-management.ts`, `reference-management.ts`, `diagram-management.ts`, `skill-management.ts` (create); `src/lib/server/domain/knowledge-capabilities.ts` and `diagram-agent-capabilities.ts` (reduce to deterministic/AI adapters only); production factory (modify).
      **What:** Move SQL/mapping into repositories. Keep same-project relationship rules, source-note ownership, diagram promotion/revision behavior, skill project ownership, and usage validation in pure services.
      **Tests first:** service specs for same-project relationships, duplicate idempotency, owned references, diagram deletion/indexing, cross-project skill exclusion, and skill usage.
      **Verify:** focused tests, `pnpm check`, and `rg -n 'server/db' src/lib/server/domain` finds only mapper schema types or explicitly documented repository adapters.

- [x] **16. Add provenance to skill-usage recording**
      **Files:** `src/lib/services/agent.ts`, `src/lib/models/workflows.ts` if a dedicated input is useful, skill repository/service adapters from step 15, agent context builder, and skill usage tests.
      **What:** Change `SkillUsageRecorder.record` to accept the provenance for the agent run (or a typed usage input containing it). Persist `provenanceId` for every injected skill and keep the context note optional. Do not synthesize a fake provenance ID.
      **Verify:** a behavior test observes the persisted skill usage with actor-owned provenance and another rejects foreign provenance.

- [x] **17. Implement suggestion expiry as an explicit transition**
      **Files:** suggestion repository/service adapters from step 14, `src/lib/services/suggestions.ts`, and suggestion lifecycle service tests.
      **What:** Add an expiry operation that atomically changes eligible `proposed` suggestions to `expired`. Expired records remain readable but cannot be accepted, rejected, or reverted. Use an injected clock in the service tests.
      **Verify:** focused service tests cover before/after expiry, idempotency, and ownership; one assertion per test.

- [x] **18. Restore focused diagram and skill workflow coverage**
      **Files:** create `src/lib/controllers/generate-mermaid-diagram.spec.ts`, `revise-mermaid-diagram.spec.ts`, `promote-diagram.spec.ts`, and `create-skill-from-selection.spec.ts`; extend shared diagram/skill fakes only as needed.
      **What:** Replace behavior formerly implied by deleted scaffolds with executable controller tests for unsupported diagram kinds, rendered/searchable output, promotion source links, indexing, transaction rollback, source anchors, and skill provenance.
      **Verify:** `pnpm exec vitest run --project server src/lib/controllers` and the QA one-assert/no-mock audit.

      **Progress:** Generate, Revise, Promote, and Create Skill now have focused behavior suites covering output, unsupported operations, indexing, provenance, and rollback where transactional.

- [ ] **19. Run real Postgres migration and repository contracts**
      **Files:** `src/lib/server/db/schema.contract.spec.ts`; add repository integration specs beside each `postgres-*.ts` adapter as it is created.
      **What:** Start the pgvector Testcontainer, apply migrations from an empty database, and verify ownership/project isolation, folder ordering/cycles at the service boundary, conversation chronology, note/diagram chunk coexistence, and cosine search. Never substitute SQLite.
      **Progress:** Docker is available. Nineteen contracts pass for schema (including entity-table removal and the note-only relationship enum), projects, users, notes, conversations, and project-scoped halfvec search. Add equivalent contracts as the remaining adapters from steps 13–15 land.
      **Verify:** `pnpm test:repository`.

- [x] **20. Remove the entity taxonomy across the stack**
      **Evidence:** Entity models, controller/factory methods, repositories, SQL tables and joins, relationship enum values, routes, components, demo fixtures, filters, and right-panel mode were deleted. `drizzle/0005_thankful_patriot.sql` destructively migrates existing databases. Todos render the free-text `waitingOn` counterparty and Relate connects notes directly.
      **Verify:** `rg -n "entities\(\)|EntityType|EntityId|same_client|same_system|engagement" src` returns no product dependencies, followed by the full verification suite and Docker migration contracts.

- [ ] **21. Final reconciliation after repository split**
      **Files:** `implementation-checklist.md`, this blueprint.
      **What:** Re-run every available non-UI check, update evidence and counts, and record only Docker/OAuth/hosting exclusions. Audit tests against `docs/domain-invariants.md` and ensure each documented invariant is implemented and tested.
      **Verify:** `pnpm lint`, `pnpm check`, `pnpm test:unit -- --run`, `pnpm test:workflow`, `pnpm test:capability`, `pnpm build`, and `git diff --check` all pass. Run `pnpm test:repository` when Docker is available.

## Test Rules

- No `vi.mock`, `jest.mock`, spies, or other mocking libraries.
- Shared stateful fakes implement complete ports and live under `src/lib/testing/fakes`.
- One primary `expect` per test; split separate invariants into separate tests.
- Assert observable output, persisted state, isolation, or domain errors—never calls, call counts, or internal sequencing.
- Unit-test models/services/controllers without a database. Test only repository adapters against real Postgres Testcontainers.

## Verification Snapshot

- `pnpm check`: passing, 0 errors and 0 warnings.
- `pnpm exec vitest run --project server`: passing, 172 backend tests across 26 files.
- `pnpm test:repository`: passing, 19 live Postgres contracts.
- `pnpm build`: passing with only the existing large-client-chunk warning.

Completion means every production business rule is in a pure service, every SQL statement is in a repository adapter, controllers and shared types remain stable for the UI, all non-DB behavior is green, and the real Postgres contracts pass when infrastructure is available.
