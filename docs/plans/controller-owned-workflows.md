# Controller-owned workflows

## Required architecture

This work applies the user's correction to the domain assessment and note pilot:

- Models contain values, types, and Zod schemas only. They contain no business functions,
  procedural readers, mutable runtime helpers, or workflow classes.
- Services own focused business behavior. Shared browser/server behavior has one explicitly
  shared service implementation. Server-only services remain under `server/services`.
- Controllers resolve and coordinate service capabilities and own workflow transactions.
  A local interface, callback, or repository-named port does not change the role of the
  concrete object supplied by a factory.
- A green import audit is not evidence that runtime ownership is correct. Fix the dependency,
  then test the behavior and audit the actual composition.

These instructions supersede the placement of pure business decisions in models in ADR 0041
and the previous repository guidance. Preserve the single-rule and offline consistency
guarantees of that ADR while correcting placement. Keep the rest of the accepted product
behavior, including actor scope, revision checks, cancellation, and failure reporting.

## Executor instructions

Read this record after compaction. Keep each completed change reviewable. Use `apply_patch`
for source and document edits. Do not reclassify a service as a model, duplicate a workflow
to avoid an import rule, or inject another service behind a fabricated repository interface.
Do not edit another agent's worktree. The note pilot is PR #66; this branch starts at its
rebased commit `fa469e09`, including master through `1cb8f213`. Preserve the durable
attachment processing, export preparation, and shared note views merged in #64, #65, and #67.
Publish dependent PRs for coherent steps; continue until the whole inventory is resolved.

## Confirmed workflow inventory

| Current owner                                                | Hidden coordination                                                      | Required owner                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------- |
| DrawioWrites / DrawioReview                                  | validation, diagram persistence, search indexing                         | diagram, studio, and suggestion controllers |
| AttachmentLibrary / AttachmentExtraction / AttachmentContent | storage, parser selection, OCR, image description, preferences, indexing | attachment upload/processing controllers    |
| ArtifactLibrary / BoardPdfExport                             | notes, attachments, rendering, provenance, storage                       | deliverable and todo export controllers     |
| DiagramAuthoring                                             | conversation, preferences, context, provenance, durable run, provider    | diagram authoring controller                |
| SuggestionApplication                                        | todo, relationship, reference, diagram, memory mutations                 | suggestion controller                       |
| MemoryLibrary                                                | memory mutation and search indexing                                      | memory and suggestion controllers           |
| AgentContext / BaseAgentContext                              | note, project, skill, memory, conversation reads and provisioning        | agent context/execution controllers         |
| InlineSuggestionContext                                      | memory/search retrieval, ranking, selection                              | inline suggestion controller                |
| ProjectScopedLinkFinder                                      | source note lookup, search, relationship classification                  | relationships controller                    |
| EmbeddedDiagramIndexer                                       | source note lookup and indexing                                          | calling controllers resolve source facts    |
| BuiltInSkillLibrary / BuiltInSkills                          | project/note/skill provisioning hidden in reads                          | explicit provisioning controller            |

Review concrete factory assignments for every service, not only these examples. Distinguish
real repositories and provider clients from services implementing similarly named ports.

## Model behavior inventory

Move behavior out of every model domain. Keep schemas and their inferred types beside values.

- Notes: edits, creation/trash/selection, patching, document transforms, links, diagrams,
  revisions/diffs, search, outline, numbering, reading time, equality and ETags.
- Projects, todos, memory, skills, relationships: decisions, assembly, serialization and formatting.
- Suggestions, provenance, proposal effects: proposal creation, lifecycle and change mapping.
- Attachments, diagrams, deliverables, search: format decisions, label extraction, dimensions,
  column allocation and result selection.
- Agent: run transitions, context/input/model/preference decisions, tool matching, event mapping,
  labels and catalog lookup. Move procedural decoding to actual provider/storage/client readers.
- Workspace mutations/views/records/sync, outbox, sync, revisions: preparation, projection,
  identity and queue/conflict/reconciliation behavior.
- Markdown, tokenization, proofreading, workspace display: rendering, lazy runtime state,
  dictionary decisions and sizing. DOM-dependent adapters belong in client code.

## Implementation checklist

