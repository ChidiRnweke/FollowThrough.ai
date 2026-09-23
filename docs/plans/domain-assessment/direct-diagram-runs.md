# Direct diagram run ownership

## Meaning and entry paths

Diagrams.generateMermaid, reviseMermaid, reviseInlineMermaid, convertInlineMermaid and promote use
publishGeneration for direct provider work. These calls create workflow conversation/run records,
prepare context and publish a result. Durable start/execute/recovery commands already have their own
queued action and settlement flow. Both paths keep proposal approval separate from generation.

Two controller regressions failed before this slice: a model catalog failure left a workflow
conversation, and successful direct runs had neither start nor finish timestamps.

Diagrams now reads preferences and model capabilities before creating records. A newly created
workflow conversation has no model override, so selection uses account and deployment settings.
The controller creates the conversation and resolved running run in one transaction. The same clock
sets creation, update and start times.

Before publishing, the controller locks the authoritative workflow run and resolves completion. It
saves the result and targeted settlement fields in one transaction. A cancellation that already won
prevents publication. Error settlement takes the same lock and writes failure only while the run is
still running. A late provider error therefore cannot replace cancellation or mask its original error
with an illegal-transition error. Completion and failure now carry finish times.

AgentRunLedger prepares values and persists resolved creation/settlement writes. Its unused read,
latest-conversation, pause and cancellation APIs and duplicate store interface are removed after
checking source/test callers. The repository writes only settlement fields. The general run snapshot
update no longer serves direct diagram creation or settlement. No migration or public shape change
is required.

## Test dispositions

Replace the ledger's class-existence test with behavioral creation and settlement cases. Controller
tests retain proposal/indexing rollback, validation, provider failure and source checks, and add
catalog-failure cleanup, timestamps, late-result cancellation and original-error preservation.
Transaction fakes include the actual conversation and run participants; unused alternate provenance
fakes in conversion/promotion fixtures are removed.

PostgreSQL contracts verify that run insertion failure rolls back conversation creation and that a
direct result is not published after the real cancellation controller settles the run. Keep the
existing contracts for proposal failure and completion failure rolling back publication. Prepared
context and durable cancellation contracts remain in their focused suites.

## Remaining review

The subsequent [chat-preparation disposition](agent-preparation.md) covers chat context writes.
Generic repository transition guards and model lifecycle functions remain separate ownership work.
Direct workflow publication and durable action submission remain distinct entry paths;
this slice does not establish completion of the whole agent/diagram family or repository inventory.
Observed local and CI results are recorded in the dependent PR.
