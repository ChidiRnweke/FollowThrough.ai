# Domain Invariants

This document is the independent behavioural specification for backend models, services, controllers, and repositories. Tests should name the invariant they verify and use one primary assertion per test.

## Projects and filesystem

- A project belongs to exactly one user.
- Project names are non-empty after trimming.
- Active project names are unique per user, case-insensitively.
- Archived projects do not appear in active project lists.
- A filesystem entry belongs to exactly one project and the same user as that project.
- A filesystem entry is a folder, note, or skill document.
- Skill documents are excluded from ordinary note listings and project trees and remain discoverable through Skills.
- Folder entries do not carry authored document content.
- A root entry has no parent. A nested entry has exactly one parent.
- A parent must be a folder in the same project and owned by the same user.
- An entry cannot be its own parent or a descendant of itself.
- Moving an entry preserves its complete subtree.
- Sibling order is explicit and stable; editing content does not reorder siblings.
- Moving an entry assigns a valid sibling position and closes any ordering gap left behind.
- Cross-user and cross-project identifiers are reported as not found and never reveal foreign data.
- Archiving a project hides its tree and project-scoped active work without deleting history.

## Notes, revisions, and anchors

- A note title is non-empty after trimming.
- A save may only mutate a note owned by the actor.
- A save against a stale revision is rejected without changing the note.
- A note content save atomically compares its base revision; concurrent saves from one base have
  exactly one winner.
- A note ETag is an opaque function of persistent note identity and content revision. A successful
  conditional save returns the next ETag; a conflict preserves the current remote note and ETag.
- Retrying an already-applied note mutation with identical synchronization content is idempotently
  acknowledged.
- Reopening from a cached loader snapshot never downgrades a device record whose acknowledged base
  has a higher content revision or turns its pending work into a false conflict.
- A no-op save does not increment the current revision or create another revision snapshot.
- A meaningful save increments the revision exactly once and records an immutable snapshot.
- Anchors are created only from a non-empty selection in the current note revision.
- Anchor offsets are ordered and bounded by the selected document text.
- Anchor repair succeeds only when its quote can be located unambiguously.
- Failed anchor repair leaves the prior anchor intact and marks no false location.
- Saving a note, recording its revision, repairing anchors, and replacing its search index are atomic.

## Todos

- A todo belongs to exactly one user and project.
- A todo title is non-empty after trimming.
- Waiting-on work stores a human-readable counterparty without requiring a global Person entity.
- A todo may link to a source anchor only when the anchor belongs to a note in the same project and owned by the same user.
- Deleted todos never appear in active lists.
- Completed todos carry a completion timestamp; reopening them clears it.
- Todo status changes are visible through every query of the same todo identity.
- A todo may link to an active ordinary note in its project; clearing that link restores its anchor-derived source without changing provenance.
- Waiting-on todos may omit a counterparty, and assigning responsibility to the user clears any counterparty.
- Partial updates preserve every field not supplied by the caller.
- Project, responsibility, status, note, and due-date filters never leak another user's todos.

## Relationships and references

- A relationship joins two distinct notes owned by the same user.
- Both related notes belong to the same project unless an explicit cross-project relation is requested by a future contract.
- Relationship labels are semantic and generic: prior decision, contradicts, elaborates, or mentions.
- Duplicate relationships of the same kind are idempotently updated rather than duplicated.
- Reference discovery may return no result and must not pad the result set.
- References rank standards and official sources above vendor and community sources when relevance is otherwise equal.
- Reference suggestions are never auto-accepted.
- Accepted references retain source anchor and provenance links.
- Accepted references expose their source anchors to note views so resolvable text can render as an inline link; missing or ambiguous anchors never attach a URL to guessed text.

## Suggestions, provenance, and trust

- Every AI-produced artifact starts as a suggestion carrying provenance and, when selection-based, a source anchor.
- Suggestion lifecycle transitions are proposed to accepted, rejected, expired, or reverted; terminal transitions cannot be applied twice.
- Only accepted suggestions can be reverted.
- Expired suggestions cannot be accepted.
- Accepting a suggestion and applying its artifact are atomic.
- Reverting a suggestion and reverting its artifact are atomic.
- A failed artifact mutation rolls the suggestion back to its prior state.
- Auto-accepted artifacts remain visibly AI-originated and reversible.
- Trust is evaluated per pipeline; a policy for one pipeline cannot authorize another.
- Explicit promises may be auto-accepted only when the configured confidence threshold is met.
- References never auto-accept regardless of a stored threshold.