- [x] Trace the user's exact attachment revision and inspect concrete factory wiring.
- [x] Inspect cross-domain service composition and all model behavior families.
- [x] Remove diagram write/review orchestration services; preserve guards and atomic indexing
      in all three controller entry paths. Verify controller state and rollback tests.
- [x] Move attachment processing and OCR/image enrichment orchestration into controllers;
      preserve claims, partial results, retries and provider failure behavior.
- [x] Move suggestion application and memory/index consequences into their controllers.
      Memory indexing was already moved in #64; suggestion application now dispatches in its
      controller. Expiration hidden in suggestion listing remains part of the final wiring audit.
- [ ] Move context, inline retrieval, relationship discovery and hidden provisioning into
      controllers; preserve source scope and explicit failures.
- [x] Move deliverable, board export and diagram authoring orchestration into controllers.
- [ ] Introduce an explicit shared-service placement supported by both architecture checkers;
      preserve server isolation and reject service-to-service orchestration through structural ports.
- [ ] Migrate every model behavior family above to focused services or actual boundary readers;
      update consumers without duplicating shared browser/server rules.
- [ ] Add model-content and concrete-wiring audit regression cases. No baseline of new violations.
- [ ] Update AGENTS, architecture guidance, ADR placement, and assessment dispositions to reflect
      the user's rule. Preserve historical findings as historical evidence.
- [ ] Inspect all remaining service constructors/factory assignments and model declarations;
      record each unresolved concern rather than declaring the global correction complete.
- [ ] Run lint, type checks, architecture audits, full node/browser tests, contracts, docs and
      production PWA checks. Publish a self-contained PR and wait for required CI.

## Full PR #57 scope

The architectural inventory above does not replace PR #57's P01–P23 implementation list.
All 23 slices remain in scope, including behavior corrections, client workflows, recovery,
and test dispositions. The user reaffirmed this scope on 2026-09-16. Reconcile each slice
with merged work and record verified results before marking it complete. Apply the user's
model/service/controller rule to every slice. Do not stop when the layer moves are done.

- P01 and the note portion of P12: implemented in merged PR #66; skill policy still needs review.
- P02: return the persisted accepted task suggestion; 13 extraction tests, type checking,
  architecture audits, and the full 3,504-test suite passed.
- P03: start logging and tracing before public capability execution. The explicit, typed
  surface excludes helpers; internal calls retain one boundary. Sixteen instrumentation tests
  and the full 3,506-test suite passed, including pre-await child span parentage.
- P04/A07/A12: replay retains unreadable event identities; numeric cursor schemas protect
  browser state and stream boundaries. Chat checkpoints after successful storage and applies
  each retried event once. PostgreSQL contracts verify an unreadable terminal tail; browser
  tests verify detachment and checkpoint failures. Seeded chat captures show missing activity.
- P05/A11: search-query generation now rejects missing or blank provider output. The provider
  belongs to knowledge search, and the evaluation cache uses a new namespace. Eleven focused
  tests and the full 3,511-test suite passed.
- P05/A13: all preparation now falls within provider cleanup; image requests honor cancellation
  and reject blank descriptions. Unfinished sibling requests are aborted on exit. Native vision
  retains original images. Ninety-four focused tests and the full 3,539-test suite passed.
- P06/S01: sign-in coordinates OAuth, account resolution, and the same session registry used
  by requests. Creation, expiry, renewal, logout, and storage failures have behavior tests.
  The full 3,562-test suite passed; provider/account-linking policy remains unchanged.
- P07/A01/A10: verified merged #54/#59 against current code. Acceptance records effects in
  the transaction; undo locks and checks all changed record versions before restoring anything.
  Missing historical effects refuse undo. Lifecycle schemas require decision and artifact facts.
  All seven PostgreSQL effect contracts passed, including stale replacement, rollback, and races.
- P08/A05: memory proposals now encode scope and operation at the boundary. Target scope is
  checked before proposal creation and again under the application lock. Valid historical rows
  normalize on read; incomplete historical updates remain unreadable. The full 3,576-test suite
  and 20 PostgreSQL memory/suggestion contracts passed.
