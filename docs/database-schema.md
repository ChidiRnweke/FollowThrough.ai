# Database schema

This is the initial persistence model derived from `project-brief.md` and
`pages-and-flows.md`. The Drizzle definition in `src/lib/server/db/schema.ts` is
the source of truth.

## Design decisions

- Every domain row belongs to one user. There are no workspaces, memberships,
  sharing permissions, or collaborative ownership rules; authentication simply
  establishes the `user_id` used to isolate every query.
- Notes store canonical ProseMirror JSON plus derived plain text for previews and
  lexical search. Skills are notes with a one-to-one metadata record. Nullable
  built-in keys are unique per user, so a provisioned skill keeps its identity
  after user edits or renaming.
- Todos are independent records. An editor todo node stores only a todo ID, so
  the editor, Today, and kanban always render the same object. A nullable linked
  note is an editable association; the source anchor remains immutable provenance
  and becomes the effective source whenever the linked note is cleared.
- Source anchors use stable editor node IDs plus quote context and offsets. This
  gives AI artifacts a resolvable link even after normal document edits.
- Notes keep immutable ProseMirror snapshots at meaningful save boundaries.
  `notes.current_revision` identifies the live version, while `note_revisions`
  supports history, restore, and safe AI-edit reversal without collaborative
  editing machinery.
- Provenance is shared by every AI-created artifact and suggestion. Suggestions
  retain their proposed JSON, decision, applied artifact ID, and reversal state.
- Projects own recursive folder, note, and skill entries. Todos belong directly
  to projects and store a waiting-on counterparty as free text.
- Mermaid and draw.io share a diagram record. Promotion creates a draw.io record
  pointing to its Mermaid predecessor, preserving both history and ownership.
- Search chunks are model-dependent retrieval units backed by pgvector using
  3072-dimensional embeddings.
- Local Postgres uses the pgvector image, and the initial migration enables the
  `vector` extension before creating retrieval tables.
- `agent_preferences` stores each user's default OpenRouter model and execution
  mode. Nullable model and mode overrides on `conversations` preserve local chat
  choices without changing those defaults.
- `agent_runs` owns resumable workbench runs by user and conversation. It stores
  the effective model and mode, serialized Agents SDK state, chronological
  status, pending approval arguments, and terminal failures.
- Assistant `messages` retain the effective model. Tool inputs, outputs,
  decisions, and failures use chronological tool-activity messages in the same
  conversation.

## Deliberately deferred

- Row-level security policies and OAuth provider/account/session tables.
- Configurable kanban columns. Status is an enum matching the current v1 flow.
- A production vector index. Its operator class and tuning depend on the final
  embedding model and expected corpus size.

## Invariants enforced in services

Postgres foreign keys cannot prove that related rows belong to the same user.
The service layer must scope every query by the authenticated user, reject
cross-user references, and apply note saves, approved agent mutations, or
accepted suggestions transactionally with their revision, artifact, and
provenance records. Paused agent runs and their decisions are always loaded
through the actor-scoped repository.
