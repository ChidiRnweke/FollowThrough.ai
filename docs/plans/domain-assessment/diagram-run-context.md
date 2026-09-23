# Diagram run context ownership

## Meaning and entry paths

Direct generate/revise/convert operations and durable diagram actions both call Diagrams.generateForRun.
It loads the source and skills, records provenance, builds context and then opens the provider session.
The prepared context is durable run data. For a durable action, it augments the frozen input and model;
it must not replace that input with the direct workflow's context shape (ADR 0034).

AgentRunLedger.updateContext previously read a whole run and saved a replacement snapshot. It could
save prepared context after cancellation and could overwrite unrelated lifecycle fields if another
writer changed them between its reads and update. Context preparation is not a lifecycle transition.

Diagrams now opens a transaction for the context write. DiagramRunContext locks and reads the actor's
workflow run, verifies it is a running diagram request and resolves the prepared context. The service
retains the authoritative durable action input. The repository writes only context and its update time.
The old ledger context workflow is removed. Factories supply the real run repository to the focused
service; no service is hidden behind a repository interface.

Cancellation winning during preparation leaves the original unprepared action intact. The existing
durable execution path settles cancellation without publishing a diagram. Slow context construction
and provider work remain outside the context-write transaction. No migration or public response
change is required.

## Tests and remaining review

The new controller case cancels while provenance preparation is suspended, then checks the cancelled
run still has its original action input without prepared context. Existing cases retain provider
failure, source revision checks, model freezing, recovery, proposal rollback and cancellation during
generation. Service cases cover durable/direct shapes, non-running states and wrong workflow kind.

PostgreSQL contracts verify cancellation winning the context row lock, actor isolation and targeted
persistence retaining lifecycle fields. Existing publication and durable-generation contracts use the
new context owner with their transaction-bound repositories.

AgentRunLedger still owns direct run creation/completion/failure. Its unused capabilities, general run
transition rules and chat preparation remain separate assessment work. This slice does not close the
agent/diagram families. The dependent PR records observed verification results.
