# Database schema

This is the initial persistence model derived from `project-brief.md` and
`pages-and-flows.md`. The Drizzle definition in `src/lib/server/db/schema.ts` is
the source of truth.

## Design decisions

- Every domain row belongs to one user. There are no workspaces, memberships,
  sharing permissions, or collaborative ownership rules; authentication simply
  establishes the `user_id` used to isolate every query.
- Notes store canonical ProseMirror JSON plus derived plain text for previews and
  lexical search. Skills are notes with a one-to-one metadata record.
- Todos are independent records. An editor todo node stores only a todo ID, so
  the editor, Today, and kanban always render the same object.
- Source anchors use stable editor node IDs plus quote context and offsets. This
  gives AI artifacts a resolvable link even after normal document edits.
- Notes keep immutable ProseMirror snapshots at meaningful save boundaries.
  `notes.current_revision` identifies the live version, while `note_revisions`
  supports history, restore, and safe AI-edit reversal without collaborative
  editing machinery.
- Provenance is shared by every AI-created artifact and suggestion. Suggestions
  retain their proposed JSON, decision, applied artifact ID, and reversal state.
- Entity `type` is text until the open entity taxonomy is decided. Entity links
  are many-to-many with notes and todos.
- Mermaid and draw.io share a diagram record. Promotion creates a draw.io record
  pointing to its Mermaid predecessor, preserving both history and ownership.
- Search chunks are model-dependent retrieval units backed by pgvector using
  3072-dimensional embeddings.
- Local Postgres uses the pgvector image, and the initial migration enables the
  `vector` extension before creating retrieval tables.

## Deliberately deferred

- Row-level security policies and OAuth provider/account/session tables.
- Configurable kanban columns. Status is an enum matching the current v1 flow.
- Extracted entity mentions as distinct occurrences. `note_entities` currently
  represents the entity-to-note association and retains one source anchor.
- A production vector index. Its operator class and tuning depend on the final
  embedding model and expected corpus size.

## Invariants enforced in services

Postgres foreign keys cannot prove that related rows belong to the same user.
The service layer must scope every query by the authenticated user, reject
cross-user references, and apply note saves or accepted suggestions
transactionally with their revision, artifact, and provenance records.