- P09/A03: task fields and status now use one validated write and one timestamp. Creation
  follows editing's responsibility normalization. PostgreSQL checks exposed skipped clears
  and nullable values hidden by the row mapper; both are fixed. Five task sync contracts and
  the full 3,580-test suite passed. Shared task rules still require the global model migration.
  P09/A04 adds controller-owned atomic batches and account-scoped durable receipts. Agent
  and MCP callers supply a stable request UUID; duplicate deliveries return original ordered
  results, and changed input cannot reuse an ID. Seven PostgreSQL contracts cover concurrency,
  rollback, lost responses, account isolation, and corrupt receipts. The full 3,583-test suite passed.
- P10/A06 folder expansion: all live descendants are included without the former 25-note cap.
  Folder selection and submission require complete inventory; missing folders fail visibly
  before the draft is cleared. Counts refresh with the inventory. Shared folder rules and
  an 80-note server-context regression passed, as did the full 3,589-test suite. Actual
  composer captures show 25 versus 40 notes for the same 40-note fixture. Mention references
  now retain resource IDs and text ranges through edits, removal, and tracked undo/redo.
  Picked skills submit IDs. Duplicate-title removal has native browser input coverage and
  before/after composer captures. The full 3,595-test suite and 26 composer browser tests pass.
  Server-side missing-note exclusions still need explicit treatment
  during the context-orchestration correction; the old warning-only skip is not resolved here.
- P14: durable claims and recovery landed in #64; this stack moves extraction and image
  enrichment into the processing controller. Attachment indexing now stages every accepted chunk;
  bounded embedding batches preserve tail content. The worker repairs historical truncated indexes
  from saved extraction without another provider request. Seven PostgreSQL processing/search
  contracts, the full 3,599-test suite, type checking, architecture audits, lint, and docs checks pass.
- P15: export preparation landed in #65. Template uploads now have separate durable reservations;
  the controller verifies bytes, extracts styles, writes the final object, and publishes under a
  reservation lock. Incomplete templates stay out of lists and explicit unavailable choices fail.
  Legacy incomplete rows remain preserved and require re-upload because their checksum was not
  recorded. Eighteen PostgreSQL deliverable contracts and the full 3,607-test suite pass.
  Regeneration assets and artifact/provenance atomicity remain open.
- P16: archive links resolve against paths and unique titles across all parsed entries,
  including failed entries. Ambiguous and unavailable targets remain literal and appear in
  the import report. Failed folders block descendants while independent branches continue.
  The notes controller owns the workflow; the upload boundary reads ZIP/frontmatter and
  services resolve links. Actual before/after controller results and component captures show
  a duplicate-title link changing from a silently selected note to an explicit warning.
  All 3,604 unit tests, type checking, lint, architecture audits, and docs checks pass.
- P17: controller-owned draw.io writes implemented in this stack. Draft saves and trash
  transitions now also commit their search changes atomically. Three stateful tests reproduced
  partial writes before the fix. Seven PostgreSQL mutation contracts pass, including rollback
  after real index writes. The full 3,607-test suite and local quality checks pass.
  Rendering after permanent deletion remains to be verified.
- P23: server replacements now commit all selected note bodies and indexes atomically.
  Browser replacements retain durable per-note queue semantics and report confirmed saves,
  the unconfirmed write, and unattempted notes. Actual browser execution also reproduced and
  fixed cloning of Svelte reactive note values. Search/replacement rules moved from models
  to one shared service; a shared controller coordinates local writes. Two PostgreSQL contracts
  verify rollback and recovery. Browser tests and before/after captures exercise the actual store,
  workspace drafts, and queue with in-memory storage.
  All 3,632 unit tests and local quality checks pass. Replacement confirmation counts every
  body match, including those beyond the former search cap, and excludes title-only matches.
- P20: checked consumers and accepted review policy. Only extracted tasks and memory proposals
  use auto-accept policies. Settings and the agent tool now expose those controls; unsupported
  writes, including legacy queued commands, fail explicitly. Historical rows remain stored.
  Chat tool approval and tool availability stay separate. The confidence caption now matches
  the inclusive threshold. Six PostgreSQL policy contracts and two control browser tests pass;
  matching component captures show the five former controls and two effective controls.
  The full 3,642-test suite and local quality checks pass.