## Diagrams and skills

- A diagram belongs to a note in the same user and project boundary.
- Inline Mermaid source is sent directly to the diagram agent for conversion and is never registered as a durable diagram merely to enable conversion.
- Mermaid revisions never mutate an accepted draw.io diagram; the draw.io copy is independent after acceptance.
- Agent-produced draw.io XML remains an ordinary diagram suggestion and cannot create a diagram until the user explicitly accepts it in the source note.
- Draw.io XML is untrusted at agent submission, suggestion application, and every save. It must be well-formed, uncompressed `mxfile`/`diagram`/`mxGraphModel` XML with valid cell references and finite geometry, and it cannot contain doctypes, scripts, event handlers, unsafe URLs, or unsafe styles.
- A note-scoped draw.io editor can load or save a diagram only when both the route note and the draw.io diagram belong to the current actor and to each other; foreign and mismatched identifiers remain indistinguishable from missing data.
- Hosted draw.io messages are accepted only from the active iframe at exactly `https://embed.diagrams.net`, are schema-validated before use, and replies use that exact target origin. Message listeners are removed when the editor is destroyed.
- Draw.io SVG previews are sanitized on the server and displayed through an image resource, never inserted into the application DOM as markup.
- Explicit draw.io saves replace the current XML, preview, searchable labels, and retrieval index using last-save-wins semantics. This slice creates no diagram revision or restoration history.
- Diagram labels are included in project-scoped retrieval.
- A skill is a skill-kind document in a project and is loaded in full only after its summary is selected.
- Agent context contains enabled skill summaries and trigger hints, never full instructions.
- Loading a skill records the skill, context note when present, and provenance; merely advertising its summary does not record usage.
- Each user has one idempotently provisioned FollowThrough guide stored in General and listed in Skills. Provisioning upgrades only recognized untouched stock versions and never overwrites an edited, renamed, published, or adopted legacy copy.
- Restoring a skill version creates a new current immutable revision and preserves all earlier revisions.

## Retrieval and agent execution

- Agent runs move only through the documented queued, running, awaiting-approval, cancelling, and terminal transitions; terminal runs are immutable.
- A conversation has at most one non-terminal agent run.
- Agent events are committed before a client can observe them, and their global cursors define replay order.
- Every worker heartbeat, event append, projection, and status mutation is fenced by the current lease token.
- Closing or losing a browser connection never cancels a run; cancellation is an explicit persisted command.
- A logical submitted request records its user prompt once. Idempotent resubmission and manual retry never append that prompt again.
- Automatic replay is forbidden after any non-read tool effect has started.
- Tool receipts prevent duplicate database-visible effects, but no exactly-once guarantee is made for an uncertain external effect.

