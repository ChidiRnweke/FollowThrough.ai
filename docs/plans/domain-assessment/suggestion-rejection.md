# Suggestion rejection review

## Semantic boundary

Rejecting a suggestion records a decision to leave its proposed change unapplied. It changes a
pending proposal to rejected, records the decision time and preserves provenance and payload. It
must not create an artifact, overwrite a competing decision or expose another actor's suggestion.
This is distinct from reverting an accepted change and its recorded effects (ADR 0003).

## Entry paths and returned state

The note review panel and inline suggestion widget use SuggestionActions.decide. The memory list
calls the same rejectSuggestion remote command directly. Draw.io dismissal passes through
NoteActionsStore and the note workspace. Each path waits for the command and synchronization;
failure stays visible through a toast or review error. The draw.io caller checks the failed result
before removing its pending review. The agent reject_suggestion tool invokes the same controller.

The remote command parses a UUID into SuggestionId and supplies the authenticated actor. Its parsed
input already satisfies the controller contract, so the redundant assertion is removed. The draw.io
store returns Suggestion or an explicit absent failure result instead of unknown. The existing
lastError and caller check remain its failure contract.

Suggestions.reject owns the transaction. SuggestionInbox loads through the actor-scoped repository,
requires pending status and an unexpired deadline, and requests a conditional transition from
proposed. SuggestionRecords updates by actor, ID and expected status; losing a competing decision
returns no row and becomes an explicit transition error. Rejection has no artifact dependency.
The workspace sync trigger publishes the changed record. Note and memory projections select
proposed status, so the synchronized rejected row leaves the pending set.

## Test disposition

Keep the lifecycle tests for rejection status and absence of artifacts. Keep inbox expiry and
conditional-transition tests, stored-payload boundary tests and the PostgreSQL test proving only
one competing expected-status transition succeeds. Keep acceptance/reversal effect and rollback
contracts; rejection does not replace those guarantees.

Add a controller test using the real SuggestionInbox with existing repository fakes to verify the
returned and stored decision, four terminal statuses, foreign ownership and a stale pending read
after acceptance won. These test observable outcomes rather than collaborator calls. No production
behavior change is needed in this workflow.

W10.13 is assessed across its current entry paths, state owner, persistence and return projections.
The source types affected by dismissal now express their known result. This does not mark the
whole suggestion namespace or W10.15 concurrency/effect assessment complete. Expiration policy
and archived note-less proposal listing remain separate review items. Browser failure paths were
traced in source; this slice does not claim a new authenticated end-to-end dismissal run.
