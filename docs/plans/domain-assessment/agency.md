# Commitments, proposals, memory, and agent execution

Snapshot: `74215c9a`. Families 09–11 and 16–19. Source inspection only unless `validation.md`
records a reproduction. Test names are evidence of intended coverage, not pass claims.

## Semantic model and workflow traces

| Concept              | Meaning and guarantee                                                                 | Trace                                                                           |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Task/commitment      | Project-owned work with responsibility and completion; categories are user vocabulary | UI draft/agent → `Todos` → shared decisions/catalog → repository                |
| Extracted commitment | An inference with uncertainty, deadline wording and source; not an accepted task      | Selection action → `SelectionOrigins` → discovery → proposal → trust/acceptance |
| Proposal             | Reviewable change with origin, decision lifecycle and recorded acceptance effects     | Cards/remotes/tools → reviewed acceptance → transaction/application/inbox       |
| Remembered fact      | Profile/project fact with sharing rules; direct edit differs from replacement lineage | Memory UI/tools → `Memory` → library → records/indexing                         |
| Conversation         | Durable dialogue independent of an execution attempt or provider encoding             | Chat store → submit/archive → user-visible history                              |
| Requested context    | User-selected resources/passages with truthful inclusions and exclusions              | Mentions/selection/pane focus → frozen input → resolved execution context       |
| Agent run            | Durable attempt with frozen intent, decisions, events and one terminal outcome        | Remote → ledger/submission → execution/approval/cancellation → stream/UI        |
| Tool authority       | Execution permission distinct from discovery and approval                             | Preferences/catalog → allowed registry → agent or authenticated MCP surface     |
| Provider replay      | Model input derived from retained dialogue/session data                               | Buffer → content externalization → provider session                             |
| Search intent        | Query extracted from multi-turn dialogue                                              | Search controller → `ConversationSummary.condense` → retrieval                  |
| Resume point         | Evidence of consumed stream progress                                                  | Server event cursor → transport → chat state → local persistence                |

Do not collapse these into a generic conversation manager. Explicit protocol input distinctions
under ADR 0034 and private-memory rules under ADR 0026 remain necessary.

## Current findings

### A01 — Reversal lacks evidence that subsequent work is unchanged

**Static contract mismatch.** `SuggestionsController.revert` promises that the applied artifact
still matches. `SuggestionApplication.revert` deletes by `appliedArtifactId`; task deletion checks
existence, not accepted version. `MemoryLibrary.revert` similarly removes/restores lineage without
comparing subsequent edits.

Extend stage 5 of `docs/plans/domain-composition.md`. Persist application effects atomically with
acceptance, including affected identities and reversal preconditions. Reverse all recorded effects
atomically; reject stale or legacy effects without sufficient evidence. Do not infer that a currently
existing artifact is the accepted artifact state. Keep origin and decision history after deletion.

Keep “reverting removes the applied artifact”, acceptance rollback, and “keeps an accepted suggestion
when artifact revert fails”. Add changed tasks/memory, later replacements, stale multi-effect reversal
and legacy records. Assert preserved saved work and proposal status. This needs a schema migration
and compatibility policy for existing accepted proposals, not just a service extraction.

### A02 — Automatic acceptance returns stale proposal state

**Static, still present after PR #50.** `Todos.extractPromises` discards the result of
`suggestionAccepter.accept` and returns the original proposed suggestion alongside the created task.
`Memory.propose` returns the accepted value in the analogous path.

Return the actual accepted suggestion; retain the original only when pending. Preserve kind-specific
return types. Test returned status and applied identity against persisted acceptance. The existing
“creates a todo when the pipeline trust policy authorizes it” does not establish response truth.

### A03 — Shared task rules still allow inconsistent creation and staged persistence

**Continuation, 2026-09-23:** This is a historical finding. The task-edit and task-creation
slices now implement controller-owned decisions with shared services; see the
[continuation register](continuation.md) for PR state and validation. These changes remain
unmerged. The snapshot description below must not be used as a description of this branch.