- Search is always scoped to the actor and, when provided, a project.
- Search chunks are deterministic, carry a cryptographic content hash, and are replaced when their source revision changes.
- Identical source content is not embedded twice for the same indexing version.
- Vector candidates are reranked into the closed generic relationship label set.
- The agent receives the current project, note, selection, conversation history, and enabled skill summaries as context. Workspace state, note content, todos, user and project memory, knowledge-base evidence, relevant skill instructions, and memory proposals remain available through a fixed first-class tool set rather than eager injection.
- Every other app capability is excluded from the direct tool surface, discovered on demand through tool search, and dispatched only by its exact registered name and validated schema.
- An unknown or misrouted function name produces a failed tool result with every registered name within three Levenshtein edits, never executes a guessed tool, and returns control to the model instead of terminating the run.
- A dynamically dispatched mutation retains its classification and approval requirement; user-facing events expose the inner action while approval resumption remains keyed to the unchanged SDK call identity.
- An agent turn belongs to an actor-owned conversation; a foreign conversation identifier is indistinguishable from a missing one.
- Conversation model and execution-mode overrides persist independently of user defaults; precedence is conversation override, user default, then environment default.
- The effective model is retained on assistant messages and agent provenance.
- User prompts, aggregated assistant responses, tool arguments, outputs, failures, approvals, and rejections are persisted in chronological order.
- Every relevant non-agent controller method is classified as a read, proposal, mutation, or an explicit exclusion, and exposed tools invoke those same actor-scoped controllers.
- Read and proposal tools execute immediately. Proposal pipelines remain reviewable and never gain durable-write authority from chat execution mode.
- Agent mutations are authorized only by approval of that specific pending call or by the persisted effective auto-accept mode.
- Approval-required runs persist their serialized SDK state and pending calls; decisions resume the same actor-owned run, and rejection is returned to the model for recovery.
- OpenRouter chat models must advertise tool support for new selection. A transient catalog failure may use stale catalog data and never invalidates an already configured effective model.
- Every OpenRouter agent request preserves the registered application tools and also makes bounded web search available; the model decides whether to use it and must link sources that inform its answer.
- Every attachment belongs to exactly one project and optionally one note. Project attachments never create note revisions; note bundle attachments do.
- Attachment processing is durable as queued/processing/ready/partial/unsupported/failed, indexes at most 50 chunks, and failure never removes the downloadable file.
- Retrieval chunks have exactly one primary source: note, memory entry, or attachment. Attachment retrieval remains actor- and project-scoped.
- Agent-triggered reference discovery uses the conversation's effective model, while direct reference discovery uses the configured OpenRouter default. Both remain proposal-only workflows.
- Reference discovery accepts only valid HTTP(S) citations from OpenRouter's native search metadata, removes duplicate URLs, and proposes at most six sources.
- External client failures map to typed domain errors and do not leave partial domain state.

## Transactions and isolation

- A transaction commits all domain mutations or none of them.
- Nested domain operations participate in the existing transaction rather than committing independently.
- Ownership checks occur before mutation, including join-table writes.
- Foreign identifiers and nonexistent identifiers have indistinguishable not-found behaviour.

## Ambient agent application context

- Each UI chat submission captures one immutable, versioned application-context snapshot immediately before transport submission. Retries reuse that frozen input.
- A conversation's origin project and note are fixed when the conversation is created. Per-turn screen context may change but never rewrites the origin.
- References resolve in this order: selection, active resource or interaction-focused pane, the single other visible pane, explicit context chips, then background tabs as awareness only.
- Full selected text remains in frozen run input for tools; model-facing application context is capped and dirty pane excerpts are never treated as authoritative saved content.
- Application context is system-instruction data only. It is never appended to user prompts, persisted messages, SDK session items, SSE text events, or rendered chat output.
- Crossing into a different project without explicit compare/merge or prior consent produces a text-only clarification before project-scoped tools or actions.

## Inline suggestions

- An inline suggestion never mutates a note, creates an agent run, records provenance, or writes a
  conversation message. Accepting one produces an ordinary note edit through the normal save path.
- Each eligible typing pause issues one completion request. The server deterministically assembles
  context and performs one completion-model call; there is no warm request, briefing-model call, or
  cached model-generated brief.
- Completion context contains the authoritative current note title and full text, active shared user
  memory, and project-scoped retrieval across indexed notes, diagrams, attachments, and project
  memory. Retrieved passages carry their source titles into both retrieval and the model prompt.
- Up to twenty active shared user memories are included directly. Larger or oversized sets are
  reranked against the caret context and bounded to eight entries and a fixed token budget; reranker
  failure degrades to a deterministic recent-memory subset rather than dropping completion.
- Project retrieval is restricted to the note's own project, excludes the already-injected current
  note, and keeps at most eight reranked passages.
- A completion never repeats text immediately preceding the caret, and yields at most two sentences.
- A suggestion request that is superseded, refused by the spend budget, or fails is abandoned
  silently: the writer sees no ghost text and no error.
- Empty or failed project retrieval does not suppress completion when note or user context remains.
- Typing again aborts the stale request; an abandoned request cannot display ghost text at a newer
  caret position.
- Ghost text is offered only at a resting caret in ordinary prose: never across a selection, never
  mid-word, and never inside code, diagram, math, or table content.
