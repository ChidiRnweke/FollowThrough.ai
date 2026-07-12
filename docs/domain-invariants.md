# Domain Invariants

This document is the independent behavioural specification for backend models, services, controllers, and repositories. Tests should name the invariant they verify and use one primary assertion per test.

## Projects and filesystem

- A project belongs to exactly one user.
- Project names are non-empty after trimming.
- Active project names are unique per user, case-insensitively.
- Archived projects do not appear in active project lists.
- A filesystem entry belongs to exactly one project and the same user as that project.
- A filesystem entry is a folder, note, or skill document.
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
- Mermaid revisions never mutate promoted draw.io diagrams.
- Promotion preserves a link to the source Mermaid diagram.
- Diagram labels are included in project-scoped retrieval.
- A skill is a skill-kind document in a project and is loaded in full only after its summary is selected.
- Skill usage records identify the skill, context note when present, and provenance.

## Retrieval and agent execution

- Search is always scoped to the actor and, when provided, a project.
- Search chunks are deterministic, carry a cryptographic content hash, and are replaced when their source revision changes.
- Identical source content is not embedded twice for the same indexing version.
- Vector candidates are reranked into the closed generic relationship label set.
- The agent receives the current project, note, selection, relevant retrieval results, conversation history, and selected skill instructions as context.
- An agent turn belongs to an actor-owned conversation; a foreign conversation identifier is indistinguishable from a missing one.
- User prompts, aggregated assistant responses, and tool lifecycle activity are persisted in chronological order.
- Only enabled skills from the active project may be injected, and every injected skill records its usage.
- Point solutions exposed as agent tools use the same controllers as direct editor invocation.
- Agent mutations go through suggestion envelopes unless a future invariant explicitly authorizes direct writes.
- External client failures map to typed domain errors and do not leave partial domain state.

## Transactions and isolation

- A transaction commits all domain mutations or none of them.
- Nested domain operations participate in the existing transaction rather than committing independently.
- Ownership checks occur before mutation, including join-table writes.
- Foreign identifiers and nonexistent identifiers have indistinguishable not-found behaviour.
