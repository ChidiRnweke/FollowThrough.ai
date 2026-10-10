# Implement ADR 0007 across the application

## Objective and execution contract

Complete the architecture refactor in one follow-up PR. This is application implementation,
not another documentation-only change. Cover every capability, including shared services,
server services, browser controllers, stores, component-adjacent TypeScript, client workflows
and factories. Do not stop after the first family or after making imports appear compliant.

- Models contain data, schemas and value constructors; no business rules.
- Public services are stateless classes with narrow, explicitly implemented interfaces.
- Classes name meaningful domain capabilities. Do not wrap every helper in a class.
- Internal helpers remain private. Tests do not justify public exports.
- Controllers expose complete operations and own sequencing, coordination and transactions.
- Stores own mutable state and controlled updates, without business decisions, transport or workflows.
- Components call controllers for behavior and observe readonly state.
- Factories construct dependencies and do not execute workflows.
- Services never call other services, including through callbacks or disguised ports.

Preserve transport contracts, persisted database/browser formats, authorization, transactions,
visible behavior and failure semantics. Introduce no limits, defaults, fallback behavior or redesign.
Readonly collaborators and immutable configuration are valid fields. Operation-local arrays,
maps and evaluators are valid. A retained mutable Map is state even when its field is readonly.

## Mandatory reading

Read AGENTS.md and ADRs 0007, 0002, 0006, 0015, 0037, 0040, 0041, 0042 and 0043 before code changes.
Before each subsystem read its relevant ADRs, including 0017 for uploads and 0024, 0025 and 0034
for tracing, durable execution and execution-state types. After context loss reread this plan
and mandatory ADRs. Use building-sveltekit-frontend, qa and drafting-prs. ADR 0007 overrides
older examples; correct conflicting examples in all three skill copies.

## Execution setup and current status

- 2026-10-10: PR #324 remains OPEN at 11032df292820b19d9ec393b637364e4077ffdea.
- PR #325 is MERGED. Preserve #324 model extractions, fixes, tests and documentation deletions.
- Worktree: artifacts/worktrees/stateless-service-controller.
- Branch: refactor/stateless-service-controller, based on origin/refactor/controller-model-audit.
- Incorporated origin/master (287acc9b) with a merge. Do not merge either PR automatically.
- Follow-up PR target: refactor/controller-model-audit while #324 remains open; recheck before publication.
- Prepend /Users/chidi/.nvm/versions/node/v24.21.0/bin to PATH for pnpm.
- Dependencies installed; ignored .env linked to main checkout configuration.
- Implementation and verification are incomplete. No completion claim or PR yet.

## Paused implementation handoff — 2026-10-10

The user requested a pause and a draft PR containing the full plan and current implementation.
This changes the immediate delivery milestone, not the architecture's completion criteria. The
refactor is **incomplete and not ready to merge**. Resume from this branch; preserve its prerequisite
changes and completed migrations. The last implementation commit is `93cea77b`.

### Implemented areas

The commits and detailed evidence below cover these migrated portions; they do not establish
that every boundary in each family is complete:

- Workspace command preparation, atomic cache/outbox coordination, account synchronization and
  editor lifetime contracts; shared widget patch/validation/semantic-edit coordination.
- Explicit server capability contracts across notes, projects, todos, skills, memory, suggestions,
  references, relationships, attachments, diagrams and deliverables; shared domain rule classes.
- Browser operations for project actions, note editing/history/actions/submissions, search,
  uploads, archive imports, diagram previews, exports and artifact lifecycle actions.
- Document conversion and rendering boundaries; explicit token counting, maintenance, admission,
  conversation, execution, stream, tool-review and discovery state ownership.
- Agent execution, research, approval preparation/replay, MCP dispatch/discovery, registry startup,
  catalog/preferences, run status and transcript reconstruction behind named contracts.
- Partial architecture enforcement and guidance updates. Current checks still do not cover every
  forbidden indirect dependency, mutable exposure, service function or factory/store workflow.

### Latest verified evidence

These results apply to implementation commit `93cea77b`, before this documentation-only handoff:

| Check                                | Observed result                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                         | Passed; zero errors and warnings                                                                                     |
| `pnpm lint`                          | Passed                                                                                                               |
| Full unit verification               | 558 files; 4,370 passed; one existing skip                                                                           |
| Focused agent tests                  | 68 files; 632 passed                                                                                                 |
| Selected isolated database contracts | 21 files; 108 passed                                                                                                 |
| `pnpm test:architecture`             | Failed with 51 prohibited imports; topology, source and test-quality checks passed; chained UI audit was not reached |

No live LLM calls were used. Unit output includes a Svelte `derived_inert` warning; a passing
suite is not evidence that the warning has been resolved. Earlier browser/PWA runs had failures.
Only the palette/approval failures were reproduced against the untouched baseline; other failures
remain unresolved or unclassified. Earlier docs/build/browser/contract results recorded below
are not final verification of this head. The full verification sequence, authenticated browser
coverage, production build/output audit and required PR checks remain outstanding.

### Remaining implementation and restart point

1. **Browser chat:** completed in the #338 contribution below. Preserve its session lifecycle,
   generation guards, readonly views and context handoffs. The older inspection-only restart
   entry applied to `93cea77b` and is superseded by that contribution.
2. **Remaining browser surfaces:** complete the remaining shell boundaries, note editor/publication/review,
   todo/skill/memory/suggestion, widget/canvas, settings and feedback boundaries. Remove raw drafts,
   mutable stores, resources and indirect service/remote access from components and adjacent code.
3. **Remaining server/composition boundaries:** remove application callbacks and authority workflows
   from agent tool definition factories; finish agent-file helpers, identity/startup coordination,
   concrete dependency leaks and any retained service state. Preserve tool coverage registration.
4. **Remaining shared rules:** finish chat/context/mentions/model presentation, payload handling,
   workspace/sync/proofreading and every unresolved inventory entry. Some older inventory rows
   predate later migrations; reconcile them against code instead of treating them as completion.
5. **Enforcement and verification:** finish symbol-based indirect dependency/state/workflow checks,
   remove contradictory permissions, align all three skill copies, resolve the inventory and all
   failures, then run every completion check above. Do not introduce migration allowances.

Keep the worktree and branch while the draft PR is paused. The full original implementation
checklist follows, with unverified items left unchecked. Do not mark the draft ready or remove
this execution plan until the original completion conditions are met.

## Browser chat lifecycle and context handoff contribution — 2026-10-10

This contribution starts from `5af62eb5` on `refactor/pr336-chat-lifecycle`. It owns browser
chat sessions and their context/workbench handoff. It does not complete the application-wide
refactor or make PR #336 ready to merge.

- [x] Separate reactive chat/session ownership from controller-owned hydration, submission,
      replay, approval, cancellation, reconnect and teardown. Expose readonly session views.
- [x] Move transcript types and schemas into chat models, external-value readers into client
      adapters, and transcript/chip/context rules into named stateless service contracts.
- [x] Move composer draft/context preparation and staged handoffs into controllers. Keep
      textarea input, focus and scrolling in components. Preserve storage keys and wire formats.
- [x] Replace mutable registry access with session operations. Preserve session identity,
      reference counts, saved approvals, transcript ordering and large durable cursors.
- [x] Invalidate late submission, approval and reconnect results on release or account teardown.
      Release application chat/context state when the account binding is torn down.
- [x] Route note actions, docked/full-page chat and the chat/canvas association through the
      new interfaces. General workbench navigation and persistence remain outside this slice.

Observed validation for this contribution:

- `pnpm lint`, `pnpm check` and `pnpm docs:check`: passed.
- `pnpm test:unit`: 566 files, 4,443 passed and one existing skip. The existing Svelte
  `derived_inert` warning remains in the broader suite.
- `pnpm test:contracts`: 108 files and 522 passed against an isolated Postgres testcontainer.
- `pnpm test:architecture`: topology, source and test-quality audits passed; Chisel still
  reports 46 prohibited imports. A fresh check of the unchanged base reports 51. The remaining
  file/rule pairs are all present on the base. No allowances or baselines were added.
- `pnpm test:ui`, run separately after the chained architecture check stopped: passed.
- Authenticated browser: all 16 existing composer layout scenarios passed. Two new handoff
  scenarios passed at 1,680 px and 1,200 px, using an existing local note and no model calls.
  They verify a prefilled prompt without starting a run. Run `pnpm test:e2e
tests/e2e/chat-handoff.e2e.ts` to repeat them with the authenticated setup.
- The existing selection suite stopped after two timeouts waiting for the editor's
  “Ask about this” action, before chat invocation. The first timeout was reproduced against
  unchanged `5af62eb5`. The multiple-passage browser scenario remains unverified; controller
  tests cover preserved pinned selection and staged handoff consumption.

Browser checks used a temporary configuration on port 5187 so they did not reuse another
worktree's server. The unchanged-base comparison used port 5188. The dev server also reports
its existing missing `/offline-shell.html` response. No new content was seeded for these checks.
Production build and full PWA verification remain part of the parent PR's final acceptance.
Existing application-wide checklist items remain open unless their complete scope was verified.

## Workbench navigation and persistence contribution — 2026-10-10

This contribution starts from #338 at `dc4bd7a2` on
`refactor/pr336-workbench-boundaries`. It completes general workbench navigation and layout
persistence. It does not complete the parent architecture refactor or change server code.

- [x] Reconcile the stale chat restart entry against #338. Its lifecycle and context handoffs
      are implemented; the general workbench navigation and persistence exclusion was current.
- [x] Move open/background-open/focus/close/bulk-close/move/replace/split/prune workflows into
      a navigation controller over a stateless transition capability.
- [x] Move account attachment, restoration, preference updates and persistence into a layout
      controller. Keep reactive layout values and retained binding/generation/operation guards
      in explicit state owners. Keep IndexedDB connection lifetime in the account adapter.
- [x] Expose readonly workbench views and narrow operation interfaces from composition.
      Keep restoration/reconciliation mechanisms off component-facing interfaces. URL/tab
      readers and preference storage are client adapters; types and schemas are model-owned.
- [x] Move shell reconciliation and project resolution into a controller. Restore and save
      layout without requiring the initial workspace catalog download. Prune only against
      complete inventory. Preserve account cleanup and #338 chat session/context ownership.
- [x] Preserve tab encodings, URL/history behavior, existing storage keys/record format, deep-link
      focus, saved sibling tabs, pin/preference restoration, interaction focus and late-account guards.
- [x] Migrate regression tests and add preference/failure, shell readiness and history cases.
      Replace the obsolete `draft:` fixture with a production-supported `diagram:` tab.
- [x] Capture matching authenticated split layouts at 1,680×1,000 and 900×1,000 before/after.
      Evidence uses a synthetic account and two notes, without provider calls.
- [x] Record local verification below. Publish the stacked PR and record its required checks;
      inherited architecture failures keep delivery in draft.

The workbench/shell and chat/context operation rows below now reflect these completed
contributions. Other browser and application-wide audit rows remain pending. These checked
tasks do not establish every adjacent shell boundary or reopen #338's completed chat work.

Observed validation and reproduction:

- Focused workbench tests: 144 passed across eight files after the restoration readiness fix.
- Authenticated browser comparison: 28 passed after the refactor, including all 16 composer
  scenarios, both note-to-chat handoffs and all six split scenarios. The same three navigation
  progress cases failed on unchanged #338 and the refactor. The baseline run had 12 passed.
  Commands selected `workbench-tabs`, `workbench-split`, `chat-handoff` and (after) `chat-composer-anchor`
  from `tests/e2e/`, using an isolated development server on port 5191.
- Account switching: `workbench-account.e2e.ts` passed with the PWA configuration against an isolated
  Postgres testcontainer and production preview on port 5192. A first run exposed premature catalog
  access during restoration; the fix and a regression test now separate those lifetimes.
  Repeat with `pnpm test:sync:pwa tests/e2e/workbench-account.e2e.ts` on a free configured port.
- Database contracts: 108 files / 522 passed in a Postgres testcontainer.
- Production web/worker build and output audit: passed. The audit permits the existing oversized
  Mermaid vendor chunk; no application chunk exceeded its threshold.
- Full unit suite: 570 files / 4,458 passed / one existing skip. The existing Svelte
  `derived_inert` warning remains. After tightening the layout fake to reject use after close,
  all 39 workbench controller tests passed again.
- `pnpm lint`, `pnpm check`, `pnpm docs:check` and the separate `pnpm test:ui`: passed.
- `pnpm test:architecture`: topology, source and test-quality audits passed. Chisel failed on
  the same 46 prohibited imports as unchanged #338. File/rule diagnostics match after excluding
  source line positions. No new allowances or baselines were added.
- A synthetic UI check passed focus → browser Back → Close all → reload, with an empty saved
  working set after reload. Move/replace remain controller operations without an exposed reorder
  UI in this base; transition and navigation-history tests verify those boundaries.
- The full PWA suite and multiple-passage selection scenario remain parent-level verification
  gaps. This contribution ran the isolated account-switch PWA test, not the full PWA suite.