- P18: a shared controller now coordinates image/Mermaid clipboard preparation and writes.
  Missing media and text-only fallback are explicit. The undocumented media ceilings are removed.
  Native Chromium copy/paste into a separate-origin document preserves available media and marks
  missing attachments. Cut retains content after an incomplete write or intervening document edit.
  All 3,654 unit tests pass, including eight clipboard adapter and four mounted-editor cut tests.
  Saved draw.io reference portability remains with the outstanding diagram-reference work.
- P19 workbench: resource layouts now use account-specific IndexedDB databases and a parsed
  storage boundary. The shell releases old account state, and delayed reads/navigation cannot
  overwrite the next binding or a newer URL. Unowned legacy layouts remain preserved without
  being assigned to the next signed-in account. The authenticated two-account regression
  reproduced lost sibling tabs on the previous code and passes with the new storage. Matching
  screenshots show the restored tab. All 3,669 unit tests and local quality checks pass, along
  with all 28 PWA scenarios under explicitly configured seeded-session authentication.
- P19 Today/attention: browser and server controllers now use one Today grouping service and
  one memory-notification service. Workspace view orchestration moved out of models; that model
  now contains only the skill value type. Server acquisition and local cache acquisition remain
  separate. Full-response parity covers local-date groups, waiting tasks, pinned/recent notes,
  pending proposals, profile memory and archived projects. The other feature rules still called
  from workspace views remain part of the outstanding global model migration.
  All 3,677 unit tests, type checking, lint, architecture audits and docs checks pass.
- P09–P11, P13, P19, P21–P22: reconcile current code against the detailed assessment and
  complete outstanding behavior and evidence. No completion is inferred from file placement.
- Global orchestration: proposal expiry now runs explicitly before note, workspace and review
  reads in their controllers. The factory no longer disguises a write-then-read workflow as
  a suggestion-listing service. Regression tests cover expired/pending review, profile memory,
  Today counts, account isolation and storage failures. Service reads themselves do not expire rows.
  All 3,684 unit tests and local quality checks pass.
- Global orchestration: related-note retrieval and classification now run in the relationship
  controller using the already-resolved selection note. The service wrapper, duplicate note read
  and duplicate heuristic classifier are removed. One model schema defines classification values.
  Shared relationship rules retain the strongest passage from duplicate chunks; search and
  classification receive cancellation. The reranking search wrapper remains pending global review.
  All 3,686 unit tests and local quality checks pass.
- P15 follow-up: CI exposed a race between checking for a completed template and reading its
  reservation. A deterministic test reproduces it. Completion now recognizes another request's
  committed template after either reservation or staging disappears. All 252 PostgreSQL contracts
  and 3,685 unit tests pass with that fix.
- P21 fairness: reproduced starvation with a two-source budget and two persistent failures
  ahead of healthy sources. The worker now advances a stable account/source cursor after every
  attempt and wraps to retry earlier failures. A PostgreSQL contract verifies continuation after
  deletion of the cursor source. The cursor is process-local; scheduler non-overlap and shutdown
  drain remain unchanged. Worker orchestration and remaining operational-contract corrections
  still belong to the outstanding global work.
  All 3,688 unit tests, 253 PostgreSQL contracts and local quality checks pass.
- Global models: markdown models now contain render-result and segment values only; Marked and
  DOMPurify run in a browser adapter. Proofreading models contain issue/suggestion values only;
  dictionary rules live in a focused shared service and the linter port lives with service
  contracts. Failed rendering returns an explicit failure value with the original text. The
  native-browser sanitizer/fallback tests now run in the regular unit gate.
  All 3,694 unit tests, ten mounted-chat browser tests and local quality checks pass.

Pending-write review presentation rules now live in a focused shared service. The model keeps
only the entry type and product-label values. Existing mounted review tests cover preserved
local intent, authoritative conflict comparison, dependent-edit discard protection and account
shutdown; they now run in the regular unit gate.

P21 operational contracts: feedback submission now has one model schema/type across its remote,
controller and repository boundaries. The documented contract awaits persistence and propagates
failure so the dialog can retain the report for retry. Controller tests cover saved context,
failed submission and retry. ADR 0010 now references the current outbox, permanent operation proofs
and diagram offline edits rather than the retired note-only sync coordinator.

