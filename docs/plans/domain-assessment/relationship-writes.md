# Relationship write ownership

## Concept and guarantees

A relationship is a directed edge between two notes in one project. Its semantic identity is
the source note, target note and relationship kind. Repeated acceptance must not replace an
existing edge's identifier or origin. An equal explanation is unchanged; a changed or absent
explanation records both snapshots so proposal reversal can restore the original value.

The Suggestions controller owns acceptance and effect recording in one transaction. Notes owns
the save, discard and restore transactions that reconcile document mentions. RelationshipGraph
validates endpoint ownership, project agreement and origins, then resolves the write under the
repository's transaction-scoped semantic-edge lock. That lock also covers an absent edge.
The repository persists resolved records; it no longer chooses a proposal effect or starts a
nested transaction. The relationship model contains values and schemas only.

## Entry paths and dispositions

- Suggestions.accept → applySuggestion → RelationshipGraph.createWithChange → effect recording:
  retain the public response and transaction. Move the create/change/no-change decision from the
  repository/model to RelationshipGraph. Retain the before/after effect mapping and reversal checks.
- Notes.save/discardDraft/restoreRevision → RelationshipGraph.reconcile: retain document-owned
  mentions, same-project filtering and preservation of inferred relationship kinds. New mentions use
  the same locked write path. Existing reconciliation tests remain with the service.
- RelationshipGraph.readContexts and Notes.get assemble backlink views without changing records;
  retain these paths and their existing view tests.
- PostgreSQL repository: retain actor-scoped advisory and row locks. Replace insertWithChange with
  a locking read, insert and resolved update. Preserve explicit SQL NULL when clearing an explanation.
- Repository fake: remove domain policy and enforce uniqueness. It retains actor-filtered reads and
  persistence behavior. It does not simulate PostgreSQL locks.

## Test dispositions

- Keep graph validation and mention-reconciliation regressions: these remain service guarantees.
- Add write-decision cases for unchanged identity/origin/timestamps, modified snapshots and clearing.
- Replace the repository's idempotent-upsert test with a real-service PostgreSQL contract using
  concurrent connections. The database is responsible for locking and storage, while the service
  now owns semantic idempotence. Add a PostgreSQL nullable-clear case.
- Retain the proposal-reversal contract, but apply its change through the real graph. Its old fixture
  linked notes in different projects, which the production service rejects; the target now belongs
  to the source project before the relationship is created.

This slice reviews the relationship-write portion of W10.09, W10.14–W10.16. It does not mark those
whole workflows assessed: proposal presentation, stale-review behavior and cross-feature reversal
still need their independent dispositions. Verification and delivery are linked in the continuation
register after publication.
