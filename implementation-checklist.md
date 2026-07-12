# Backend and UI Parallel Implementation Checklist

The UI depends only on `ControllerFactory`. Runtime composition is production-only; UI tests may inject hand-rolled controller fakes without changing controller calls.

Legend: `[ ]` pending or blocked verification, `[x]` implemented and verified by the available local checks.

## Foundation

- [x] Pure shared domain models and workflow inputs/outputs
- [x] Public controller interfaces separated from default implementations
- [x] Export-only barrels and domain-oriented files
- [x] `ControllerFactory` shared contract
- [x] `ProductionControllerFactory` with typed dependency bundles
- [x] Production composition with Postgres, deterministic, and OpenAI-backed capabilities
- [x] Behavior-focused workflow specifications backed by shared hand-rolled fakes
- [x] Typed domain error taxonomy
- [x] pgvector Postgres Testcontainer and migration harness
- [x] Project aggregate and recursive folder/note/skill filesystem contracts
- [x] Project controller and production factory seam
- [x] Backfill-safe project schema migration and semantic-search migration
- [x] Independent domain invariants specification
- [x] 11 executable schema contracts and 26 repository/transaction contracts
- [x] Obsolete intentionally-failing scaffold specifications removed from the default and contract suites

## Domain controller progress

Controllers are domain nouns. Workflows are methods on the controller that owns the behavior; the factory never exposes imperative use-case controllers.

| Controller     | Factory method    | Methods                                                              | Status          |
| -------------- | ----------------- | -------------------------------------------------------------------- | --------------- |
| Workspace      | `workspace()`     | `getShellContext`, `getTodayView`                                    | [x] Implemented |
| Projects       | `projects()`      | `list`, `get`, `create`, `rename`, `archive`, `createFolder`, `move` | [x] Implemented |
| Notes          | `notes()`         | `get`, `create`, `save`                                              | [x] Implemented |
| Todos          | `todos()`         | `list`, `update`, `extractPromises`                                  | [x] Implemented |
| Relationships  | `relationships()` | `suggestFromSelection`                                               | [x] Implemented |
| References     | `references()`    | `suggestFromSelection`                                               | [x] Implemented |
| Diagrams       | `diagrams()`      | `generateMermaid`, `reviseMermaid`, `promote`                        | [x] Implemented |
| Suggestions    | `suggestions()`   | `list`, `accept`, `reject`, `revert`                                 | [x] Implemented |
| Skills         | `skills()`        | `list`, `get`, `createFromSelection`                                 | [x] Implemented |
| Agent          | `agent()`         | `run`, `listSessions`, `getSession`                                  | [x] Implemented |
| Trust Policies | `trustPolicies()` | `list`, `update`                                                     | [x] Implemented |

## Capability and persistence progress

- [x] Promise Extractor (deterministic fallback plus OpenAI structured output)
- [x] Link Finder
- [x] Reference Finder and ranker
- [x] Trust Policy Evaluator
- [x] Source Anchor Repairer
- [x] Mermaid Diagram Creator, reviser, renderer, and promoter
- [x] Suggestion lifecycle services and artifact application
- [x] Complete injected Postgres repositories for every persisted domain
- [x] Transactional point-solution orchestration
- [x] Structured promise client boundary and deterministic fallback
- [x] Responses API web-reference client boundary
- [x] Official OpenAI Agents SDK runner with point-solution tools
- [x] SHA-256 chunk indexing, embedding reuse, pgvector HNSW index, and project-scoped search
- [x] Embedding reuse is scoped to the embedding model identity
- [x] Diagram text indexing isolated from parent-note chunks
- [x] Ownership validation for note/todo/suggestion/provenance/relationship/diagram/skill writes
- [x] Remove global database access from production capabilities; database dependencies are factory-injected
- [x] Split todo, suggestions/provenance/trust policies, relationships/references, diagrams, and skills into narrow repository adapters and pure domain services
- [x] Projects, users, notes/anchors, search, and conversations use explicit Postgres repository adapters
- [x] Replace vague `content`, `automation`, and `knowledge` repository-port buckets with one domain file per port
- [x] Persist agent conversations, user/assistant messages, and tool activity
- [x] Map real Agents SDK tool-call and tool-output events into the conversation journal
- [x] Add project-scoped retrieval, full selected-skill context, and skill-usage recording to agent runs
- [x] Attach agent-run provenance to every recorded skill usage
- [x] Add structured model reranking for semantic relationship labels with a deterministic fallback
- [x] Execute current Postgres schema/repository contracts through Docker Testcontainers
- [x] Group service contracts/implementations/tests and controller implementations/tests into explicit domain folders
- [x] Remove runtime demos, starter examples, unimplemented proxies, and unimplemented suggestion kinds
- [x] Verify async-local nested transaction rollback against live Postgres

## Verification

- [x] Controller contracts and behavior tests protect the frontend seam.
- [x] Deterministic promise extraction has focused behavioral tests with one primary assertion per test.
- [x] Strict TypeScript and Svelte checks.
- [x] ESLint and formatting.
- [x] Production build.
- [x] Default unit suite contains only executable behavior tests; database contracts remain isolated.
- [x] Database-backed contract suite passes against the Docker pgvector Testcontainer.
- [x] Invariant-to-test evidence is recorded in `docs/backend-verification.md`.