P10 missing context: a regression reproduces successful context assembly after one of two
explicitly attached notes disappears. Context loading now fails with an actionable message and
the missing note identity; operational read failures retain their original error. This closes the
silent omission path. Agent-context service orchestration remains pending the global migration.

Global models: sidebar models now hold only width values and constraints. Cookie interpretation
lives at the browser boundary; a shared service owns preferred-width clamping and viewport space
allocation. Project export models hold tree/entry shapes; a focused service flattens selected trees
into archive paths. Model-picker labels, effective-model display and query matching also live
in one focused service; their model file retains value types. Existing behavior tests move with
their implementations.

Global models: provider event decoding now runs in the server provider-event mapper. Models retain
schemas and event values; tool-argument decoding, output classification, call identity selection and
reasoning-event mapping move together to the boundary. Provider failures use the explicit error
module. A regression exposed malformed known tool events silently becoming ignored events; these
now fail explicitly while unfamiliar SDK event types retain the fallback. General payload readers
and run-transition rules remain pending model cleanup.

Global models: stored agent events, pending approvals and run input/context snapshots are decoded
in repository readers. Their schemas and result values stay in models. A damaged whole approval
column now returns an explicit corrupt result and produces an operational warning; the run stays
readable for cancellation, but no damaged approval is treated as authorization.
The agent controller binds the resolved conversation directly into already-narrow submission data;
it no longer reparses a value it just constructed. Existing submission tests cover first-message
and existing-conversation snapshots.

P15 controller ownership: document generation, previews, bundles, downloads and regeneration now
coordinate focused collaborators in the deliverables controller. Task-board PDF assembly lives in
the todos controller. Renderers consume prepared image and diagram values without service callbacks.
Artifact metadata and provenance share one transaction for both generation and regeneration;
failed signing or persistence removes the newly uploaded object. Original artifacts remain intact.
Saved title visibility and diagram-theme settings are no longer discarded during validation.
Server-side preparation of missing diagram renders remains outstanding; this slice does not
complete P15 or the global refactor.

Export settings follow-up: browser requests silently stripped diagram colors, while the agent
tool rejected them as unknown input. Both regressions were reproduced. Browser exports, agent
settings updates and queued workspace writes now share the complete model schema. The stored
partial-overlay schema derives the same field definitions while retaining its read contract.

P15 diagram preparation: the deliverables controller resolves current Mermaid sources and
authorized draw.io previews before generation, preview, regeneration and bundled exports.
A focused browser renderer supplies missing PNGs using the same palette rules as the editor.
An outdated or absent draw.io preview fails explicitly instead of producing an incomplete
document. Draw.io ownership follows the project, not its optional source-note context.
Mermaid theme values remain in models; theme behavior is shared through a service. The generic
editor receives the application diagram view from its host instead of importing product rules.
Its toolbar now uses one accessible button per action. The production image includes the
headless browser and copies dependency patches before installation.

Search/context ownership: knowledge search, relationship suggestions and inline suggestions now
coordinate embeddings, vector lookup and ranking in their controllers. The former embedded-search,
reranking-search and inline-context orchestration classes are removed, including their factory
composition and service-shaped ports. The lookup service owns only stored vector queries; the inline
context service selects passages and memory from resolved values. Inline retrieval failures propagate
instead of being turned into empty grounding. Inline project results now rerank every multi-result
set, including sets smaller than eight. ADR 0036's explicit vector-order fallback on ranking-provider
failure remains intact. AgentContext, provisioning, indexing and durable selection workflows still
need their own ownership changes.

Embedding maintenance: the scheduled controller now coordinates the pending queue, embedding provider
and transaction boundary. IndexBacklog owns stored pending reads and completion. Provider batching
moves out of the repository helper into Embeddings, preserving every accepted chunk. Duplicate or
out-of-range provider indexes now fail instead of assigning vectors to the wrong content. Existing
fairness, search-continuity and concurrent-edit coverage moves with the workflow. ContentIndex still
needs its separate orchestration and model-plan cleanup; this slice does not complete indexing.