- Stacked draft PR [#347](https://github.com/ChidiRnweke/FollowThrough.ai/pull/347) targets #338.
  Required CI results are tracked on that PR. Commitlint, title validation and contracts passed
  on implementation commit `582ace91`. The inherited architecture failures still block quality;
  this contribution does not make #336/#338 merge-ready.

## A. Inventory and regression evidence

Planning baseline: 63 shared-service modules, 191 exported functions, no exported classes;
110 server-service modules, 104 exported functions and 84 exported classes. Regenerate these
counts; they are inventory, never an allowance.

- [ ] Inventory every service export, controller public member, retained state field, concrete factory dependency and prohibited component dependency.
- [ ] Resolve aliases, relative imports, re-exports, adjacent files and injected callbacks; grep alone is insufficient.
- [ ] Assign each entry: named capability, private implementation, store, boundary adapter, value constructor or deletion.
- [ ] Run baseline checks and record existing failures separately. Preserve session deletion races, ownership and durable object removal tests.

Inventory and observed validation results are appended below during execution. Unreviewed entries
stay pending; mechanical checks do not establish capability cohesion.

## B. All shared business rules

- [ ] Convert public functions into cohesive classes implementing named interfaces; retain useful method signatures.
- [ ] Agent/chat: model selection/presentation, preferences, run status, research settings, context, mentions, tool catalog/result presentation.
- [ ] Notes: creation, edits, publication, trash, preparation, references, comparison, highlighting, outline, numbering, statistics and search.
- [ ] Projects/todos/skills: details/tree/export; todo creation/editing/presentation/export; manifests and metadata.
- [ ] Memory/suggestions/links: edits/attention, suggestion/provenance/reference/relationship presentation.
- [ ] Widgets: patch preparation, semantic editing, evaluation, sources, export, search, catalog and trash.
- [ ] Workspace/sync: command decisions, rebase, cache/write policies, startup, Today, conflict review and shell presentation.
- [ ] Export/proofreading: preparation, asset discovery and proofreading rules.
- [ ] Public methods serve production callers. Traversals, snippets, serializers and intermediate calculations stay private. Remove test-only production helpers.
- [ ] Keep branded constructors in models, decisions in capabilities, and one implementation for browser/server rules. Do not hide business rules in schema callbacks.

## C. Server capabilities and orchestration

- [ ] Split mixed catalogs into reading, editing, lifecycle, revision and portability capabilities for notes/projects/todos/skills/memory/suggestions/diagrams/attachments/deliverables.
- [ ] Narrow interfaces for identity/reference/relationship/widget/workspace-receipt/agent-file capabilities.
- [ ] Rendering/conversion/preparation/selection functions become capability methods with private helpers.
- [ ] Remove service composition, including index chunking, conversation virtualization, parser registries and document conversion callbacks.
- [ ] Move agent execution/session coordination, reviewed tools, retention, object removal and scheduling into controllers.
- [ ] Interface-typed factory outputs: no concrete contracts, Pick<ConcreteClass, …>, or leaked collaborators.
- [ ] Preserve controller-owned transactions and update controller surfaces/agent-tool coverage for changed interfaces.

## D. Explicit state owners and lifetimes

- [ ] Server process stores: active-run handles/subscriptions, model cache, per-user admission.
- [ ] Execution/session stores: conversation buffers, stream mapping, tool-review decisions, diagram generation.
- [ ] Worker/scheduler stores: maintenance cursors, scheduled work, outstanding executions.
- [ ] Controllers read state, invoke rules, apply updates. Stores never load, retry, call providers or decide workflows.
- [ ] Preserve identity-safe release, synchronous admission before awaits, account/run isolation and shutdown.
- [ ] Named token-counter adapter replaces tokenizer singletons and factory counting closures.
- [ ] Renderers receive resolved immutable resources; connection/SDK mechanics stay private infrastructure.
- [ ] Browser promises, generations, retries and caches move to scoped stores; stopped accounts cannot be repopulated by late results.

## E. Complete browser controller operations

- [ ] Factories expose controller interfaces and readonly feature state.
- [ ] Remove component-facing WorkspaceResources, raw drafts, mutable ChatStore, queues, transports and broad registries.
- [ ] Workspace/session: start/stop/sync/recover/reset/local export.
- [ ] Sync/review: pull/submit/proof recovery/retry/keep/discard.
- [x] Workbench/shell: open/focus/close/move/split/restore/context handoff (#338 and #347).
- [x] Chat/context: open/release/send/retry/cancel/approve/capture context (#338).
- [ ] Notes: edit/save/lifecycle/history/proofreading/search/comparison/clipboard.
- [ ] Projects/todos/skills/memory/suggestions: editing/lifecycle/review/export.
- [ ] Widgets/diagrams: editing/preview/evaluation/source resolution/canvas/export rendering.
- [ ] Attachments/imports: upload/complete/sync/delete/import.
- [ ] Exports/settings/feedback: prepare/export/download/preferences/MCP configuration test/feedback.
- [ ] Move workflows from ResourceCache, MutationQueue, WorkspaceSyncRuntime, submission helpers and action stores.
- [ ] Preserve IndexedDB atomicity: transaction-local read → controller rules → write through a narrow unit-of-work adapter. Never compute transitions outside the transaction.
- [ ] Transport/readers/timers/locks/clipboard/DOM/vendor protocols remain narrow adapters.
- [ ] Components retain rendering/focus/DOM/local form state. Presentation controllers return useful feature results, not a controller per formatter.

## F. Complete widget validation operation

- [ ] WidgetPatchService.propose returns candidate JSON or explicit patch failure.
- [ ] Inject WidgetCandidateReader for shape/catalog validation at browser/server write-input boundaries.
- [ ] WidgetEditingService.decide returns complete update or structured rejection after semantic rules.
- [ ] Schemas in models; services/controllers never invoke Zod.
- [ ] Same sequence for JSON editing, creation, approval previews, offline writes, rebase and server writes; creation skips patch preparation.
- [ ] Preserve synchronous preview, issue paths, version checks, atomic rejection; formula interpretation stays private domain computation.

## G. Enforcement and guidance

- [ ] AST/symbol rules for TypeScript/Svelte, aliases/barrels/callable objects/indirect dependencies.
- [ ] Reject public service functions, missing implemented interfaces, leaked collaborators, retained service state and service composition.
- [ ] Reject component service/remote/repository access, writable state exposure and store/factory workflows.
- [ ] Shared services and browser controllers join strict source checks.
- [ ] Remove contradictory Chisel permissions and fixtures.
- [ ] Accepted fixtures for operation-local state, immutable configuration, constructors and boundary adapters.
- [ ] No migration baselines, arbitrary method caps or grandfathering allowances.
- [ ] Update repository guidance and three skill copies; delete superseded handoffs/examples; preserve ADR rationale.
- [ ] Resolve every inventory entry through semantic review.

## Verification and completion

Preserve behavioral tests with InMemory fakes and one expect per test. Do not replace tests with
call-count assertions or expose helpers merely to keep tests compiling.

- [ ] Rapid offline edits, cross-tab ordering, permanent receipts, atomic cache/outbox updates.
- [ ] Independent lanes, uncertain retries, stable operation identities, three-way conflicts.
- [ ] Partial inventory, preference initialization without writes, generations, account teardown.
- [ ] Approval replay, cancellation, provider cleanup, session deletion/submission races.
- [ ] Per-user admission, cache lifetime, maintenance progress, shutdown.
- [ ] Upload/export failures, stale responses, durable cleanup.
- [ ] Widget preview/server parity, invalid patches, unavailable sources.
- [ ] Clipboard activation, rich-document round trips, export rendering.
- [ ] pnpm lint
- [ ] pnpm check
- [ ] pnpm test:architecture
- [ ] pnpm docs:check
- [ ] pnpm test:verify (unit, browser, isolated contracts, e2e, PWA)
- [ ] Production build and build-output audit.

Use authenticated browser tests, scoped seeded data and fake providers. No live LLM validation.
Complete only when every capability/inventory entry is resolved, stricter checks have zero
violations, persistence/product behavior remains covered, required PR checks pass, and a single
follow-up PR includes the full refactor/evidence. Retain this plan until then; remove temporary
inventory artifacts before final PR completion. Never mark blocked or unverified work complete.

## Execution inventory — current, incomplete

The symbol inventory is in `artifacts/adr0007/inventory.json`; the initial snapshot is in
`artifacts/adr0007/baseline-inventory.json`. It contains service exports, controller members,
retained fields, factory/component imports, resolved call signatures and import edges.
Concrete injected callback targets and transitive component boundaries still require review.

Every service module below has a planned disposition. This is routing, not completion.

| Module                                                              | Current public values                                                                                                                                                                                                                      | Disposition and status                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/services/agent-files/virtual-files.ts`              | `attachmentFilePath`, `diagramFilePath`, `agentFileOf`, `AgentVirtualFiles`                                                                                                                                                                | Named agent-files capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                   |
| `src/lib/server/services/agent/conversations/archive.ts`            | ConversationArchive                                                                                                                                                                                                                        | Explicit session and transcript interfaces, with interface-typed factory outputs and consumers. No retained mutable state. Storage payloads, visibility and deletion races verified.                                                                                             |
| `src/lib/server/services/agent/conversations/history.ts`            | `ConversationHistoryService`                                                                                                                                                                                                               | Replay and persistence preparation rules; private image/text helpers. Session coordination moved to controller; caches to store; SDK parsing to adapter.                                                                                                                         |
| `src/lib/server/services/agent/conversations/replay-virtualizer.ts` | `AgentReplayVirtualizer`                                                                                                                                                                                                                   | Explicit preparation/application interface, stateless file virtualization. Controller resolves serialized arguments through a boundary reader first.                                                                                                                             |
| `src/lib/server/services/agent/conversations/rewind.ts`             | ConversationHistoryService.rewind                                                                                                                                                                                                          | Old function module deleted. History capability owns private user-ordinal traversal; agent controller owns transactional transcript/provider rewind.                                                                                                                             |
| `src/lib/server/services/agent/conversations/tool-activity.ts`      | `toolOutcomeEvent`, `toolActivityFromEvent`                                                                                                                                                                                                | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/approvals.ts`                   | `RunApprovals`                                                                                                                                                                                                                             | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/cancellation.ts`                | `RunCancellation`                                                                                                                                                                                                                          | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/checkpoints.ts`                 | `RunCheckpoints`                                                                                                                                                                                                                           | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/context.ts`                     | `AgentContext`                                                                                                                                                                                                                             | Named AgentContext capability with IAgentContext; token counter and immutable limit injected. Other agent workflows remain pending.                                                                                                                                              |
| `src/lib/server/services/agent/runs/images.ts`                      | AgentImagePreparationService                                                                                                                                                                                                               | Explicit validation, durable reader selection and complete execution input. Private helpers; native/fallback images and account-supplied channels verified.                                                                                                                      |
| `src/lib/server/services/agent/runs/ledger.ts`                      | `AgentRunLedger`                                                                                                                                                                                                                           | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/note-action-requests.ts`        | `DuplicateNoteActionRequest`, `NoteActionRequests`                                                                                                                                                                                         | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/output.ts`                      | `segmentOutput`                                                                                                                                                                                                                            | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/preferences.ts`                 | AgentPreferenceCatalog, AgentModels                                                                                                                                                                                                        | Explicit preference reading/writing and model catalog interfaces. Execution-mode selection moved to shared AgentRunSettingsService; model cache remains controller/store-owned.                                                                                                  |
| `src/lib/server/services/agent/runs/preparation.ts`                 | RunPreparation                                                                                                                                                                                                                             | Implements ChatRunPreparation; factory/controller use its interface. Cancellation error moved to application errors. Locked claiming and frozen provenance/context verified.                                                                                                     |
| `src/lib/server/services/agent/runs/reasoning.ts`                   | AgentExecution; AgentPromptService; AgentToolRecoveryService; AgentStreamPresentationService                                                                                                                                               | Old service deleted. Controller owns execution and cleanup; SDK mechanics and parsing in adapters; stream correlation/deduplication in an execution store. Prompt/recovery helpers private. Tool registry factory workflows remain pending.                                      |
| `src/lib/server/services/agent/runs/settlement.ts`                  | `RunSettlements`                                                                                                                                                                                                                           | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/tool-trust.ts`                  | `ToolTrust`                                                                                                                                                                                                                                | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/agent/runs/tool-views.ts`                  | AgentToolPresentationService                                                                                                                                                                                                               | Explicit stateless agent-result capability; projected receipts, file references and fields unchanged. Public projection functions removed. Registry orchestration remains pending.                                                                                               |
| `src/lib/server/services/agent/tools/preferences.ts`                | ToolAccess implements ToolPreferenceCapability                                                                                                                                                                                             | Controller resolves catalog metadata and passes values to storage capability. No catalog service callback. Test-only resolve helper removed; override and locked-tool behavior verified.                                                                                         |
| `src/lib/server/services/agent/tools/tool-index.ts`                 | `ToolCatalogIndex`                                                                                                                                                                                                                         | ToolCatalogIndex implements IToolCatalogIndex; text/hash helpers private. Tests seed real index plans; discovery controller owns provider and transaction sequence.                                                                                                              |
| `src/lib/server/services/attachments/content.ts`                    | AttachmentContent, AttachmentProcessingService                                                                                                                                                                                             | Explicit presentation and processing-rule interfaces; extraction/settlement helpers private. Controller coordinates OCR, vision and indexing.                                                                                                                                    |
| `src/lib/server/services/attachments/formats.ts`                    | AttachmentFormatService                                                                                                                                                                                                                    | Text eligibility and OCR kind form one stateless capability. Controller chooses the decoder/provider.                                                                                                                                                                            |
| `src/lib/server/services/attachments/image-description.ts`          | ImageDescriptionService                                                                                                                                                                                                                    | Stateless image-description instructions; HTTP and schema reading moved to boundary adapter. Processing controller coordinates both.                                                                                                                                             |
| `src/lib/server/services/attachments/library.ts`                    | AttachmentUploadService, AttachmentReadingService, AttachmentDownloadService, AttachmentLifecycleService                                                                                                                                   | Split upload, reading, download and lifecycle capabilities with narrow factory outputs. Transactions remain controller-owned; permanent deletion queues physical cleanup.                                                                                                        |
| `src/lib/server/services/attachments/mistral-ocr.ts`                | Moved to adapters/attachments/mistral-ocr.ts                                                                                                                                                                                               | OCR HTTP and response reading implement a controller-owned port. Schemas in models/attachment-recognition. Page traversal and conversion helpers private.                                                                                                                        |
| `src/lib/server/controllers/attachments/object-removal.ts`          | `AttachmentObjectRemoval`                                                                                                                                                                                                                  | Moved to a controller; retained traversal/timer state has a worker-scoped store. Behavioral tests pass.                                                                                                                                                                          |
| `src/lib/server/controllers/attachments/retention.ts`               | `UploadRetention`                                                                                                                                                                                                                          | Moved to a controller; retained traversal/timer state has a worker-scoped store. Behavioral tests pass.                                                                                                                                                                          |
| `src/lib/server/services/attachments/storage.ts`                    | Moved to object-storage repository and text-reader adapter                                                                                                                                                                                 | S3 connection/bucket mechanics stay private to the object-storage repository. UTF-8 reading is a boundary adapter; parser registry removed and controller selects the path.                                                                                                      |
| `src/lib/server/services/deliverables/artifacts.ts`                 | `mediaTypeFor`, `safeFilename`, `validateSettings`, `ArtifactLibrary`                                                                                                                                                                      | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/bundle.ts`                    | `packZip`                                                                                                                                                                                                                                  | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/diagram-rendering.ts`         | `DiagramRasterizer`                                                                                                                                                                                                                        | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/docx.ts`                      | `generateDocx`                                                                                                                                                                                                                             | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/pdf.ts`                       | `generatePdf`, `mermaidSourceHash`                                                                                                                                                                                                         | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/template-styles.ts`           | `verifiedTemplateStyles`, `extractTemplateStyles`                                                                                                                                                                                          | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/deliverables/templates.ts`                 | `DocumentTemplates`                                                                                                                                                                                                                        | Named deliverables capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/diagrams/canvas-source.ts`                 | `PresentedCanvasSource`                                                                                                                                                                                                                    | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/content.ts`                       | `DiagramContent`                                                                                                                                                                                                                           | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/drawio.ts`                        | `DrawioXmlValidator`, `DrawioSvgSanitizer`, `DrawioLabelReader`                                                                                                                                                                            | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/generation.ts`                    | Moved to controller, store and SDK adapter                                                                                                                                                                                                 | DiagramSessions coordinates provider events, validation responses and cancellation. DiagramGenerationStore owns execution state; AgentSdkDiagramProvider owns SDK mechanics. No retained state remains in a generation service.                                                  |
| `src/lib/server/services/diagrams/icons.ts`                         | `IconifyIconSearch`                                                                                                                                                                                                                        | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/library.ts`                       | `DiagramLibrary`                                                                                                                                                                                                                           | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/mermaid-revision.ts`              | `prepareMermaidRevision`                                                                                                                                                                                                                   | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/run-context.ts`                   | `DiagramRunContext`                                                                                                                                                                                                                        | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/diagrams/submission-validation.ts`         | `MermaidSubmissionValidator`, `assertRenderedPng`, `diagramRevisionModel`                                                                                                                                                                  | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/identity/api-tokens.ts`                    | AccessTokens                                                                                                                                                                                                                               | Hash helper private; database contract establishes the expected hash independently. Remaining identity review pending.                                                                                                                                                           |
| `src/lib/server/services/identity/oauth-authorization.ts`           | `OAuthAuthorization`                                                                                                                                                                                                                       | Named identity capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/identity/provider-accounts.ts`             | `ProviderAccounts`                                                                                                                                                                                                                         | Named identity capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/identity/sessions.ts`                      | `SessionRegistry`                                                                                                                                                                                                                          | Named identity capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/identity/user-preferences.ts`              | `UserPreferenceStore`                                                                                                                                                                                                                      | Named identity capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/identity/users.ts`                         | `UserDirectory`                                                                                                                                                                                                                            | Named identity capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/server/services/inline-suggestions/inline-admission.ts`    | `InlineAdmissionRules`                                                                                                                                                                                                                     | Stateless admission rules. Synchronous reservation and spend sequence moved to controller/store.                                                                                                                                                                                 |
| `src/lib/server/services/inline-suggestions/inline-completion.ts`   | `inlineCompletionTraceAttributes`, `inlineCompletionPrompt`, `sanitizeCompletion`, `InlineSuggestionCompletion`                                                                                                                            | Named inline-suggestions capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                            |
| `src/lib/server/services/inline-suggestions/inline-context.ts`      | `InlineContextService`                                                                                                                                                                                                                     | Named InlineContextService with IInlineContextService; helpers private and token counter injected. Provider boundary remains pending.                                                                                                                                            |
| `src/lib/server/services/knowledge-search/embeddings.ts`            | `DEFAULT_EMBEDDING_MODEL`, `Embeddings`                                                                                                                                                                                                    | TokenCounter injected through composition; no retained tokenizer singleton. Provider/boundary review pending.                                                                                                                                                                    |
| `src/lib/server/services/knowledge-search/index-backlog.ts`         | `IndexBacklog`                                                                                                                                                                                                                             | IndexBacklog implements IIndexBacklog; cursor owned by maintenance store. No exported helpers.                                                                                                                                                                                   |
| `src/lib/server/services/knowledge-search/indexing.ts`              | `diagramIndexNoteId`, `ContentIndex`                                                                                                                                                                                                       | IndexCapabilities and named consumer interfaces; chunking/hash helpers private, codec injected. Diagram selection helper and full capability-surface review remain pending.                                                                                                      |
| `src/lib/server/services/knowledge-search/query-generation.ts`      | `SearchQueryGeneration`                                                                                                                                                                                                                    | Query preparation moved into KnowledgeLookup; provider implementation retains ISearchQueryGeneration. SDK/boundary review pending.                                                                                                                                               |
| `src/lib/server/services/knowledge-search/ranking.ts`               | `DEFAULT_RERANK_MODEL`, `RERANKING_STRATEGY`, `rerankDocumentText`, `rerankerInputTraceAttributes`, `rerankerOutputTraceAttributes`, `SearchRanking`                                                                                       | Named knowledge-search capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                              |
| `src/lib/server/services/knowledge-search/semantic.ts`              | `KnowledgeLookup`                                                                                                                                                                                                                          | KnowledgeLookup implements IKnowledgeLookup; query preparation, vector validation, candidate policy and source identity owned here. No exported helpers.                                                                                                                         |
| `src/lib/server/services/memory/library.ts`                         | `MemoryReadingService`, `MemoryWritingService`, `MemoryLifecycleService`, `MemoryProposalService`                                                                                                                                          | Explicit reading, editing, lifecycle and proposal contracts; repository authorization and replacement semantics retained. Shared proposal editing semantics still need review.                                                                                                   |
| `src/lib/server/services/notes/catalog.ts`                          | Note reading, editing, lifecycle, revision reading/writing, publication, anchor repair and creation service classes                                                                                                                        | Resolved into locally implemented narrow contracts. Controller-owned locks/transactions and persisted formats retained; factories expose interfaces.                                                                                                                             |
| `src/lib/server/services/notes/deletion.ts`                         | NoteLifecycleService.prepareDeletion                                                                                                                                                                                                       | Server function module removed. Shared lifecycle capability owns children-first trash deletion and hidden-skill protection. Controller retains transaction.                                                                                                                      |
| `src/lib/server/services/notes/import.ts`                           | NoteArchiveImportService                                                                                                                                                                                                                   | Explicit complete import preparation and link resolution. Helpers private. Notes controller retains identity-first writes and partial outcomes; ArchiveImports owns browser upload/synchronization.                                                                              |
| `src/lib/server/services/notes/markdown.ts`                         | NodeNoteMarkdown (server/adapters/notes/markdown.ts)                                                                                                                                                                                       | Deleted service module. Boundary adapter owns editor-schema conversion and validation, through controller reader/writer ports. Rich-document round trips verified.                                                                                                               |
| `src/lib/server/services/notes/patches.ts`                          | NotePatchPreparationService                                                                                                                                                                                                                | Complete candidate patch or actionable rejection through explicit interface. Matching and failure formatting private; reviewed transaction stays in Notes controller.                                                                                                            |
| `src/lib/server/services/notes/provenance.ts`                       | `NoteProvenance`                                                                                                                                                                                                                           | Named notes capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/server/services/notes/revision-diff.ts`                    | NoteRevisionComparisonService                                                                                                                                                                                                              | Explicit comparison capability injected into Notes; existing results preserved.                                                                                                                                                                                                  |
| `src/lib/server/services/notes/selection-origin.ts`                 | `SelectionOrigins`                                                                                                                                                                                                                         | Implements SelectionOriginService; selection decision helper is private. Fakes exercise the real capability over in-memory transaction participants.                                                                                                                             |
| `src/lib/server/services/projects/catalog.ts`                       | ProjectCreationService, ProjectReadingService, ProjectEditingService, ProjectLifecycleService, ProjectTreeService                                                                                                                          | Narrow reading, creation, editing, archive and tree persistence contracts. Private active-project lookup. Placement rule moved to shared stateless capability; transaction locks remain controller-owned.                                                                        |
| `src/lib/server/services/references/discovery.ts`                   | ReferenceDiscovery                                                                                                                                                                                                                         | Stateless candidate preparation only. ReferenceSearch controller coordinates settings, provider and candidate preparation; HTTP parsing and serialization live in adapters.                                                                                                      |
| `src/lib/server/services/references/library.ts`                     | ReferenceWritingService, ReferenceReadingService                                                                                                                                                                                           | Creation and reading/context contracts. Removed unused deletion surface; factories expose interfaces.                                                                                                                                                                            |
| `src/lib/server/services/references/ranking.ts`                     | ReferenceRanking                                                                                                                                                                                                                           | Explicit ReferenceRanker contract; operation-local ordering.                                                                                                                                                                                                                     |
| `src/lib/server/services/relationships/discovery.ts`                | RelationshipDiscovery                                                                                                                                                                                                                      | Explicit classification contract.                                                                                                                                                                                                                                                |
| `src/lib/server/services/relationships/graph.ts`                    | RelationshipWritingService, NoteLinkReconciliationService, RelationshipReadingService                                                                                                                                                      | Writing, reconciliation and reading/context capabilities. Removed unused deletion and test-only create wrapper. Semantic-edge locking preserved.                                                                                                                                 |
| `src/lib/server/services/relationships/rules.ts`                    | RelationshipRules                                                                                                                                                                                                                          | Explicit rule-classification contract; factory/controller receive interface.                                                                                                                                                                                                     |
| `src/lib/server/controllers/maintenance/scheduler.ts`               | `startScheduler`                                                                                                                                                                                                                           | Moved to a controller; retained traversal/timer state has a worker-scoped store. Behavioral tests pass.                                                                                                                                                                          |
| `src/lib/server/services/skills/built-in-definitions.ts`            | `BUILT_INS`, `RETIRED_BUILT_INS`, `skillsForSurface`                                                                                                                                                                                       | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/server/services/skills/built-ins.ts`                       | `BuiltInSkills`                                                                                                                                                                                                                            | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/server/services/skills/library.ts`                         | `SkillLibrary`                                                                                                                                                                                                                             | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/server/services/skills/pins.ts`                            | `SkillPins`                                                                                                                                                                                                                                | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/server/services/suggestions/effects.ts`                    | SuggestionEffects                                                                                                                                                                                                                          | Explicit effect recording and restoration contract. Record-shape mapping is private to controllers; transactions remain controller-owned.                                                                                                                                        |
| `src/lib/server/services/suggestions/inbox.ts`                      | SuggestionCreationService, SuggestionReadingService, SuggestionContextService, SuggestionLifecycleService                                                                                                                                  | Explicit creation, reading, context and lifecycle contracts. Creation helpers private; clock supplied by composition. Factory outputs narrow interfaces.                                                                                                                         |
| `src/lib/server/services/telemetry.ts`                              | `traceWorkflow`, `traceOperation`, `traceAgentTurn`, `resolveLogLevel`, `logLevelEnabled`, `summarize`, `activeTraceparent`, `operationObserver`                                                                                           | Named telemetry.ts capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/server/services/todos/batch-receipts.ts`                   | `TodoBatchReceipts`                                                                                                                                                                                                                        | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/server/services/todos/catalog.ts`                          | `TodoCatalog`                                                                                                                                                                                                                              | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/server/services/todos/promise-discovery.ts`                | `PromiseDiscovery`, `promisesForResponsibility`                                                                                                                                                                                            | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/server/services/todos/promise-rules.ts`                    | `parsePromises`, `DeterministicPromiseExtractor`                                                                                                                                                                                           | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/server/services/widgets/library.ts`                        | `WidgetLibrary`                                                                                                                                                                                                                            | Named widgets capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                       |
| `src/lib/server/services/workspace/mutation-receipts.ts`            | `WorkspaceMutationReceipts`                                                                                                                                                                                                                | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/agent/model-label.ts`                             | `shortModelName`, `effectiveModel`, `compactContextLength`, `modelMetaLine`, `modelMatchesQuery`                                                                                                                                           | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/services/agent/model-selection.ts`                         | `resolveDefaultAgentModel`, `resolveDefaultVisionModel`, `resolveAgentModel`, `resolveVisionModel`, `configuredChatModels`, `modelChoiceIssue`, `resolveAttachmentVisionModel`, `configuredAgentModels`, `normalizeLanguageModelId`        | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/services/agent/payload.ts`                                 | `isAgentPayloadObject`, `agentPayloadItems`                                                                                                                                                                                                | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/services/agent/preferences.ts`                             | AgentPreferenceEditingService                                                                                                                                                                                                              | Shared validation and complete preference updates. Browser command and server settings controllers inject AgentPreferenceEditing; update helpers are private.                                                                                                                    |
| `src/lib/services/agent/run-status.ts`                              | `isTerminalAgentRunStatus`, `isRunEventStreamComplete`                                                                                                                                                                                     | Named agent capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/services/agent/tool-catalog.ts`                            | AgentToolCatalogService                                                                                                                                                                                                                    | Explicit description, settings metadata and direct/discoverable/locked partition capability. Public helper and derived globals removed; model retains static descriptions.                                                                                                       |
| `src/lib/services/agent/web-research.ts`                            | AgentRunSettingsService (services/agent/run-settings.ts)                                                                                                                                                                                   | Execution mode and research settings form a named stateless capability. Controllers resolve deployment overrides at operation time. Old function module deleted.                                                                                                                 |
| `src/lib/services/chat/chips.ts`                                    | `chipKeyOf`, `contextResourceRefOf`, `uniqueContextResources`                                                                                                                                                                              | Named chat capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                          |
| `src/lib/services/chat/mentions.ts`                                 | ChatMentionService                                                                                                                                                                                                                         | Implements ChatMentions for complete add/edit/remove/history decisions. Internal document edits are private. Data-only history constructor belongs to models; composer calls AgentContext.                                                                                       |
| `src/lib/services/deliverables/export-preparation.ts`               | ExportPreparationService                                                                                                                                                                                                                   | Asset discovery and complete renderer input through ExportPreparation. Internal traversals private; DocumentExports coordinates browser settings, assets, rendering and downloads.                                                                                               |
| `src/lib/services/diagrams/editing.ts`                              | `decideDiagramRevision`, `prepareDiagramWrite`, `diagramEtag`                                                                                                                                                                              | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/services/diagrams/labels.ts`                               | `normalizedDrawioLabels`, `searchableDrawioText`, `drawioLabelDiff`                                                                                                                                                                        | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/services/diagrams/mermaid-theme.ts`                        | `diagramKeepsOwnColours`, `mermaidTokensFor`, `createMermaidConfig`                                                                                                                                                                        | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/services/diagrams/trash.ts`                                | `decideDiagramTrash`, `diagramTrashChange`                                                                                                                                                                                                 | Named diagrams capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                      |
| `src/lib/services/memory/presentation.ts`                           | `MemoryPresentationService`                                                                                                                                                                                                                | Shared attention and visibility capability; private helpers. Browser views and server controllers receive its interface.                                                                                                                                                         |
| `src/lib/services/memory/edits.ts`                                  | `MemoryEditingService`                                                                                                                                                                                                                     | Shared creation and editing capability, injected into browser commands and server memory controller.                                                                                                                                                                             |
| `src/lib/services/notes/lifecycle.ts`                               | `NoteLifecycleService`                                                                                                                                                                                                                     | Shared creation, publication, trash and restore-placement contracts; browser and server controllers use one implementation. Private archive/placement helpers stay local.                                                                                                        |
| `src/lib/services/notes/editing.ts`                                 | `NoteEditingService`                                                                                                                                                                                                                       | Shared authored-field editing, draft comparison and save preparation through NoteEditingRules. Browser/server/skill callers receive the capability through factories.                                                                                                            |
| `src/lib/services/notes/document-presentation.ts`                   | `NoteDocumentPresentationService`                                                                                                                                                                                                          | Editor document recovery, changed-block highlighting and outline presentation. Components call NoteDocuments; Tiptap copying stays in the boundary adapter.                                                                                                                      |
| `src/lib/services/notes/folder-context.ts`                          | AgentContextSelectionService (services/agent/context-selection.ts)                                                                                                                                                                         | Folder traversal and mention candidates share an explicit capability. Component-adjacent rules removed; AgentContext exposes selection operations. Complete inventory, identity and existing candidate budgets preserved.                                                        |
| `src/lib/services/notes/note-diff.ts`                               | NoteComparisonService                                                                                                                                                                                                                      | Complete comparison returns title-aware sides, counts and focused presentation. Counting, title construction and folding helpers private. Renderer alignment remains a production capability. Components and adjacent renderer use NoteComparisons.                              |
| `src/lib/services/notes/presentation.ts`                            | `assembleNoteView`, `noteEtag`, `noteMatchesEtag`                                                                                                                                                                                          | Named notes capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                         |
| `src/lib/services/notes/reading-statistics.ts`                      | `NoteReadingStatisticsService`                                                                                                                                                                                                             | Word counts and reading estimates are shared stateless rules. Note and agent context controllers coordinate callers.                                                                                                                                                             |
| `src/lib/services/notes/references.ts`                              | NoteReferenceService                                                                                                                                                                                                                       | Explicit NoteReferences contract; recursive traversal private. Browser presentation uses NoteDocuments; server note and skill controllers receive shared contract through capability factory.                                                                                    |
| `src/lib/services/notes/section-numbering.ts`                       | NoteSectionNumberingService                                                                                                                                                                                                                | Explicit NoteSectionNumbering contract shared by browser/server. Cascade helper private. NoteDocuments presents numbers; NoteDraftEditing and ProjectActions persist menu choices.                                                                                               |
| `src/lib/services/notes/text-search.ts`                             | NoteTextSearchService                                                                                                                                                                                                                      | Implements validation, search results and document replacement through NoteTextSearch. Regex, snippet, expansion and document-layout helpers private. Browser and server controllers share the capability.                                                                       |
| `src/lib/services/projects/details.ts`                              | ProjectDetailService                                                                                                                                                                                                                       | Shared detail normalization injected into server project operations and browser command preparation.                                                                                                                                                                             |
| `src/lib/services/projects/export-entries.ts`                       | Merged into ProjectTreePresentationService                                                                                                                                                                                                 | Recursive export traversal private; complete export-entry preparation is public.                                                                                                                                                                                                 |
| `src/lib/services/projects/presentation.ts`                         | ProjectTreePresentationService                                                                                                                                                                                                             | Shared tree assembly, ancestry, subtree and export preparation. Recursive helpers private. Browser tree controller is the component entry point.                                                                                                                                 |
| `src/lib/services/projects/tree-expansion.ts`                       | Merged into ProjectTreePresentationService                                                                                                                                                                                                 | Ancestry and subtree traversal private to the cohesive tree presentation capability.                                                                                                                                                                                             |
| `src/lib/services/proofreading/rules.ts`                            | `isSpellingIssue`, `normalizeDictionaryWord`, `dictionaryWordFor`, `withoutIgnoredWords`, `proofreadSuggestion`                                                                                                                            | Named proofreading capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                  |
| `src/lib/services/provenance/presentation.ts`                       | `provenanceOrigin`                                                                                                                                                                                                                         | Named provenance capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                    |
| `src/lib/services/references/presentation.ts`                       | `assembleReferenceView`                                                                                                                                                                                                                    | Named references capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                    |
| `src/lib/services/relationships/candidates.ts`                      | `relatedNoteMatches`, `relatedNoteCandidate`                                                                                                                                                                                               | Named relationships capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                 |
| `src/lib/services/relationships/presentation.ts`                    | `assembleBacklinkView`                                                                                                                                                                                                                     | Named relationships capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                 |
| `src/lib/services/skills/manifest.ts`                               | `validatePortableSkill`, `serializeSkillManifest`                                                                                                                                                                                          | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/services/skills/metadata.ts`                               | `applySkillMetadataEdit`                                                                                                                                                                                                                   | Explicit creation, reading, editing, usage, provisioning, pin, surface-selection, portability and metadata interfaces. Private helpers and immutable released definitions preserve existing rules. Browser editor workflow moved to SkillEditor; catalog actions remain pending. |
| `src/lib/services/suggestions/presentation.ts`                      | SuggestionPresentationService                                                                                                                                                                                                              | Shared suggestion assembly, grouping and memory presentation capability injected into browser views and server controllers.                                                                                                                                                      |
| `src/lib/services/sync/indicator.ts`                                | `syncIndicator`                                                                                                                                                                                                                            | Named sync capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                          |
| `src/lib/services/sync/rebase.ts`                                   | `sameValue`, `wholeValueRebase`, `rebaseFields`                                                                                                                                                                                            | Named sync capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                          |
| `src/lib/services/sync/state.ts`                                    | `compareSyncEtags`, `resourceVersion`, `cachedSnapshot`, `resourceCurrent`, `mergeResourceStates`, `receiveResource`, `accessCache`, `accessMessage`, `visibleResources`, `localResource`, `OutboxEditingService`, `OutboxDeliveryService` | Write editing and delivery implement explicit stateless interfaces; acknowledgement is private. Cache and projection function migration remains pending.                                                                                                                         |
| `src/lib/services/sync/versions.ts`                                 | `syncEtag`                                                                                                                                                                                                                                 | Named sync capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                          |
| `src/lib/services/todos/board-export.ts`                            | `boardMarkdown`, `boardExportDate`, `boardExportSlug`                                                                                                                                                                                      | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/services/todos/creation.ts`                                | `decideTodoCreation`                                                                                                                                                                                                                       | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/services/todos/edits.ts`                                   | `applyTodoEdit`, `hasTodoEdits`                                                                                                                                                                                                            | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/services/todos/presentation.ts`                            | `assembleTodoView`                                                                                                                                                                                                                         | Resolved into explicit todo capability interfaces; internal rules and export helpers are private. Browser board export is a complete controller operation. Other browser todo actions remain pending.                                                                            |
| `src/lib/services/widgets/catalog-prompt.ts`                        | `WidgetCatalogService`                                                                                                                                                                                                                     | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/edits.ts`                                 | `WidgetEditingService`, `WidgetEvaluationService`                                                                                                                                                                                          | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/export-blocks.ts`                         | `WidgetExportService`                                                                                                                                                                                                                      | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/patches.ts`                               | `WidgetPatchService`                                                                                                                                                                                                                       | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/search-text.ts`                           | `WidgetSearchService`                                                                                                                                                                                                                      | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/sources.ts`                               | `WidgetSourceService`                                                                                                                                                                                                                      | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/widgets/trash.ts`                                 | `WidgetLifecycleService`                                                                                                                                                                                                                   | Named stateless widget interfaces implemented. Dependency composition review remains open.                                                                                                                                                                                       |
| `src/lib/services/workspace/commands.ts`                            | `mutationResource`, `noteCommand`, `assertWorkspaceWriteIdentity`, `noteHasUnpublishedChanges`, `workspaceResourceKey`, `isWorkspaceRecord`, `workspaceRecordIdentity`                                                                     | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/workspace/initials.ts`                            | `initialsOf`                                                                                                                                                                                                                               | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/workspace/sidebar-width.ts`                       | `clampPreferred`, `effectiveSidebarWidth`                                                                                                                                                                                                  | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/workspace/startup.ts`                             | `workspaceReadiness`                                                                                                                                                                                                                       | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/workspace/today.ts`                               | `assembleToday`                                                                                                                                                                                                                            | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |
| `src/lib/services/workspace/write-review.ts`                        | `writeTitle`, `writeGroup`, `writeStatus`, `writeExplanation`, `visibleReviewFields`, `hasReviewContent`                                                                                                                                   | Named workspace capabilities; private helpers, boundary adapters and state require semantic review. Pending.                                                                                                                                                                     |

### State owners and remaining work

- Process active-run handles: `server/stores/agent/active-runs.ts`; controllers perform abort after durable cancellation. Identity-safe release preserved.
- Process run subscriptions: `server/stores/agent/events.ts`; application factory exposes `AgentEventBus`.
- Catalog models and timestamp: one snapshot in `server/stores/agent/model-catalog.ts`; refresh and existing stale-cache behavior in `server/controllers/agent/model-catalog.ts`.
- Per-user admission and recent timestamps: `server/stores/inline-suggestions/admission.ts`; the admission controller reserves synchronously.
- All other state fields, controller members, factory dependencies and component edges retain pending semantic-review status in the inventory. No whole subsystem is complete.

### Verification observed so far

- Baseline: lint, check, architecture and unit passed (522 files; 4,185 passed, one skipped).
- Implementation: type check, lint and docs check passed. Strict shared-layer source audit passed at zero violations.
- Full verification attempt: unit 524 files / 4,189 passed / one skipped; browser 85 files / 565 passed; isolated contracts 108 files / 522 passed.
- E2E: interrupted after ten failures (palette, approvals, selection context), 19 passes, one interrupted test and 75 not run. PWA did not run in that chained invocation.
- Palette and approval-card failures reproduce on untouched merged baseline `f582707e`, in a separate owned baseline worktree (since removed). Selection-context failures have not been baseline-compared.
- Test app used temporary port 5187 to avoid another worktree on 5173. The original Playwright configuration was restored. Baseline comparison used 5188. Standard authenticated test setup and fake/disabled model transports; no live LLM validation.
- Production web/worker build and build-output audit passed.
- Latest focused tests after admission/state changes: 29 files / 261 passed.
- Separate PWA result: 13 passed, 15 failed; baseline comparison remains pending.
- Architecture remains failing. Do not weaken it: browser factory access, shared-controller composition and server-store/reader classification need resolution, followed by the application-wide rules and zero-violation migration.
- No PR opened or pushed. No full completion claim.

## Maintenance ownership and current verification

- Scheduler execution moved to `server/controllers/maintenance/scheduler.ts`. Its factory only
  constructs it; the worker starts it explicitly. Timers, executions and lifecycle live in
  `server/stores/maintenance/scheduler.ts`. Shutdown remains permanent and drains active work.
- Upload retention and durable attachment-object removal moved to attachment controllers.
  Upload traversal and embedding maintenance progress now have worker-scoped stores. Existing
  limits, cleanup order, transaction boundaries, failure reporting and retry behavior remain.
- Maintenance verification: 6 files, 31 passing tests. Type checking passes with no warnings.
- The PWA run finished: 13 passed, 15 failed. Several failures occur before offline interaction
  (sidebar click interception or unavailable editor), but their baseline status is unverified.
  Do not call these verified pre-existing failures. Traces remain in ignored `test-results/`.
- Latest architecture run: topology, source and test-quality audits pass. Chisel fails on browser
  factory construction, shared controller composition, new state-store classification, repository
  interface placement and a missing colocated admission service spec. The spec was subsequently
  added for exact window expiry and retry eligibility; the full check must be rerun.
- The complete ADR 0007 implementation is still unfinished. No phase-wide checkbox is complete.
  All other service families, browser workflow migrations and comprehensive AST enforcement remain
  pending, along with browser failure investigation and final required PR checks.

### Latest checked checkpoint

- Fresh unit suite: 525 files; 4,193 passed and one pre-existing skip.
- Lint and docs check passed. Maintenance-related isolated contracts: 3 files, 12 passed.
- Production web and worker builds plus the client build-output audit passed after maintenance migration.
- Widget combined edits now preserve data-shape failure precedence over a layout patch failure.
  This correction has 55 passing focused widget/rebase/tool tests, including the new regression case.
- Current symbol inventory: 64 shared-service modules with 184 exported values (8 classes),
  and 104 server-service modules with 191 exported values (81 classes). Values include constants,
  so these totals are not directly comparable with the planning baseline's function-only counts.
  Inventory contains 10,959 rows and 12,360 resolved import edges; semantic resolution is pending.

- After the widget failure-order correction: type checking and lint pass; widget write contracts
  pass (9 tests). Architecture still fails with 11 Chisel errors and one classification warning.
  The previously missing admission service spec is resolved. No remaining violation is waived.
- This is a local implementation checkpoint, not the requested complete follow-up PR. No PR has
  been opened and no branch has been pushed. The whole-application scope remains outstanding.

## Search and tokenizer continuation (2026-10-10)

- Replaced lazy service tokenizer singletons and factory counting closures with the named
  `Cl100kTokenizer` adapter and model-owned `TokenCounter`/`TokenCodec` contracts. The application
  graph constructs one vocabulary and shares it with indexing, embeddings, agent context,
  inline context, persisted agent files and replay. MCP surface construction captures the same
  adapter instead of constructing a vocabulary for every request. Test composition shares one
  real adapter per test process.
- An initial per-consumer construction attempt exhausted the existing 1 GB unit-test heap.
  The corrected lifetime passed the full suite without changing the memory limit. This was an
  implementation regression, not a baseline failure.
- Made the chunker and content hash private indexing implementation. Controllers and factories
  depend on named indexing/completion interfaces. Existing chunk/overlap settings and persisted
  identities are unchanged. Chunk tests now inspect content written through indexing operations.
- Agent context, inline context, knowledge lookup, pending-index reads and tool-index maintenance
  now have explicit interfaces. Public search and tool-index helper exports were removed where
  migrated. Retrieval tests preserve source identity, query preparation and invalid-vector errors.
  Tool-index tests verify stored-vector reuse rather than invoking private hash helpers.
- Chisel now classifies server state stores and SDK adapters. Controllers may use state stores;
  services still may not. Factories construct adapters, while services receive their interfaces.
  Five fixtures cover allowed construction and rejected dependencies. This does not resolve the
  existing browser-to-service allowances; removing those remains required work.
- Upload ownership/cursor records now live in models. Retention and object-removal controllers
  receive narrow contracts rather than importing repository interfaces.
- Latest symbol snapshot: 64 shared-service modules, 184 exported values (8 classes); 104 server
  service modules, 170 exported values (81 classes). Counts include constants. The inventory has
  10,973 rows and 12,390 resolved import edges. All untouched entries remain pending.
- Verified during this continuation: full unit suite 525 files, 4,199 passed and one skipped;
  isolated database contracts 108 files, 522 passed; focused search/MCP tests 18 files, 140 passed;
  type checking and lint passed. Fresh verification after the final search changes also passed:
  unit 525 files / 4,199 passed / one skipped; browser 85 files / 565 passed; isolated contracts
  108 files / 522 passed. Docs check, production web/worker build and build-output audit passed.
  E2E/PWA were not rerun during this continuation; their earlier unresolved failures still apply.
- Architecture: topology, strict source and test-quality audits pass. Chisel still reports eight
  errors and one warning in browser/widget factory access, shared controller composition and
  candidate-reader classification. No allowances or migration baselines were added for these.
- Still unresolved: agent-file note conversion callback, conversation/session orchestration and
  state, provider parsing and rendering callbacks, remaining service families, browser workflows,
  complete symbol enforcement, browser failure investigation and required PR checks. No whole
  phase is complete, and the requested single follow-up PR has not been opened or pushed.

## Browser synchronization continuation (2026-10-10)

- Moved lane scheduling, resource downloads and mutation submission out of client infrastructure
  into synchronization controllers. Account-scoped stores own lane promises, retry records,
  subscriptions, cached projections, download attempts and queue observations. Factories expose
  controller interfaces. The mutation controller no longer exposes its execution collaborator.
- Moved durable outbox transitions and cache commits into controllers. IndexedDB adapters expose
  transaction-local reads and writes; transition computation stays inside the same transaction.
  Sequence allocation, coalescing, acknowledgement, cache replacement and receipts remain atomic.
  Boundary validation still rejects invalid local input before opening the transaction, so a bad
  draft does not mark storage as corrupt or consume a sequence. The first extraction regressed
  this distinction; the existing browser regression caught it and the correction passes.
- Added `OutboxEditingService` and `OutboxDeliveryService` with explicitly implemented contracts.
  Write ancestry coordination now invokes rebase operations in a synchronous controller. The
  acknowledgement helper is private; its tests exercise public receipt settlement. Cache and
  projection functions in this module still require conversion and consumer migration.
- Added teardown regressions for delayed successful lane results, delayed read failures and
  delayed failed submissions. Stopped accounts do not regain cached records or retry state.
- Removed Chisel's blanket browser/store/component-to-shared-service permission. Added fixtures
  for component controller factories, injected controller contracts, rejected service access,
  rejected controller construction and shared input adapters. The widget candidate reader now
  lives under `adapters/widgets/` and remains the shared browser/server input implementation.
- Verified before the stricter checker change: type checking and lint pass; node-focused sync
  tests pass (20 files, 163 tests); browser sync tests pass (9 files, 97 tests); full unit suite
  passes (526 files, 4,206 tests, one skip); full browser suite passes (85 files, 565 tests).
  Boundary fixtures subsequently pass (20 tests). Build, contracts, docs and end-to-end checks
  have not been rerun for this continuation.
- Current architecture run: topology, strict source and test-quality audits pass. Chisel reports
  94 prohibited import edges and zero classification warnings after removing the permission.
  These are unresolved migrations, not allowances or a baseline. Stores still orchestrating
  work, component presentation access and client wrappers must move behind controllers.
- Regenerated inventory: 65 shared-service modules, 173 exported values (11 classes); 104 server
  service modules, 170 exported values (81 classes); 11,352 rows and 12,435 resolved import edges.
  The full task remains incomplete. No whole phase is checked off and no PR has been opened.

## Account, editor and model capability continuation (2026-10-10)

- Moved browser account startup, synchronization, sign-out, damaged-storage recovery and optional
  preference opening into `WorkspaceSessions`. Browser cookies, storage and event listeners stay
  in the session environment adapter. `WorkspaceSessionStore` owns the account generation,
  startup promise, current session and listener disposer. Seven account lifetime regressions cover
  shared startup, account replacement, teardown, corruption and account-specific reset.
- Moved editor save sequencing and generation checks into `EditorSessions`, with mutable editor
  state in `EditorSessionStore`. The five existing editor race tests remain intact.
- Added explicit model selection and model-choice service interfaces. Agent execution/settings,
  attachment processing, diagram generation and browser session controllers receive these
  capabilities through composition. Canonical model identifiers and synchronization versions are
  branded value constructors in models. The source checker accepts local scalar construction and
  rejects external lookups, side effects and mutable procedure state; it does not prove domain
  cohesion or permit business rules in models.
- Moved workspace reads, durable editing, conflict recovery and account observation into workspace
  controllers. Components receive `WorkspaceResourcesController`, `WorkspaceDraftController` and
  `ResourceViewController`, not concrete mutable classes. Internal projection callbacks are
  private. Factories construct the graph; initialization starts observation. Account, editor,
  observation and record-index state now have explicit stores. Shared projection data and view
  aliases live in models. The broad cross-feature presentation contract and remaining command
  preparation helpers still require semantic migration.
- Preserved independent reactive lifetime signals. An initial combined state snapshot made a
  cache update invalidate the account-lifetime effect and close the review dialog. Browser tests
  caught the regression; separate state signals corrected it. The seven review tests pass.
  Added a delayed-save teardown regression so a completed old-account write cannot repopulate an
  editor. Tests use repository observation and saved intents instead of private capture callbacks.
- Moved workspace behavior specs beside their controllers and updated the browser suite inventory.
  Construction no longer starts subscriptions; fixtures now explicitly initialize their account.
- Verification before the workspace extraction: unit 527 files / 4,220 passed / one skip;
  browser 85 files / 565 passed; isolated contracts 108 files / 522 passed. After extraction,
  type checking passes. Focused node workspace tests pass (45 tests before the additional teardown
  case); resource browser tests pass (38 tests), and review browser tests pass (7 tests). Fresh full verification now passes: unit 527 files / 4,227 passed / one skip; browser 85 files /
  565 passed; isolated contracts 108 files / 522 passed. Docs check, production web/worker build
  and build-output audit pass. Two replacement-workspace fixture failures found in the first full
  run were corrected by initializing after seeding, then both full suites were rerun. E2E/PWA
  have not been rerun in this continuation and retain the previously recorded unresolved status.
- Latest architecture run: topology, strict source and test-quality audits pass. Chisel reports
  91 remaining prohibited edges and no warnings. No migration baseline or suppression was added.
  Full AST enforcement, remaining shared/server capabilities, browser feature workflows,
  authenticated E2E/PWA investigation and final PR checks remain outstanding.
- Regenerated inventory: 64 shared-service modules, 165 exported values (13 classes); 104 server
  service modules, 170 exported values (81 classes); 11,030 rows and 12,503 resolved import edges.
  The scanner now distinguishes actual `.svelte.ts` modules from virtual Svelte script files,
  correcting the earlier classification of rune stores as components.
  Export totals include constants. These counts do not establish that every capability is resolved.

### Workspace boundary and preparation follow-through

- Browser time, operation identity, Svelte proxy snapshots and reactive observation now live in
  `BrowserWorkspaceEditingEnvironment`. The workspace controllers are ordinary TypeScript and
  receive this boundary adapter through their factory.
- `WorkspaceCommands.prepare` owns inventory resolution and complete optimistic preparation.
  Widget editing and lifecycle capabilities are factory-injected. Preparation, creation and trash
  helper functions are private. Existing parity tests now exercise the controller through fixture
  input adapters rather than importing production helpers.
- Corrected a test fixture that represented a memory command without its required sharing choice.
  The omitted-choice default remains covered at the actual memory creation rule boundary; the
  workspace command test supplies the already-resolved choice. No product default changed.
- Type checking passes. Focused controller, browser, domain and server parity tests pass: 71 files,
  476 tests. The previous boundary-only extraction passed 32 files / 189 tests. Architecture still
  fails at 89 Chisel import edges; topology, source and test-quality audits pass. Full final
  verification remains required after the remaining application migration.

## Memory capabilities and interface enforcement — 2026-10-10

- Split MemoryLibrary into stateless reading, writing, deletion and proposal classes. Each
  explicitly implements its capability interfaces. Factories expose narrow interfaces; agent,
  diagram and inline-suggestion dependencies no longer use Pick of the concrete library.
- Shared memory editing, visibility and notification rules now have class interfaces. Controllers
  receive them through factories. Ownership, active-project checks, locked edits, provenance and
  replacement metadata remain covered. Proposal-specific rule unification still needs review.
- Strengthened Chisel's interface check to cover every exported service class, regardless of name,
  and require explicit implementation of locally declared interfaces. A matching but unused
  interface no longer passes. Private operation-local evaluators remain valid. The 25 boundary
  fixtures pass. Updated all three SvelteKit skill copies.
- Type checking passes with zero errors/warnings. Focused tests pass: 47 files / 260 tests;
  database contracts pass: 7 files / 30 tests. Architecture remains incomplete: 89 prohibited
  imports and 48 newly detected missing explicit contracts. No allowance or migration baseline
  was added. Topology, source and test-quality audits pass.
- Regenerated inventory: 64 shared modules, 163 value exports (15 classes); 103 server modules,
  173 value exports (84 classes). 11,071 inventory rows and 12,527 resolved import edges.
  Full final verification is still pending.

## Suggestion capabilities — 2026-10-10

- Split the concrete inbox into creation, reading, context and lifecycle services with explicit
  interfaces. Production creation helpers became private; fakes construct their own valid values.
  Effects implement their recording/restoration contract. Factories no longer expose concrete
  inbox or effect classes. Controller-owned approval/undo transactions are unchanged.
- Shared suggestion presentation now has one stateless class interface, used by browser views and
  server note/suggestion controllers. No new defaults, limits or stored fields were introduced.
- Type checking passes at zero errors/warnings. 48 focused node files / 403 tests and 14 isolated
  database contract files / 64 tests pass. After presentation wiring, 61 focused node/browser files
  / 361 tests pass. Lint passes. Architecture still fails on unresolved application boundaries;
  the last check reported 89 import edges and 46 missing contracts. No phase is complete.

## References, relationships and diagram execution — 2026-10-10

- Reference and relationship factories expose narrow reading/writing/classification interfaces.
  Reconciliation remains limited to document mentions; inferred links and semantic-edge identity
  are preserved. Unused deletion methods and a test-only creation wrapper were removed. Search
  options are model data. No controller reaches a repository merely to import that data type.
- Diagram generation now has a controller operation, execution-scoped state store and SDK adapter.
  Queues, pending decisions, cancellation and completion state belong to the store. Controllers
  resolve/reject continuations, own cancellation and close the provider on every exit. Factories
  only construct. Provider-event and submission readers moved to adapters. The source audit's
  designated tool-protocol location moved with the SDK adapter; service files gained no exemption.
- Adapter/controller contract fixtures verify type-only interface implementation and reject
  implementation construction. The Chisel rule now includes the adapter layer in that existing
  contract permission. Runtime controller dependencies remain forbidden in adapters.
- Reference/relationship tests pass: 19 files / 85 tests; isolated contracts: 8 files / 32 tests.
  Diagram controller tests pass: 7 files / 35 tests; contracts: 6 files / 33 tests. Provider failure cleanup
  and independent cancellation were added. Adapter/boundary tests pass: 3 files / 60 tests.
- Full unit run passes: 528 files / 4,237 passed, one skipped. Type check passes at zero errors and
  warnings; lint passes. Architecture remains incomplete: 90 import violations and 40 missing
  contracts. Moving provider readers exposed the existing AgentReasoning boundary dependency;
  its SDK/controller separation is still pending. Topology/source/test-quality audits pass.
- Inventory: 64 shared service modules, 160 value exports (16 classes); 99 server service modules,
  173 value exports (87 classes); 11,116 rows and 12,535 resolved import edges. Conversation-buffer
  and replay-virtualization boundaries are the next execution subsystem under review.

- Verification correction: restored the pre-existing diagram settlement spec after detecting a
  destination-name collision during the protocol test move. Protocol tests now use the distinct
  `session-protocol.spec.ts` name. The full-unit result above is the rerun with both concerns
  present; no existing settlement scenarios were removed.

## Conversation history and replay — 2026-10-10

- ConversationSessionStore owns loaded history and the provider-view cache. ConversationSessions
  coordinates loading, parsing facts, replay, SDK edits and snapshot virtualization. The SDK
  Session adapter parses incoming provider items and encodes outbound items through the same stored
  representation used by persistence. Factories construct these dependencies without executing them.
- ConversationHistoryService retains image stripping and diagram replay rules. Failed diagram calls
  keep their complete source. Active-turn images remain available until persistence. Public text
  conversion helpers were removed; tests exercise history preparation and the complete session.
- Replay virtualization has explicit preparation/application contracts. ConversationReplay resolves
  JSON arguments through the boundary schema before calling rules. Existing token thresholds,
  file identities and diagram/reasoning exclusions are unchanged. Private recursive traversal is
  operation-local. AgentReasoning's broader SDK/execution coordination remains pending.
- Type check passes. Focused agent/controller/history/image tests pass: 20 files / 171 tests.
  Isolated agent and agent-file database contracts pass: 10 files / 58 tests. Lint passes.
  Architecture remains at 90 prohibited imports and 38 missing interfaces; topology, source and
  test-quality checks pass. No inventory phase is complete.
- Inventory now records 64 shared service modules / 160 value exports (16 classes), 99 server
  modules / 171 exports (87 classes), 11,149 rows and 12,559 resolved import edges.

## Run contracts and attachment operations — 2026-10-10

- Run approvals, cancellation, checkpoints, ledger and note-action submission explicitly implement
  their narrow contracts. Controllers and factories depend on those interfaces. The duplicate
  submission error now belongs to the common error module. API-token hashing is private.
  Focused run tests pass: 33 files / 325 tests; isolated contracts: 17 files / 98 tests.
- Browser attachment actions own reservation, checksum/byte transfer, completion and synchronization.
  The list, note editor and todo description call the controller. Upload rules preserve paths and
  media defaults. Account replacement/stop rejects late results before completion or synchronization.
  The removed adjacent upload tests were retained as controller scenarios; test discovery is verified.
- Server attachment capabilities separate upload, reading, download and lifecycle contracts.
  Completion and todo linking remain atomic. Removal keeps revision snapshots and commits cleanup
  intent without removing bytes inside the transaction. Factories expose interfaces.
- Processing rules, format eligibility and image instructions are stateless capabilities. The
  processing controller coordinates them with text, OCR and vision adapters. Provider schemas live
  in models, conversion helpers are private, and the parser registry no longer hides coordination.
  The S3 repository owns connection/bucket mechanics. No stored format or timeout changed.
- Type checking passes with zero errors/warnings. Attachment tests pass: 21 files / 94 tests;
  isolated database contracts: 7 files / 32 tests. Architecture remains incomplete at 90 import
  violations and 28 missing interfaces; topology, source and test-quality audits pass. Lint passes. Full unit verification passes: 531 files / 4,249 passed and one skipped.
  Final application/browser/PR checks remain pending.
- Inventory: 65 shared modules / 161 value exports (17 classes), 97 server modules / 163 value
  exports (87 classes), 11,178 inventory rows and 12,586 resolved import edges. No phase is complete.

## Project contracts and shared tree rules — 2026-10-10

- Project factories expose creation, reading, editing, lifecycle and tree persistence interfaces.
  Archive retains the project-only visibility boundary. Move still reads under the project lock
  and writes resolved ordering inside the controller transaction. Private lookup helpers remain local.
- Shared project detail, placement and tree presentation services implement explicit interfaces.
  Browser and server controllers receive the same rules. Ancestry, subtree and recursive export
  helpers are private. Project tree components call a browser presentation controller.
- Type check passes at zero errors/warnings. Focused project, workspace and browser tests pass:
  48 files / 245 tests. Isolated project, note and synchronization contracts pass: 35 files /
  189 tests, including concurrent tree writes. Lint passes. Architecture remains incomplete:
  87 prohibited imports and 27 missing interfaces; topology, source and test-quality audits pass.
- Browser project action workflows still live in the action store. Their migration, remaining
  feature families, full enforcement and final verification are pending. No phase is complete.

## Browser project actions — 2026-10-10

- ProjectActions owns local creation/editing, remote moves/deletion, synchronization and failure
  outcomes. The former action store retains only account-bound status and controlled updates.
  A browser adapter preserves framework error messages; transport calls live behind a narrow port.
- Rename dialogs hold a ProjectNameEditor with readonly values and a complete rename operation.
  They no longer receive capture/stage/read or mutable draft state. Other note-editor draft access
  remains pending in its own feature migration.
- Actions check both session identity and account identity after awaits. A stopped/replaced account
  cannot receive a late synchronization or error. Concurrent actions retain busy status until all
  current-account operations settle. Controller tests retain a full offline rename in the outbox
  before success and reject an editor captured before account stop.
- Focused controller/workspace/browser tests pass: 34 files / 194 tests. Type check passes with
  zero errors/warnings. Lint passes. Architecture remains incomplete at 86 prohibited imports and
  27 missing interfaces; topology/source/test-quality audits pass. Whole-application final
  verification is still pending. The next browser workflow under review is durable note-action
  submission and its retained request identities.

## Durable browser note submissions — 2026-10-10

- NoteSubmissions owns read → identity decision → persist → submit → acknowledge. Browser storage
  adapters only read/write and parse candidate/persisted shapes. NoteActionIdentityService owns
  selection and normalized diagram intent matching. Session-storage keys and values are unchanged.
- NoteActions owns submission and draw.io review operations. Its store retains account-bound error
  and review-running status only. The note component sees a controller interface. Late receipts and
  failures do not publish after account/session replacement. A valid late receipt can release only
  its original account's retained request, without populating the replacement account.
- Moved the existing browser identity scenarios to complete controller operations and retained all
  scenarios. Corrupt storage still blocks submission; lost receipts retain identities; successful
  receipts release them. Added account-stop/replacement cases and complete-intent identity checks.
  SuggestionArtifact is now shared model data; draw.io acceptance narrows the actual artifact.
- Type check passes with zero errors/warnings. Focused node/browser tests pass: 34 files / 259 tests.
  Isolated suggestion/agent/diagram contracts pass: 20 files / 112 tests. Lint passes. Architecture
  remains at 85 prohibited imports and 27 missing interfaces; topology/source/test-quality pass.
- Inventory: 65 shared modules / 160 value exports (21 classes), 96 server modules / 166 value
  exports (91 classes), 11,371 rows and 12,645 resolved imports. The note run-stream store, its
  registry and component result handling remain pending. No phase is complete.

## Note action replay and editor lifetime — 2026-10-10

- NoteActionRuns owns stream delivery, synchronization, persisted cursors, cancellation and replay.
  NoteActionRunStore owns editor entries and continuation handles only. The global registry is
  removed; the tracking controller opens editor-scoped instances through a construction factory.
  Workbench routing already prevents the same note occupying both panes.
- Account replacement and editor teardown prevent late delivery or cursor acknowledgement.
  Closing releases handlers and subscriptions while leaving recovery records in session storage.
  A terminal event delivered during stream opening closes its new stream. Handler failures retain
  the original cursor so the subscription can replay them.
- The event boundary validates each action's result into a discriminated type. Components no longer
  cast JSON payloads into promise, reference or diagram results. The wire and storage formats remain
  unchanged. Component application sequencing still needs the broader note-editor migration.
- Focused node/browser tests pass: 12 files / 85 tests, including existing subscription/recovery
  cases, late synchronization, pending handler teardown and invalid payloads. Type checking passes
  with zero errors/warnings and lint passes. Architecture remains incomplete at 84 prohibited imports
  and 27 missing interfaces; topology/source/test-quality audits pass. No phase is complete.

## Note history and presentation — 2026-10-10

- NoteHistory coordinates list/read operations and guards stale selections, cancelled dialogs and
  account replacement. Its store exposes controlled state updates only; components receive a
  readonly controller. The remote reader is a boundary adapter and the factory only constructs.
- NotePresentationService supplies browser/server note surfaces and the preferred history snapshot.
  The publication token is a scalar branded value constructor in the note model. Token spelling,
  publication guards and newest-first revision preference remain unchanged.
- Full unit verification passes: 536 files / 4,279 passed / one skipped. Type check passes with
  zero errors/warnings and lint passes. Focused history/workspace/note tests pass: 61 files / 383
  tests. Isolated note/skill/sync contracts pass: 29 files / 128 tests. Architecture remains at 84
  prohibited imports and 27 missing interfaces; topology/source/test-quality pass. No phase is complete.

## Server note capabilities — 2026-10-10

- Split NoteCatalog into reading, editing, lifecycle, revision reading/writing, publication, anchor
  repair and creation capabilities. Each class explicitly implements narrow interfaces. Private
  record/project lookups remain local helpers. Factories expose interface-typed capability groups;
  controller dependencies no longer use Pick of the concrete catalog.
- Kept project/note lock ordering, children-first deletion, ownership checks, publication guards,
  revision retention and attachment snapshot restore intact. SelectionOrigins now implements its
  contract; its decision helper is private. The in-memory selection fake uses the real capability
  over the fixture's shared transaction participants instead of importing production helpers.
- Type check passes with zero errors/warnings and lint passes. Focused controller/service tests
  pass: 63 files / 440 tests. Isolated contracts pass: 69 files / 322 tests, covering note, skill,
  project, diagram, reference, relationship, todo and synchronization behavior. Architecture remains
  incomplete at 84 prohibited imports and 25 missing interfaces; topology/source/test-quality pass.
  Shared note editing/lifecycle rules, broader editor operations and remaining families are pending.

## Shared note editing and lifecycle — 2026-10-10

- NoteLifecycleService implements separate creation, trash and publication contracts; the old public
  function modules are removed. NoteEditingService implements authored-field updates, draft equality
  and save preparation. Browser command preparation, server notes, project folders and skill writes
  receive those rules through factories. Internal recursive and placement helpers remain private.
- Command preparation still establishes inventory before resolving restore placement or creation.
  Server controllers retain authoritative reads and atomic writes. Error messages, publication tokens,
  revision checks, missing-parent restoration and optimistic command shapes are unchanged.
- Type check passes with zero errors/warnings and lint passes. Focused tests pass: 82 files / 538
  tests. Isolated note/skill/project/sync contracts pass: 52 files / 244 tests. Architecture remains
  at 84 prohibited imports and 25 missing interfaces; topology/source/test-quality audits pass.
  Other note presentation, document, search and editor workflows remain pending.

## Note document presentation — 2026-10-10

- NoteDocuments coordinates recoverable document preparation with the Tiptap copy adapter. The
  editor and diff editor call its interface; the component-adjacent conversion helper is removed.
  The prior JSON-copy audit exception moved with the actual adapter. It preserves the same parsed
  domain-to-Tiptap widening and proxy-copy behavior; no migration exception was added.
- NoteDocumentPresentationService groups document recovery, text/type highlighting and outline
  decisions. Recursive helpers remain private. The unsupported-block inspector used only by corpus
  tests moved to test fixtures; corpus/schema checks still inspect the boundary's real output.
- Node/corpus tests pass: 17 files / 159 tests / one existing skip. Real note component browser tests
  pass: 13 files / 101 tests. Type check passes with zero errors/warnings and lint passes. A missed
  diff-editor import found in the first browser run was corrected before rerunning that suite.
  Architecture remains incomplete at 81 prohibited imports and 25 missing interfaces;
  topology/source/test-quality pass. No whole phase is complete.

## Reading statistics and selection presentation — 2026-10-10

- NoteReadingStatisticsService owns the existing word-count and reading-time rules. NoteDocuments
  serves reading estimates to the component. AgentSelectionContext coordinates counts with
  SelectionContextService for pinned and live context, preserving range identities and dismissal.
  The selection-chip store helper is removed; the no-selection state is explicit model data.
- Existing selection scenarios now exercise controller operations, including no highlight, repeat
  pin identity and suppression. Node tests pass: 10 files / 76 tests. Chat/note browser component
  tests pass: 23 files / 174 tests. Type check passes with zero errors/warnings and lint passes.
- Architecture remains incomplete at 79 prohibited imports and 25 missing interfaces;
  topology/source/test-quality pass. Broader chat mutable state and context handoff remain pending.

## Note draft operations and composer context — 2026-10-10

- NoteDraftEditing persists authored fields, pin changes and numbering against the editor's captured
  ancestry. The note component no longer assembles those commands. Numbering is one shared service
  contract, wired into browser and server views and project actions. Broader editor workflows remain.
- Folder context and mention candidates now belong to AgentContextSelectionService. ChatMentionService
  owns token edits and undo/redo decisions. AgentContext exposes these operations to the composer;
  the component-adjacent rule module is removed. Existing candidate limits and complete-inventory
  checks are unchanged. ChatStore still needs its broader workflow and state separation.
- The model audit now accepts nested data constructors containing literal arrays, while rejecting
  calls inside those arrays. This permits the empty mention-history constructor without granting a
  procedure exception. All 109 source-rule fixtures pass.
- Type check and lint pass. Note/project/workspace tests pass: 69 node files / 461 tests and 52
  focused unit files / 383 tests. Note/project browser tests pass: 18 files / 117 tests. Isolated
  note/project/skill/sync contracts pass: 52 files / 244 tests. Context/mention/draft tests pass:
  14 files / 103 tests; chat browser tests pass: 10 files / 73 tests.
- Architecture remains incomplete at 71 prohibited imports and 25 missing interfaces. Topology,
  source and test-quality audits pass. No full phase or final verification is complete.

## Note references, deletion and comparison — 2026-10-10

- NoteReferenceService groups authored links and embedded diagram/widget discovery behind an explicit
  interface. Recursive traversals are private. Notes and Skills controllers receive the capability;
  galleries and export presentation call NoteDocuments. Broader export workflows remain pending.
- Permanent deletion preparation moved into NoteLifecycleService. Controllers still lock and commit
  deletion; children-first ordering and hidden-skill protection are unchanged.
- NoteComparisons returns complete title-aware comparison sides and counts, including folded context.
  Components no longer sequence title construction, diff, count and focus. The editor's DOM decoration
  adapter calls the controller for alignment and stored text layout. Comparison data now has a model
  domain; inline-atom and textblock values are data. Internal helpers are no longer exported.
- Existing comparison scenarios exercise complete comparison results. Removed the test that manually
  supplied an impossible mismatched intermediate classification to the now-private folding helper;
  rendered-document mismatch rejection remains covered by public alignment tests.
- Type check and lint pass. Reference/controller tests pass: 34 files / 227 tests; browser notes,
  widgets and diagrams: 16 files / 127 tests; isolated contracts: 52 files / 244 tests. Lifecycle/note
  tests pass: 35 files / 272 tests. Final shared note tests pass: 13 files / 130 tests; comparison,
  note, review and approval browser tests pass: 23 files / 162 tests.
- Architecture remains incomplete at 65 prohibited imports and 25 missing interfaces. Topology,
  source and test-quality audits pass. No phase is complete; note search and browser replacement
  coordination are the next note subsystem under review.

## Search and durable replacement — 2026-10-10

- NoteTextSearchService exposes complete search and replacement rules. Regex construction, snippet
  windows, capture expansion and text traversal are private. Helper tests now exercise returned search
  results and replaced documents. Existing sixty-character context, match offsets and replacement
  semantics are unchanged.
- GlobalSearch owns debouncing, query validation, local projection and multi-note replacement.
  NoteReplacements captures all reviewed bodies before writing and retains explicit partial results.
  GlobalSearchStore retains inputs, result state, collapse state and timer handles only. Browser
  snapshot copying stays in a Svelte adapter; factories expose a readonly controller interface.
- Replacement stops later writes after account replacement and does not publish a late report into
  the new account. Delayed search callbacks are account-bound. New lifetime scenarios use the real
  in-memory outbox and scheduler. Broader workbench navigation/reveal coordination remains pending.
- Search-panel tests seed real project/note records instead of assigning fabricated derived hits.
  Added the application stylesheet for long-snippet click-through; the selected second match is at
  offset 147 in the seeded text. All 12 panel tests pass, including confirmation before writes.
- Full unit verification passes: 538 files / 4,291 passed / one existing skip. Focused search/note
  tests pass: 43 files / 335 tests. Isolated note/skill/sync contracts pass: 45 files / 216 tests.
  Type check and lint pass. Architecture remains incomplete at 62 prohibited imports and 25 missing
  interfaces; topology/source/test-quality pass. No full implementation phase is complete.
- Regenerated inventory: 62 shared modules / 124 value exports (33 classes); 95 server modules /
  171 value exports (98 classes). 11,627 rows and 12,869 resolved imports. Final browser, build and
  PR checks remain pending. Server todo capabilities are next under review.

## Todo capabilities and board export — 2026-10-10

- Split the server catalog into creation, reading, editing, lifecycle and context capabilities.
  Batch receipts and promise extraction implement explicit contracts. Factories expose interfaces;
  controller transactions retain authorization, linked-note checks and lock ordering. Promise
  parsing is private and responsibility selection belongs to the existing extraction rules.
- TodoEditingRulesService supplies creation and edits to browser and server; TodoPresentationService
  supplies the same view decisions. TodoBoardExportService returns complete Markdown and filenames,
  keeping slug, date and serialization helpers private. Existing content and filtering are unchanged.
- TodoBoardExports owns synchronous Markdown download and asynchronous PDF export. The component
  calls its readonly interface. Input parsing, transport and download mechanics are narrow adapters;
  the store retains request count and lifetime state only. Closed boards and replaced accounts
  suppress late downloads. Malformed filters fail before transport; PDF failures release busy state.
- Type check and lint pass. Focused todo/workspace tests pass: 92 files / 646 tests. Board export
  tests pass: 17 files / 109 tests. Browser note/todo/search tests pass: 16 files / 121 tests.
  Isolated database contracts pass: 46 files / 248 tests. Architecture remains incomplete at 61
  prohibited imports and 22 missing interfaces; topology, source and test-quality checks pass.
- Inventory: 61 shared modules / 120 exported values (36 classes); 93 server modules / 173 exports
  (102 classes), 11,680 rows and 12,892 resolved imports. Remaining todo browser actions, skill
  capabilities, other families and whole-application final verification remain pending.

## Skill capabilities and editor operations — 2026-10-10

- Split SkillLibrary into creation, reading, editing and usage classes with explicit contracts.
  Built-in provisioning, surface selection and pins also implement narrow interfaces. Factories
  expose interfaces; released definition bodies remain immutable configuration. Catalog locks,
  note-before-metadata locks, ownership, portable names and untouched built-in upgrades are unchanged.
- SkillPortabilityService validates and prepares complete exports. SkillMetadataEditingService
  supplies browser/server metadata edits. Serialization and validation helpers are private; tests
  exercise complete exported documents. The agent obtains surface skill names through its injected
  built-in capability instead of importing the selection function.
- SkillEditor owns autosave, metadata/body writes, retry, conflict choices, import and export.
  Its store owns the editor's retained state and timer handle. The component retains rendering,
  focus and local rich-text input. File transport/download are adapters. Editor close/account stop
  prevents later file submission or download; newer typing blocks stale import adoption.
- Added eleven complete editor scenarios using real in-memory workspace persistence, including
  partial-write prevention, synchronous validation failures, pending-sync export refusal, delayed
  synchronization, unreadable files and teardown. Synchronization failures remain explicit values.
- Full unit verification passes: 540 files / 4,306 passed / one existing skip before the last three
  editor cases and surface-selection wiring. Final focused editor/service tests pass: 17 files /
  94 tests; agent/skill/factory tests: 32 files / 339 tests. Isolated skill/sync/diagram contracts
  pass: 40 files / 187 tests. Browser note/project/review tests pass: 23 files / 139 tests.
  Type checking and lint pass. Architecture remains at 59 prohibited imports and 19 missing
  interfaces; topology, source and test-quality checks pass. The new factory logic findings were
  fixed by placing missing-skill decisions in the controller and requiring a resolved session.
- Latest inventory before the final surface-selector removal: 61 shared modules / 119 exported
  values (38 classes); 92 server modules / 176 exports (105 classes), 11,785 rows and 12,916
  resolved imports. Browser skill catalog actions, other capabilities and final whole-application
  verification remain pending. No implementation phase is complete.

## Workspace receipt contracts — 2026-10-10

- WorkspaceMutationReceipts explicitly implements mutation guarding and write-recovery interfaces.
  Controllers no longer use Pick of its concrete class. The synchronization factory exposes narrow
  repository and service contracts. Operation locks, permanent proofs and atomic completion are unchanged.
- Type checking passes. Focused receipt/workspace/synchronization tests pass: 6 files / 20 tests.
  Architecture remains incomplete at 59 prohibited imports and 18 missing interfaces; topology,
  source and test-quality checks pass. Whole-application final verification remains pending.

## Diagram storage, generation and write rules — 2026-10-10

- Split diagram storage into reading, writing, lifecycle and revision capabilities with explicit
  interfaces. Controllers retain ownership, project scope, locking and revision checks. Removed
  unused generation and fake export/promotion methods; factories expose the capabilities callers use.
- Generation validation, model selection and revision decisions now belong to a stateless capability.
  Mermaid parser processes and Iconify HTTP parsing live in adapters behind narrow interfaces.
  Existing provider limits, failure messages, timeout and cleanup semantics are unchanged.
- Shared editing and lifecycle capabilities serve browser/server writes. Diagram ETags are scalar
  branded value constructors, preserving their persisted spelling. Diagram label presentation and
  browser canvas workflows remain pending.
- The dependency checker now accepts adapter imports of repository interfaces, including aliases,
  while rejecting concrete classes, construction and concrete re-exports. Regression fixtures cover
  those distinctions. No migration exception was added.
- Full unit verification passes: 541 files / 4,313 tests / one existing skip. Type check and lint
  pass. Focused generation/icon tests pass: 41 files / 394 tests; shared editing and boundary tests:
  38 files / 234 tests. Isolated database contracts pass: 27 files / 153 tests before the shared
  editing extraction. Architecture remains incomplete at 58 prohibited imports and 10 missing
  interfaces; topology/source/test-quality checks pass. Final whole-application checks remain pending.

## Diagram presentation and browser rendering — 2026-10-10

- DiagramLabelPresentationService owns visible-label normalization, search text and comparison.
  DiagramReviews coordinates browser XML decoding and comparison; components no longer decode
  and compare the labels themselves. Server publication invokes the same normalization capability.
- MermaidThemeService supplies one palette/configuration rule. MermaidDiagrams coordinates complete
  SVG rendering, PNG preparation and image downloads. Browser adapters own vendor rendering, DOM
  style inlining, sanitization, rasterization and object URL cleanup. Document render calls receive
  their own resolved palette instead of changing global configuration around the whole export.
- Chat drawings now have an explicit generation store and controller. Each mounted copy gets its
  own SVG identity. Closing or replacing a drawing prevents late success or failure from replacing
  the current result. The component retains reactive source/theme observation and DOM rendering.
- Type check and lint pass. Focused node tests pass: 23 files / 145 tests. Browser diagram/chat/export
  tests pass: 16 files / 95 tests. Isolated diagram/suggestion contracts pass: 11 files / 63 tests.
  Architecture remains incomplete at 55 prohibited imports and 10 missing interfaces; topology,
  source and test-quality checks pass. Broader diagram editing, export and approval workflows
  remain pending; this does not complete a whole implementation phase.

## Server diagram rendering resources — 2026-10-10

- DiagramExportRendering coordinates a local resource reader and disposable browser renderer.
  The renderer is an infrastructure adapter receiving immutable font/script resources. Its
  retained font field is removed. A process store owns resolved resources and the outstanding read.
  Failure clears that read for retry. Network blocking, dimensions, timeout and browser cleanup
  retain their existing behavior.
- Real browser raster tests retain PNG dimensions, invalid-source failures and network isolation.
  Additional tests cover shared outstanding reads, reuse after file access becomes unavailable
  and successful retry after a failed read. Focused rendering tests pass: 13 files / 68 tests,
  plus the three resource-lifetime cases. Full unit verification passes: 544 files / 4,324 tests /
  one existing skip. Type check and lint pass. Architecture remains incomplete at 55 prohibited
  imports and nine missing interfaces; topology/source/test-quality pass. Final verification and
  the remaining artifact/template/export capabilities are still pending.

## Artifact and template capabilities — 2026-10-10

- Artifact storage now exposes writing, reading, lifecycle and project-settings capabilities.
  Templates expose upload reservations, reading, writing and deletion interfaces. Factories return
  interface-typed groups; controller transactions retain upload locking, completion races and cleanup.
- Shared export-settings validation serves optimistic browser preparation and server writes.
  ArtifactFileService prepares filenames and MIME types. Existing bounds, names and defaults remain.
  The server settings persistence capability accepts the controller's validated settings.
- DOCX package integrity and style parsing are private to the file-boundary reader. The controller
  invokes that reader before permanent upload and transactional completion. DocumentBundleService
  packs sanitized, deduplicated paths; all intermediate naming helpers remain private.
- Full unit verification passes: 546 files / 4,327 tests / one existing skip. Type check and lint
  pass. Focused export/workspace tests pass: 50 files / 269 tests. Isolated deliverable/sync
  contracts pass: 20 files / 123 tests. Architecture remains incomplete at 55 prohibited imports
  and seven missing interfaces; topology/source/test-quality pass. Document rendering, shared
  export preparation and complete browser export workflows still need migration.

## Document rendering and font lifetime — 2026-10-10

- DocxDocumentService renders through a narrow interface with private layout helpers. PDF layout
  preparation is a stateless capability receiving resolved glyph coverage. PdfRendering owns font
  loading, shared initialization and retry; a process store owns the immutable resource snapshot.
  The PDF SDK adapter alone configures local file access and writes document bytes.
- Font coverage retains the existing fontkit glyph test and fallback order. Unicode, tables,
  diagrams and widget export cases still exercise real PDF/DOCX output. The test-only hash re-export
  is removed. Todo and artifact controllers receive named renderer interfaces.
- Type checking and lint pass. Focused renderer/controller/factory tests pass: 36 files / 354 tests;
  the final glyph-coverage cases pass: one file / eight tests. Two additional controller cases
  verify cached fonts survive later reader failure and failed initialization can be retried.
  Architecture remains at 55 prohibited imports and seven missing interfaces; topology, source
  and test-quality checks pass. The full suite at the prior artifact/template commit is not final
  evidence for this change. Shared export preparation and browser export coordination are next.

## Export preparation and browser operations — 2026-10-10

- ExportPreparationService discovers complete asset descriptors and prepares renderer input behind
  a named interface. Traversals, attachment recognition and table width calculations are private.
  Removed an unused inline-text helper. Table tests exercise prepared documents; removed the
  impossible mismatched intermediate column count and NaN width fixtures (the document boundary
  rejects NaN). Finite overflow and missing/zero width cases remain covered.
- DocumentExports coordinates settings reads, selected-note loading, diagram rendering, preview
  URLs, document generation and bundles. Dialogs observe readonly progress/results and retain local
  form fields. ProjectExportSettings owns captured draft ancestry and durable default-setting saves.
  Opening absent defaults creates no write. Browser adapters own remotes, hashing and object URLs.
- Dialog generations and account identity guard late success/failure, submission after rendering and
  preview publication. Replaced and closed previews release their object URLs. Sixteen controller
  cases cover these lifetimes, exact export inputs, offline settings and failed writes/rendering.
- Full unit verification passes: 549 files / 4,343 tests / one existing skip. Relevant browser tests
  pass: 16 files / 108 tests. Isolated deliverable contracts pass: three files / 24 tests. Focused
  export tests pass: 24 files / 153 tests before two further rendering cases; final controller cases
  pass: two files / 16 tests. Type check and lint pass. The final settings error guard was verified
  by the focused controller suite after the full run.
- Architecture remains incomplete at 52 prohibited imports and seven missing interfaces;
  topology/source/test-quality pass. Inventory: 63 shared modules / 105 exports (45 classes), 89
  server modules / 175 exports (117 classes), 11,970 rows and 13,057 resolved imports. Artifact
  library actions, note conversion, agent workflows and other browser capabilities remain pending.
  No whole implementation phase or final verification is complete.

## Reviewed note patch and revision rules — 2026-10-10

- NotePatchPreparationService returns a complete patch or the existing actionable rejection messages.
  Exact/tolerant matching, source-byte preservation and rejection formatting stay private. Revision
  comparison has an explicit capability contract. Notes receives both through its capability factory.
  No controller transactions or public tool/transport results changed.
- Tests assert complete public preparation outcomes instead of internal failure classifications.
  Existing multi-assertion cases touched here now have one assertion for their related outcomes.
  Type checking and lint pass; 37 focused files / 362 tests and 52 isolated database contract files /
  244 tests pass. Architecture remains at 52 prohibited imports and seven missing interfaces, with
  topology/source/test-quality passing. Import and document conversion rules remain pending.

## Archive import preparation and browser coordination — 2026-10-10

- NoteArchiveImportService prepares folder order, per-folder unique titles and unmapped metadata,
  then resolves all links against completed identity outcomes. Its reference index, traversal and
  naming helpers are private. Notes still creates identities before bodies and retains partial
  successes, failed descendants, blank notes after failed body saves and exact unresolved links.
- ArchiveImports coordinates multipart upload, response reading and workspace synchronization.
  The component observes progress and the complete report; the adapter owns FormData and fetch.
  Reset/destination changes and account teardown prevent late results and follow-up synchronization.
  Accepted uploads still synchronize when report parsing fails; rejected uploads do not.
- Six new controller scenarios use the real workspace projection and explicit upload outcomes.
  Focused import tests pass: four files / 38 tests. Wider note/agent tests pass: 38 files / 352 tests.
  Note browser tests pass: 13 files / 101 tests. Isolated note/project/skill contracts pass: 35 files /
  145 tests. Type check and lint pass before the final destination-lifetime effect adjustment;
  subsequent artifact changes are being checked together. Architecture remains at 52 prohibited
  imports and seven missing interfaces; topology/source/test-quality pass. Final verification remains.

## Artifact browser actions — 2026-10-10

- ArtifactActions owns download, regeneration and deletion with their synchronization sequence.
  The library calls its interface and renders returned outcomes. Remotes and browser navigation
  live in adapters; a mounted-library store owns outstanding action tokens. Closing the library
  or stopping the account prevents a late download, success message or follow-up synchronization.
- Outstanding work is released by its own token, so one completed action cannot clear another
  action's busy state. Seven new controller cases verify outcomes, failure and lifetime behavior.
  Focused deliverable controllers pass: three files / 23 tests. Artifact browser tests pass:
  one file / three tests. Type checking and lint pass. Architecture remains at 52 prohibited
  imports and seven missing interfaces; topology/source/test-quality pass. Full final checks,
  document conversion and the remaining application capabilities are still pending.

## Markdown document boundary and virtual-file contract — 2026-10-10

- NodeNoteMarkdown owns editor-schema conversion and domain-document validation at a server
  adapter boundary. Notes and Todos receive reader/writer contracts; capability factories construct
  the adapter. The previous editor-schema dependency exception moved with the real boundary and
  retains that specific reason. No parsing moved into a controller or service.
- AgentVirtualFiles implements its reading interface and receives a named Markdown encoder rather
  than an opaque callback to a service export. Its factory exposes reading and repository interfaces.
  Public file metadata/path helpers and broader agent-tool factory workflows still need migration.
- Rich-document round trips remain covered at the adapter. Related workflow tests pass: 38 files /
  405 tests. Final composition tests pass: 14 files / 199 tests. Isolated note/skill/deliverable
  contracts pass: 31 files / 141 tests. Full unit verification passes: 551 files / 4,356 tests /
  one existing skip. Type checking and lint pass, with type checking and the full unit run repeated
  after the final interface/factory wiring. Architecture remains incomplete: 52 prohibited imports
  and six missing interfaces; topology/source/test-quality pass.
- Latest inventory: 63 shared modules / 105 exports (45 classes), 88 server modules / 169 exports
  (120 classes), 12,043 rows and 13,105 resolved imports. Agent preference rules, execution/state
  ownership, remaining browser operations and whole-application final verification remain pending.

## Shared agent preference editing — 2026-10-10

- AgentPreferenceEditingService implements validation and complete preference updates for browser
  commands and server settings. Internal update helpers are private. Server validation remains
  before transaction entry; reads, timestamps and persistence retain their existing order.
- Type checking and lint pass. Focused agent tests pass: 32 files / 163 tests. Isolated preference
  contracts pass: two files / six tests. Architecture remains incomplete at 52 prohibited imports
  and six missing interfaces; topology/source/test-quality pass. Run settings, reference research
  coordination and the other outstanding capability migrations remain pending.

## Run settings and reference search coordination — 2026-10-10

- AgentRunSettingsService resolves execution mode and research settings. Factories retain unresolved
  deployment overrides; agent submission, replay and bootstrap resolve them in controllers. Existing
  chat/reference budgets and frozen run settings remain unchanged.
- ReferenceSearch owns settings, provider invocation, candidate preparation and failure mapping.
  ReferenceDiscovery only prepares deduplicated candidates. Provider parsing and search-tool JSON
  construction live at HTTP adapters; their helpers are private. Cancellation retains its error.
- Type checking and lint pass. Focused tests pass: 32 files / 228 tests; final boundary and override
  cases pass: four files / 21 tests. Isolated agent/reference/relationship contracts pass: 15 files /
  73 tests. Full unit verification passes: 552 files / 4,360 tests / one existing skip. A prior run
  discovered a test before it moved and failed to load that old path; the stable-layout rerun passed.
- Architecture remains incomplete at 53 prohibited imports and six missing interfaces. Moving the
  transport from repositories to adapters exposes AgentReasoning's direct transport dependency; it
  remains flagged for the runner migration, with no allowance. Topology/source/test-quality pass.
- Inventory: 63 shared modules / 104 exports (47 classes), 88 server modules / 167 exports
  (120 classes), 12,049 rows and 13,111 resolved imports. Updated the recently migrated inventory
  rows; all remaining entries and final whole-application verification are still pending.

## Run preparation contracts — 2026-10-10

- AgentImagePreparationService owns image validation, durable reader selection and complete provider
  image input. Helpers are private and the controller receives its interface through composition.
  Native vision, fallback vision, attachment/context ordering and no-image behavior are unchanged.
- RunPreparation implements ChatRunPreparation; controller/factory dependencies no longer name its
  concrete class. The preparation cancellation error lives with application errors. Locked reads,
  claiming, frozen provenance/context and cancellation precedence are unchanged.
- Type checking and lint pass. Focused agent tests pass: 32 files / 314 tests. Isolated preparation,
  session deletion and cancellation contracts pass: three files / nine tests. Architecture remains
  incomplete at 53 prohibited imports and four missing interfaces; topology/source/test-quality
  pass. Full unit evidence at the prior commit is not final verification of remaining migration work.

## Conversation session and transcript contracts — 2026-10-10

- ConversationArchive implements separate session and transcript capabilities. Agent and diagram
  controllers receive those interfaces; factories no longer expose the concrete archive or a Pick
  of it. The duplicate all-purpose journal contract is removed. Ownership, workflow visibility,
  locking, message payloads and timestamps remain unchanged.
- Provider-history rewind is part of ConversationHistoryService, with its traversal private. The
  agent controller still coordinates transcript truncation and provider history replacement inside
  the existing transaction. User ordinals and intervening tool activity retain their behavior.
- Type checking and lint pass. Focused controller/history/diagram/search tests pass: 28 files /
  202 tests. Isolated agent/diagram/conversation contracts pass: 17 files / 93 tests, including
  deletion and submission races. Architecture remains incomplete at 53 prohibited imports and
  three missing interfaces; topology/source/test-quality pass. Runner SDK coordination, event
  mapping state, browser operations and final verification remain pending.

## Agent execution, SDK boundaries and stream lifetime — 2026-10-10

- AgentExecution coordinates tool/session creation, image description, replay, trace context,
  event delivery, checkpoint presentation, snapshots and provider cleanup. Its factory exposes
  AgentRunner. Session construction uses a narrow port; the controller no longer receives a
  repository. AgentSdkInfrastructure owns SDK sessions, provider parsing and error reading.
- AgentPromptService prepares complete system/user input with private attachment and escaping
  helpers. AgentToolRecoveryService owns tool recovery and promotion under current authority.
  SDK protocol mapping stays at adapters. Existing prompts, limits and failure messages remain.
- AgentStreamStore owns correlation and reasoning-deduplication state for one execution. Stream
  controllers read it, invoke stateless presentation rules and apply controlled updates. Tool-name
  and structured failure reading occur at the boundary. Diagram generation uses the same mapping.
- Split behavioral tests by prompt, recovery, stream, image and execution concerns. Type checking
  and lint pass. Full unit verification passes: 556 files / 4,363 tests / one existing skip. Isolated
  agent/diagram/reference/relationship contracts pass: 20 files / 102 tests. Final focused tests
  pass: 59 files / 575 tests, after preserving the original review-before-serialization order.
  The initial prompt extraction script rewrote private calls incorrectly; corrected before these
  successful runs. No failure is counted as a pass. No live providers were used.
- Architecture now reports 51 prohibited imports and zero missing service interfaces; topology,
  source and test-quality checks pass. Public function/state/indirection enforcement and the
  remaining browser/factory migrations are still incomplete. Inventory: 63 shared modules /
  104 exports (47 classes), 89 server modules / 157 exports (120 classes), 12,062 rows and 13,145
  resolved imports. Agent tool construction/review workflows in factories remain pending.
- Rechecked PRs: #324 is still open at 11032df292820b19d9ec393b637364e4077ffdea; #325 is merged.
  The follow-up target remains refactor/controller-model-audit. No push, PR or completion claim yet.

## Tool invocation preparation and execution — 2026-10-10

- AgentToolInvocation owns preparation identity, approval/execution reuse and cancellation checks.
  AgentToolInvocationStore retains pending preparations for one SDK tool in one execution. A reused
  call identity with changed arguments still fails; concurrent calls share the prepared result.
- AgentToolCalls owns failure handling around preparation and execution. SDK normalization, schema
  reading and protocol error mapping live in adapters. The SDK factory only assembles dependencies.
  The source audit and its accepted fixture now identify the adapter's new path.
- Type checking and lint pass. Focused agent tests pass: 53 files / 545 tests, including five new
  preparation/replay/isolation cases. Source-audit fixtures pass: 109 tests. Isolated agent contracts
  pass: 10 files / 58 tests. Architecture still reports 51 prohibited imports; topology, source and
  test-quality checks pass. Tool registry/review/discovery workflows and final verification remain.

## Reviewed tool operations and result presentation — 2026-10-10

- AgentToolReviews owns restored review checkpoints, preparation, approval gating and conditional
  application for note and skill bodies. AgentToolReviewStore retains exact preparations for one
  execution. Its boundary reader validates saved reviews and tool requests. MCP body changes call
  the same complete change operation. Registry startup still invokes restoration from the old
  factory facade and remains pending with the larger registry migration.
- AgentToolPresentationService implements the explicit agent result contract. Its projections retain
  existing fields, receipts and body-file references; exported projection functions are removed.
  Replaced incomplete cast fixtures in its tests with valid domain builders.
- Type checking and lint pass. Focused tests pass: 50 files / 508 tests. Full unit verification
  passes: 557 files / 4,368 tests / one existing skip. Isolated agent and reviewed-note contracts
  pass: 11 files / 66 tests. Initial extraction missed callback references and used an overly broad
  output type; both were corrected before these passing checks. Architecture remains at 51
  prohibited imports; topology, source and test-quality pass. Final application verification and
  remaining factory/browser/enforcement work remain incomplete.

## MCP discovery and dispatch — 2026-10-10

- McpToolSession coordinates discovery, promotion, permitted dispatch and tool failures. Discovered
  names live in a connection-scoped AgentToolDiscoveryStore. McpToolProtocol owns SDK registration,
  schema conversion, request reading, wire results and list-change notifications. The factory
  assembles these dependencies; shared definition/authority selection still belongs to the pending
  registry migration. Removed the obsolete factory-workflow allowance from the MCP factory.
- Type checking and lint pass. Agent tool and source-audit tests pass: 14 files / 296 tests,
  including connection isolation after discovery. Existing read-scope restrictions, exact schemas,
  unavailable tools, validation/recovery envelopes and reviewed body writes remain covered.
  Architecture remains at 51 prohibited imports; topology, source and test-quality pass.
  Full-unit evidence from the preceding reviewed-tool commit is not final verification of this
  or the remaining migration. No live provider was used.

## Tool catalog and preference coordination — 2026-10-10

- AgentToolCatalogService owns descriptions, settings metadata and direct/discoverable/locked
  partitions. Tool discovery receives its interface. Removed public catalog functions, derived
  global collections and the metadata-workflow factory. Static descriptions remain model values.
- ToolPreferences coordinates catalog resolution with ToolAccess. The storage capability receives
  resolved metadata and no longer calls a catalog collaborator. Its factory output is interface
  typed. Removed the unused production resolve helper and its two test-only callers; preserved
  production preference/override/locked-tool behavior and controller contracts.
- Type checking and lint pass. Focused tests pass: 20 files / 235 tests. Full unit verification
  passes: 557 files / 4,367 tests / one existing skip. Isolated agent and synchronized tool-policy
  contracts pass: 11 files / 64 tests. The deterministic cache contains all 69 tool embeddings;
  validation did not call a live provider. Architecture remains at 51 prohibited imports, with
  topology/source/test-quality passing. Inventory: 63 shared modules / 102 exports (48 classes),
  89 server modules / 147 exports (121 classes), 12,101 rows / 13,203 resolved imports.
- Agent registry workflows, browser migrations, stricter semantic enforcement and final checks
  remain incomplete. These results do not satisfy the whole-application completion conditions.

## Agent discovery state and shared protocol presentation — 2026-10-10

- AgentToolDiscovery coordinates ranking, permitted-name filtering, promotion and discovery results.
  AgentToolDiscoveryStore retains promoted names for one constructed SDK tool surface or MCP
  connection. The agent factory no longer closes over a mutable promotion Set or executes search.
  MCP uses the same controller, while keeping its own dispatch and notification operations.
- ToolCatalogBoundary converts schemas to discovery JSON for both protocols. Definitions retain
  their real schemas and current authority; an unknown ranked name cannot become callable.
  Static catalog membership comes from AgentToolCatalogService.
- Type checking and lint pass. Focused agent/controller/discovery tests pass: 32 files / 369 tests.
  Architecture remains at 51 prohibited imports; topology/source/test-quality pass. Registry
  initialization, remaining tool operation callbacks, browser migrations and final checks remain.

## Registry startup and checkpoint restoration — 2026-10-10

- AgentToolSessions owns current preference loading, authority resolution and saved-review
  restoration before exposing the runner's registry. The factory now assembles the session graph
  and returns its controller operation. AgentTools construction no longer restores a checkpoint.
  AgentExecution and the factory use the named AgentToolRegistry contract.
- Added startup behavior tests for exact reviewed execution, rejection of a missing saved review,
  and current project authority. Replaced the provenance test's incomplete run, request, skill and
  controller casts with narrow valid inputs and a typed recording closure. Existing review tests
  restore preparations through a shared test fixture that calls the real controller.
- Type checking and lint pass. Focused agent tests pass: 31 files / 357 tests. Isolated agent,
  reviewed-note and synchronized tool-policy contracts pass: 12 files / 72 tests. Architecture
  remains at 51 prohibited imports; topology/source/test-quality pass. Tool-definition callbacks,
  browser operations, stronger enforcement and final whole-application checks remain pending.

## Run status and transcript reconstruction — 2026-10-10

- AgentRunStatusService implements terminal-state and durable-tail completion rules. The agent
  controller receives its interface. Cursor comparison still uses BigInt, including beyond the
  safe integer range. AgentStreamPresentationService now reconstructs contiguous output segments;
  tool activity and unreadable events still break segments. The old output function module is gone.
- Agent capability outputs now name run/event/decision/session repository interfaces and existing
  trust/settlement interfaces. Renamed the shared agent test-rule fixture to reflect its expanded
  scope. No model defaults, transcript formats, settlement transactions or failure behavior changed.
- Type checking and lint pass. Focused agent tests pass: 68 files / 632 tests. Isolated agent,
  diagram, reference, relationship and promise-run contracts pass: 21 files / 108 tests. Full unit
  verification passes: 558 files / 4,370 tests / one existing skip. Initial checks found remaining
  test imports of removed functions; updated them before these successful runs.
- Architecture remains at 51 prohibited imports; topology/source/test-quality pass. Browser chat
  state and workflows are under review next; the remaining inventory and final checks stay pending.

## Browser editor and clipboard contribution — 2026-10-10

This slice starts from #347 at `4bbca131` in `refactor/pr336-editor-operations`.
It uses a separate worktree. Open PRs #338/#347 already own chat and workbench lifetimes;
#337/#340 own server boundaries; #345 owns enforcement. PR #348 owns proofreading/dictionary contracts and their consumers. This slice does not duplicate
that agent's changes or claim the wider notes/browser refactor is complete.

- [x] Reproduce copy, remembered-selection paste, undo/redo and note-to-chat handoff before
      editing. Capture the same synthetic split-note state at desktop and narrow widths.
- [x] Move clipboard construction from the store to a factory. Controllers coordinate copy,
      cut eligibility, reads and feedback. Adapters own clipboard I/O, current theme and toasts.
      Preserve rich/media fallback reports and immediate writes for browser user activation.
- [x] Replace the parent component-instance binding and raw editor export with narrow editor
      operations. An editor-scoped owner retains initialization, context range, blur guards
      and reported insertion positions. Components receive a readonly copy-availability view.
- [x] Move document reads/writes, selection restoration, held selection collapse, insertion
      point consumption and diagram insertion mechanics behind a Tiptap adapter. Relocate
      selection/insertion plugins and their tests to the browser boundary. Keep the same
      mounted editor, selection registry identity and existing save/session controller.
- [x] Keep initial note hydration out of undo history. A fast first paste previously could
      join the initial load, so Undo removed the loaded note. The immediate-paste regression
      now proves that Undo restores the original passage. Later edits retain their history.
- [x] Move inline writing HTTP and response parsing behind an adapter and controller. Preserve
      request fields and failure behavior; discard responses to aborted caret requests.
- [x] Add controller/adapter tests for remembered paste and undo, failed reads preserving the
      document/selection, late paste after release, incomplete cut, authored-change reporting,
      table-selection collapse and aborted writing responses. Retain clipboard and editor races.
- [x] Add an authenticated synthetic E2E scenario for clipboard, undo/redo, durable autosave,
      sibling-tab identity, reload and chat handoff. Verify attachment insertion with a typed
      upload callback; this is browser integration evidence, not live object-storage evidence.
- [x] Verify offline note publication and per-account saved tabs in an isolated Postgres
      production-preview run. Capture matched after images in `docs/pr-evidence/pr336-editor-operations`.
- [ ] Publish the stacked PR on #347 and record required CI results. Inherited architecture
      findings still prevent merge readiness.

### Inventory reconciliation

The #345 inventory was checked against current #347 source and rerun with #345's semantic
checker against both roots. Clipboard store orchestration was still present; it is now removed.
Raw browser clipboard access and editor instance exposure were also confirmed and extracted.
No shared services, server implementation, general workspace synchronization/review or widget
internals changed. No enforcement rules, allowances or migration baselines were added.

Proofreading findings remain current and deferred: the store still mixes preference persistence,
worker loading and dictionary decisions; the component still coordinates lint/filter/learn/fix;
Harper still imports service contracts/rules. PR #348 changes those surfaces on its own stack; preserve its interfaces when the stacks are combined. Do not mark the broad notes/proofreading checklist or these findings complete.
Selection-to-chat registry writes and presentation-only search/shimmer/heading behavior remain
in the component; this slice preserves their current contract rather than expanding into #338.

### Observed verification

- Type checking: zero errors and warnings. Lint, docs check and standalone UI audit passed.
- Unit suite: 574 files; 4,469 passed, one existing skip. Full browser suite: 92 files;
  595 passed. The existing `derived_inert` warning remains. After the initialization-history
  fix, the focused editor/controller suite passed all 43 tests. A final component regression
  also passed all 35 editor tests, including retained passage context after blur.
- Synthetic authenticated E2E: passed clipboard, undo/redo, autosave confirmed in Postgres,
  sibling-tab navigation, reload and a staged chat prompt without starting a run.
- Production web and worker builds and the build-output audit passed.
- Isolated production preview: offline note edit/publication and account tab restoration
  passed against a temporary Postgres container. The full PWA suite was not run.
- Architecture: topology, source and test-quality checks passed. Chisel reports 44 inherited
  imports, down from #347's 46; the two removed entries belonged to the clipboard store.
  File/rule comparison found no new entries. No enforcement or allowances changed.
- #345 semantic checker: fresh #347 baseline 767 findings; this slice 765. Both removed
  findings were clipboard store workflows. File/rule/message comparison found no new findings.
- Attachment insertion used a typed upload callback, not a live object-storage upload.
  Local database contracts are unchanged and were not rerun; required CI runs them.

Browser checks ran serially after build/type generation. An early E2E run reloaded before
tab navigation settled; the scenario now waits for the selected content and URL. Another
run overlapped generated-file changes and was repeated after generation finished. The first
repeat capture exposed the initial-load undo grouping fixed above. Final browser evidence
uses the successful repeat. Temporary native-clipboard captures must run without a competing
browser suite because the clipboard requires active browser focus.
