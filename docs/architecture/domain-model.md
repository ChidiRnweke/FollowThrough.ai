# Domain composition

## Ownership and participants

An owner stores the authoritative record and controls its lifecycle. A participant supplies only
what another operation needs. A reference projection contains named display fields; it is not a
second definition of the record.

| Concept                            | Owner                                      | Composition rule                                                                                    |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Project scope and placement        | Projects and note entries                  | Placement needs identity, parent, order and authoritative sibling facts.                            |
| Task applicability and transitions | Todos                                      | Task edits use `applyTodoEdit`; adapters supply resolved inputs.                                    |
| Document drafts and publication    | Notes; draw.io for diagram documents       | Editing changes the draft. Publication creates a snapshot. Historical restoration copies forward.   |
| Skill metadata and manifests       | Skills                                     | Note services own the underlying document and history. Controllers coordinate both owners.          |
| Selection origin                   | Note anchors and provenance                | One resolved origin supplies the source identity for proposed changes.                              |
| Proposal application               | Suggestions and the affected record owners | Application effects describe what changed and the versions produced. Undo needs that evidence.      |
| Durable execution                  | Agent and workflow runs                    | Settlement coordinates state, outcome and terminal events. Each execution path keeps its own input. |
| Search derivation                  | Knowledge search                           | Format adapters prepare index/remove plans. Shared indexing applies them.                           |
| Export derivation                  | Deliverables                               | Shared preparation resolves content and assets; DOCX and PDF retain their layout adapters.          |

This table records the accepted target. It does not claim that every extraction has landed.

## Decisions and adapters

A pure operation has the shape `decide(command, resolvedFacts, context) → change`. Its types retain
the relationship between the command and its result. It takes only facts needed for its decision.
It performs no I/O and does not interpret untyped effects.

Browser adapters read local records and prepare durable outbox entries. Server adapters read
authoritative records and recompute the same decision. Missing cached inventory is unavailable
data, not proof of absence. Operations that require complete facts obtain them online or report
the offline limitation while retaining the draft.

Controllers coordinate service calls and transactions. Domain writes, required secondary writes
and sync completion commit together. External execution and notifications follow committed state.
Services do not depend on other services. Capability factories supply shared instances.

Models remain isolated. Aggregate types accept foreign participants as type parameters where they
carry complete records. Permitted composition layers supply the concrete types. A small named
reference projection is appropriate where only identity and display fields are required.

## Compatibility

The refactor preserves RPC names, resource identities, sync commands, persisted browser formats,
editor concurrency bases and historical snapshots. Proposal undo availability is additive.
Existing accepted proposals without sufficient application evidence cannot gain invented preimages.

## Implementation record

The first extraction removes duplicate implementation-exported service contracts. Narrow interfaces
remain in each domain's `contracts.ts`. Project create/move results now take a document participant;
controllers and the browser adapter supply `Note`. Project trees keep an explicit entry projection.
Task, relationship and suggestion views keep only an identity/title note reference.

Further work remains in aggregate note views, workspace command decisions and read assembly, skill
document writers, selection origins, durable proposal effects, execution settlement/subscriptions,
indexing and attachment recovery, and export preparation. Each extraction must delete the old
implementation in the same change. Behavior corrections require separate evidence.

See [ADR 0041](../src/content/docs/decisions/0041-share-domain-decisions-between-browser-and-server.md)
and the [initial measurements](domain-composition-baseline.md).