Content indexing: note, skill, memory, diagram and suggestion controllers now coordinate prepared
chunks, embedding generation and index completion. ContentIndex receives the model name, never an
embedding service. Diagram controllers resolve source-note titles before indexing; its factory no
longer injects a note repository into an indexer. The last knowledge-search model decision moves
into the focused indexing service. Immediate writes still finish their vectors before returning;
deferred writes keep the durable pending queue. Existing transaction boundaries remain in place.
Regression tests reproduce and fix dropped identical final paragraphs and reused chunk IDs when
identical content appears more than once. Agent context, provisioning, diagram authoring, durable
selection workflows and the other model families remain unfinished.

Tool discovery and seeding: ToolDiscovery now coordinates embeddings, stored ranking and seed
transactions. The locally declared embedding ports and both retriever service implementations are
removed. ToolCatalogIndex owns catalog drift, vector persistence and ranking against the repository.
Missing query vectors and missing current-model tool rows fail explicitly. Seed writes and pruning
roll back together; provider calls stay outside the transaction. Evaluations now use the production
stored-vector discovery path. Tests assert ranked names, stored vectors, unchanged-seed behavior and
rollback instead of call arguments or the presence of an exported class.

Diagram generation: the diagrams controller now owns conversation and model selection, context
preparation, provenance, submission validation and run settlement. DiagramGeneration only runs the
provider protocol. It sends parsed submission candidates to the controller and waits for an explicit
acceptance or rejection; it receives no validation or workflow service callbacks. Submission schemas
remain model values, with SDK input parsing at the repository boundary. Preparation errors now fail
the already-created run instead of leaving it running. Provider cancellation closes pending validation
requests. Obsolete authoring ports and the fake whole-workflow implementation are removed. Agent
context assembly, built-in skill provisioning and durable selection-workflow settlement remain open.

Agent context loading: agent execution and diagram controllers now load their required notes, skills
and profile memory directly. Chat execution also resolves conversation origin and staged scope.
AgentContext formats resolved values and no longer receives readers or an optional collaborator.
BaseAgentContext and its separate builder ports are removed. Selection normalization, skill ordering,
token thresholds and scope descriptions share the same formatter. Context tests now execute durable
runs; missing attached notes still fail with an actionable message, and storage failures stay visible.
Shared profile facts remain standing context, while private facts and project memory remain excluded.
Built-in provisioning was then separated from skill reads. Skills, workspace, agent execution and
diagram controllers now invoke installation explicitly inside a transaction. The repository holds
an actor-scoped transaction lock so concurrent first reads share one installation. Initial browser
synchronization provisions before reading its page, and the shell reads projects after installation.
Failed metadata writes roll back the Inbox, notes and revisions. BuiltInSkillLibrary is removed;
BuiltInSkills now uses only actual repositories and its load method never provisions. Skill manifest
coordination, durable selection workflows and the remaining model families are still unfinished.

Skill document boundaries: SKILL.md YAML parsing now belongs to the remote import reader, with its
Zod frontmatter object in the skill model. Document edits carry either parsed manifest values or
instruction text, together with their required base revision. SkillLibrary no longer receives a
codec or reparses its own serialized output. Browser and server export use one shared serialization
service. The unused duplicate attachment-path validator is removed; its regression now exercises
the actual attachment upload service. Skill metadata decisions, identity/history policy and the
remaining workspace-mutation model behavior still require their separate global refactor.

Workspace transactions: all synchronized-write controllers now own their transaction, prepare the
version guard, perform their own domain operation, and complete the durable receipt. Workspace
cancellation also owns its transaction in the controller. WorkspaceMutationReceipts only uses actual
receipt and resource repositories; SyncMutationTransactions and its controller callback are removed.
Retry policy remains explicit and preserves the database-only setting for deferred indexing. Replay,
cancellation and rollback tests now execute the Notes and Workspace controllers directly. Durable
selection actions, settlement callbacks and the remaining model behavior are still unfinished.