**Static, partly resolved by PR #47.** Completion and responsibility normalization are now shared.
However, `Todos.update` still writes ordinary fields and status separately; direct tool updates lack
an enclosing transaction in this method. `decideTodoCreation` retains `waitingOn` for responsibility
`mine`, while `applyTodoEdit` clears it.

Resolve the full authoritative edit once and persist once. Establish whether waiting-on-mine is valid;
recommended behavior follows existing editing normalization. Keep shared browser/server decisions.
Test create/edit equivalence and failure of combined field/status updates without partial state.
Retain completion timestamps, reopening, explicit-null clears, ownership and linked-note validation.

### A04 — Batch creation exists only in the tool factory

**Continuation, 2026-09-23:** [PR #83](https://github.com/ChidiRnweke/FollowThrough.ai/pull/83)
implements durable controller-owned batches in the open stack. This branch uses that path and
retains its rollback and retry tests. The historical absence below no longer describes this branch;
PR #83 is still open.

**Static.** `agent-tool-factory.ts:create_todos` loops over `Todos.create` without batch transaction
or durable retry identity. A later failure can retain earlier tasks and a retry can duplicate them.

Define a task-batch capability at the application boundary. Recommended policy: validate every entry
and commit atomically, preserving input order. Repeated-delivery safety also requires a stable request
identity and a persisted batch outcome; atomicity alone does not prevent duplication after a lost response.
If partial creation is intentional, expose per-entry
outcomes and retry identities instead. Test later-entry failure and repeated delivery. The current
numbered successful-dispatch tests do not prove these guarantees. Add the capability to the total
tool-coverage map and capability factory wiring; leave schema adaptation in the tool adapter.

### A05 — Memory operation and scope are not expressed by the payload

**Static.** `MemoryChangePayload` permits operation plus optional target/content; `Memory.toPayload`
and `MemoryLibrary.applyUpdate/applyRemove` repeat required-field checks. Update takes scope from the
target without proving agreement with requested scope. Actor ownership alone is not project agreement.

Use add/replacement/removal variants and explicit profile/project scope, parsed at request/storage
boundaries. Require target scope agreement. Preserve direct editing versus replacement lineage and
integrate A01 reversal effects. Keep private-memory/index-removal tests; add cross-scope proposals and
superseded targets. Confirm all producers before declaring historical rows invalid.

### A06 — Requested folder context is silently truncated

**Static.** `components/chat/workspace/mentions.ts:folderNoteIds` stops at 25; the displayed count
uses the truncated result. The comment promises equivalence to tagging all notes. No measured reason
for that selection loss was found.

Resolve all live descendants from a known-complete inventory. Keep context selection distinct from
provider token budgets; expose exclusions instead of silently changing intent. Replace “caps a large
folder” with completeness/explicit-exclusion tests. Candidate-popup size may remain a presentation
decision. Test duplicate titles and prefix collisions: chip liveness/removal currently use title text.

### A07 — Server replay consumes rows it does not advance past

**Static cross-layer mismatch.** `Agent.listRunEvents` filters unreadable rows while claiming the
cursor advances. `routes/api/agent/runs/[runId]/events/+server.ts` advances only for returned events
and closes when cursor reaches the latest stored cursor. Unreadable trailing rows can prevent closure.

Return consumed stored position separately from readable events, or explicit unreadable outcomes.
Preserve corruption reporting. Test a terminal run with an unreadable tail: progress advances, warnings
do not repeat indefinitely, and the stream closes. Integrate with A12 rather than adding separate cursor rules.

### A08 — Selection-driven actions have independent settlement semantics

**Static.** `WorkflowRunner.start` creates conversation/run/initial event sequentially; chat submission
uses a transaction and idempotent identity. Workflow execution is an in-memory closure. On completion,
it ignores a failed `running → completed` transition and still appends a completed event.

Extend existing composition stage 6. Share conditional terminal settlement and transactional initial
persistence while retaining ADR 0034's distinct inputs. Terminal events require successful transition.
Specify durable reconstructible action inputs before promising restart/retry. Test cancellation beating
a normally returned result, duplicate submission and partial initial writes. Preserve chat race tests.

### A09 — Trust vocabulary promises more than its consumers establish

**Static usage discrepancy; product intent unresolved.** Trust policy kinds include extract-promises,
relate, reference, agent and memory. Production auto-accept consumers found here are task extraction
and memory; references deliberately never auto-accept. Tool approval uses mode/classification.

Map every visible setting to an effective behavior. Separate permission, discoverability, approval and
proposal acceptance. Remove or relabel ineffective options only after checking intended history.
Preserve explicit reference review until superseded. Keep disabled-tool and read-token MCP tests.

### A10 — Proposal lifecycle admits states that cannot authorize reversal

**Static.** `SuggestionBase` permits accepted status without an applied artifact or decision time.
Later branches recover meaning through checks and casts. Model pending/accepted/rejected/reverted
states with the data each actually requires, alongside A01's effect record. Historical unreadable
records need explicit boundary outcomes; do not fabricate effects to satisfy a new type.

### A11 — Search-query generation falls back while claiming success

**Static.** `ConversationSummary.condense` returns trimmed provider content or the entire transcript
when content is blank/missing. Its sole test checks that the class is a function. This service builds
a search query; it does not compact persisted dialogue.

Name and test search intent. Default to explicit failure for unusable provider output under the existing
failure policy. If transcript fallback is deliberately chosen, represent it as a distinct outcome.
Test valid/blank/missing/rejected responses with a narrow transport seam. Preserve single-turn bypass.

### A12 — Browser resume state can be valid to its parser and invalid to its consumer

**Static.** `client/agent/runs/session-storage.ts` accepts `cursor: z.string()`; `ChatSession.attach`
uses `BigInt(cursor)`. A nonnumeric stored cursor passes parsing and later throws. The event callback
also persists its cursor before applying the event, so failed application can be skipped on resume.

Validate the cursor contract once at storage/event boundaries. Record progress only after successful
application or an explicit recoverable failure. Test nonnumeric persisted cursor, event-application
failure, persistence failure and replay after reconnect. Investigate malformed JSON in transport with
the same consumed-event contract. Preserve “reports corrupt state instead of inventing an empty resume point”.

### A13 — Vision preparation starts outside run cleanup

**Static.** `AgentReasoning.execute` creates provider/tools/session and issues caption requests before
its `try/finally`. Requests lack the run abort signal. Missing/null content becomes a fallback sentence;
empty strings pass through unchanged.

Include all post-acquisition preparation in cleanup; propagate cancellation and explicit description
failure. Preserve native-vision behavior. Test cancellation before/during captioning, blank output,
provider rejection and preparation failure. Assert run outcomes, propagated content and resource lifetime
through an appropriate fake; do not substitute SDK call counts for domain evidence.

## Necessary behavior and deeper review

`ConversationBuffer` intentionally transforms provider replay while preserving stored history:
successful diagram source can be elided, failed arguments must remain repairable, active images differ
from persisted placeholders. Keep tests “keeps the source of a presentation that failed”, “keeps the
whole document in what is persisted”, and “still returns the image to the run that is in flight”.

`AgentReplayVirtualizer` preserves exact bytes behind actor/conversation-scoped pointers. Keep
“persists the exact bytes behind the pointer”, valid-JSON arguments, and unknown-item preservation.
Review only known content-bearing fields before replacing generic recursive string traversal.

Rewind changes both dialogue history and provider session under submission's transaction. Keep active-run
rejection, earlier turns, and retry input excluding rewind. Characterize mismatched journal/provider
histories after failed submission before changing absent-ordinal handling.

Project-transition instructions express conversational consent, not automatically hard authorization.
Review requested scope, current scope and origin separately. Keep current authority checks on execution
and retries. Remaining deep scenarios include provider replay after failed/paused runs, file retention
after deletion/rewind, local storage quota failures, and policy changes during active execution.

## Landed work to preserve

PR #47 shared task and direct-memory decisions; PR #48 integrated skill documents; PR #50 introduced
`SelectionOrigins` and kind-preserving proposal construction. Do not schedule those extractions again.
They do not resolve A01/A02 or the cursor/settlement concerns. Amend the existing composition plan's
remaining stages rather than maintaining two competing implementations.