Diagram ownership and deletion: DiagramLibrary now receives the actual ProjectRepository, replacing
the narrowed reader interface that concealed ProjectCatalog. Both creation and replacement require
an owned project and a source note from that project. Permanent deletion requires a trashed diagram;
the database checks the trash state in the delete statement, so a concurrent restoration survives.
Saved note references remain intact after deletion. PostgreSQL tests cover that stored-reference
policy and restoration race. The existing editor displays an unavailable preview for a missing
diagram; this batch does not claim browser verification of that scenario. Diagram model decisions,
clipboard references and the remaining publication races are still unfinished.

Run settlement: execution, workflow and recovery controllers now own their settlement transactions.
RunSettlements only claims a terminal transition and writes the terminal events through actual
repositories. It no longer invokes a controller callback or owns a transaction. The terminal-state
decision moved out of the agent model into that focused service. Chat completion saves session state,
consumed decisions and conversation output before terminal events in the same controller transaction.
PostgreSQL coverage now executes the real lifecycle controller, including competing workers,
cancellation and terminal-event storage failure. Reconstructible selection inputs and the hidden
execution-controller ports remain unfinished.

Skill body approval: save_skill and edit_skill now carry the prepared document and base revision
through the existing durable review checkpoint. Notes coordinates both note and skill body writes,
with an explicit target requirement for the skill tools. The tool factory no longer rebuilds skill
patches against a later body or calls an unguarded save. The browser displays the saved comparison;
missing reviews block individual and grouped approval while rejection remains available. Skill
metadata and publication history remain unchanged. The prior hand-written skill controller mocks
were replaced by tests through the real Notes controller and shared content fake. Skill identity,
lifecycle and the wider model migration remain unfinished.

Skill display name: the note title is the sole editable display name. Skill domain values no longer
carry a second name. Server summaries and local workspace views derive it from the current note.
Legacy display-name commands rename the note through the controller's document consequences and
transaction. The existing skills.name sync column remains a database-maintained projection for older
clients; migration 0057 backfills it and keeps both journal records atomic. The editor no longer
stages a second name write. Portable slugs, publication and restoration policy are unchanged. Real
PostgreSQL and offline-view regressions cover renames and rollback. Skill metadata behavior still
needs to leave models, and the remaining lifecycle and global refactor work remains open.

Offline edit planning: workspace-mutations now holds command values and Zod schemas only. The shared
workspace controller owns optimistic edit planning and completeness checks. Command identity, draft
serialization and pending-publication projection have one focused shared service. Every synchronized
server controller resolves its command target before the receipt service checks or records it.
Skill metadata rules have one shared service called by browser and server controllers; SkillLibrary
receives the resolved metadata and no longer calls a model helper. The skills model now contains only
values and schemas. Metadata regressions run through the actual controller, and the offline behavior
tests follow their owning controller or service. Other domain decisions still in models, hidden
execution-controller ports and durable selection workflows remain unfinished.

Chat run lifecycle: the Agent controller now owns submission, execution, cancellation and restart
recovery. AgentRunExecutor and the separate execution/recovery controllers are removed. The factory
provides the actual reasoning runner, context services and settlement service. Submission tests now
execute the real lifecycle with repository and provider fakes, including real approval checkpoints.
A PostgreSQL regression reproduced context preparation overwriting concurrent cancellation; the
repository update now guards the status in its write statement. WorkflowRunStarter still hides a
controller, selection inputs are not yet reconstructible, and the wider model migration remains open.

Promise extraction runs: Todos now owns submission, provider/rule selection, execution, cancellation
settlement and queued recovery. PromiseRequests uses actual run, event and conversation repositories;
it stores the complete selection, responsibility filter and frozen generation settings. The browser
retains an account-scoped request ID until a receipt arrives. Duplicate delivery returns the same run,
including after deployment settings change. The controller performs extraction outside the write
transaction, then conditionally claims completion and saves proposals, accepted tasks and result events
atomically. A cancelled or stale selection cannot commit those writes. PromiseDiscovery no longer
constructs another service or invokes a rule fallback. Both generation modes use the stored submission
time for relative dates; a regression reproduced a resumed September 1 request resolving tomorrow
against September 16, and now preserves September 2. PostgreSQL covers concurrent submission, queued
reconstruction, cancellation and result-event rollback. The other selection actions still use the
closure-based WorkflowRunner; their migration and the global model cleanup remain open.

Queued chat recovery: startup now resumes persisted chat runs that have not claimed execution yet.
A regression previously left a committed request queued forever after recovery. Running/cancelling
settlement stays separate, and the queued-chat query excludes workflow runs. Promise extraction keeps
its own queued recovery in the Todo controller. A PostgreSQL contract checks the query against both
running chats and an actual queued note-action request.

Tool activity journaling: event outcome selection and journal projection now belong to the focused
conversation service. The Agent and Diagrams controllers call that same implementation before their
journal writes. Models retain the event and activity values; they no longer execute these decisions.
The old rationale that placed behavior in models to avoid service dependencies is removed. The wider
model migration remains open.

Saved note actions: browser storage and in-memory note stores now include the account identity.
The browser reader owns JSON parsing through a model schema. Its fake stores the same typed values
without casting unknown records to never. Native session-storage regressions cover account switching,
another account clearing its actions, unscoped legacy records and corrupt account records. Legacy
unscoped entries are not assigned to a signed-in account because they carry no ownership evidence.

Reference search runs: References now owns durable submission, execution, cancellation settlement and
queued recovery. Promise extraction and reference search share SelectionRequests for request identity
and persisted input, with no executable callbacks. SelectionSubmissions retains browser retry identity
per account and action. Reference searches retain their selection and chosen model; the controller
performs provider work before the transaction that claims completion, writes proposals and records the
result. The provider adapter parses citations at the repository boundary. ReferenceDiscovery assigns
source tiers and confidence, and ReferenceRanking owns ordering. Tests use the actual ranking service
instead of copying its rules into a fake. Missing credentials now fail explicitly, and valid provider
sources are no longer cut off after six entries. PostgreSQL covers concurrent duplicate submission,
cancellation without writes, result-event rollback and queued reconstruction. Relationship and diagram
actions still require the same durable ownership migration; the global refactor remains open.

Related-note discovery runs: Relationships now owns durable submission, retrieval, rule/model
classification, completion and queued recovery. It uses the same SelectionRequests storage service and
account-scoped browser retry identity as promises and references. The stored generation choice survives
configuration changes. The relationship capability supplies the actual model adapter and deterministic
rules separately; the discovery service no longer constructs or invokes a fallback service. Selection
validation returns its resolved note without creating an anchor, so retrieval and classification happen
before the write transaction. Completion, anchors, provenance, proposals and result events commit
together. The PostgreSQL contracts use actual vector retrieval and prove duplicate submission,
cancellation, rollback and recovery. Diagram actions still use the workflow callback and remain the
next P11 migration; the broader model and content-change work is not complete.

Diagram publication failure: The controller now commits generated proposals or saved Mermaid
revisions together with completion of their generation run. Provider execution and session cleanup
finish before the write transaction. Proposal or indexing failure leaves the run failed; completion
failure rolls back the generated output. Regression tests reproduced the previous completed run after
a failed proposal and the retained revision after failed indexing. PostgreSQL contracts cover both
proposal and completion write failures. The duplicate outer workflow and durable diagram input
migration remain open P11 work.

Durable diagram actions: Diagrams now saves generation, inline Mermaid revision and draw.io
conversion input before execution. The same run owns its provenance, provider execution, saved output,
result event and completion. Queued requests resume from stored input and model choice; running work
interrupted by a restart still fails explicitly. Prepared context retains request identity, so a lost
receipt can be retrieved even when the model catalog is unavailable. Browser request identity is
account-scoped and lasts until a receipt is acknowledged. NoteActionRequests replaces SelectionRequests
as the shared persistence service for all four note-action controllers. WorkflowRunner, its callback
port and its fake are removed. Their receipt, success, failure and cancellation tests are replaced by
controller behavior tests and PostgreSQL contracts for actual diagrams and proposal storage.
The remaining global model ownership and content-change review stays open.

## Validation principles

Tests describe observable behavior and transactional consequences. Do not preserve tests that
only assert a moved class exists. Use shared in-memory fakes and real PostgreSQL contracts.
Exactly one assertion per test. Required model schemas must still be exercised with real
producer output; moving a wrapper must not weaken boundary validation.
