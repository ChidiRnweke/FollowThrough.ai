# Memory proposal, trust and source review

## Entry and ownership

W11.04, W11.06 and W11.09 follow AgentTools and McpTools through Memory.propose, SuggestionInbox,
ToolTrust, MemoryLibrary, the repositories and the returned proposal. Both tool surfaces share the
same definition. Its public schema describes scope and operation, then memoryChangePayloadSchema
parses a valid combination before the controller runs. A project addition requires a project;
profile memory forbids one. Updates and removals require a target. Removals cannot carry replacement
content. Blank additions and updates fail. Historical stored payloads have a separate compatibility
reader; explicit contradictory scope does not fall back to a historical interpretation.

The caller supplies the authenticated actor and a recorded source ID. The source ID is absent from
the model's arguments. The workbench records its run/model source and the MCP request handler records
its scope before constructing the tools. [PR #228](https://github.com/ChidiRnweke/FollowThrough.ai/pull/228)
repairs the generic-source substitution. SuggestionInbox checks source ownership before insertion.
MemoryLibrary checks the active project and exact target scope before creating a proposal, then
checks again when applying it. Actor-scoped reads reject another user's target or source.

## Proposal and accepted data

A proposal is a record for review, not a saved memory entry. Memory.propose owns the transaction.
Without authorization, it returns the persisted pending proposal and leaves memory unchanged.
With authorization, it applies the change, indexes the changed entries, records reversible effects
and returns the persisted accepted proposal with its applied entry. Errors propagate through the
transaction; existing rollback tests cover acceptance and indexing failures.

An addition creates a new entry with the proposal's source. An update locks the active target,
creates a replacement in the same scope, records its predecessor and retires the old entry. Sharing
is retained unless the payload changes it. Content-only updates also retain classification; the
classification correction is recorded in [memory replacement](memory-replacement-type.md).
Removal locks and retires the target, retaining its original source. Its separate proposal and
recorded effect identify the removal's source. Direct user edits preserve existing lineage and
source; direct user creation has neither a proposal source nor a predecessor.

MemoryEntry's optional fields describe independent facts: profile/project scope, classification,
agent source, predecessor and deletion. A source can exist without a predecessor; an active or
retired entry can have either. A replacement's predecessor remains readable in retained storage.
The broad generic proposal result still relies on the returned suggestion status to explain its
optional appliedEntry. Narrowing all suggestion transition result types is a separate declaration
review, not a new fallback or a change to this workflow.

## Trust meaning

The policy key is memory, even when the recorded source's pipeline is agent. ToolTrust reads policies
for the actor. A missing or disabled policy requires review. An enabled policy without a confidence
threshold authorizes acceptance; with a threshold, the proposal must reach it. Confidence is an
integer percentage at the public tool boundary. Missing confidence is treated as zero by the
existing policy rule. Legacy agent or other pipeline settings do not authorize memory acceptance.
The settings control updates the same policy and retains its stored threshold. Chat execution mode
and proposal auto-accept policy remain separate decisions.

## Test disposition and completion

Keep the operation/scope boundary cases, stored-payload compatibility tests, scope mismatch tests,
source ownership contracts, replacement lineage and effect preimage tests. Keep indexing rollback,
privacy, and active-project checks. Keep the tool-level source regressions and model-supplied source
rejection control. These test different guarantees; they are not replaced by one controller smoke
test.

Add eight composition cases using real Memory, SuggestionInbox and ToolTrust with existing in-memory
repositories. They compare returned and persisted proposals, saved entries and effect presence for
no policy, disabled policy, below/exact threshold, missing confidence, no threshold, another actor's
policy and another pipeline's policy. All eight pass. The source deliberately uses the agent pipeline
so this also checks that preserving source identity does not change the memory policy key.

W11.04, W11.06 and W11.09 are assessed. W11.03 remains open for the documented profile sharing-policy
discrepancy. W11.05 remains open for complete review-surface and stale-action verification. This
review does not claim live model behavior, a new concurrent-archive guarantee or completion of every
suggestion declaration.

Local lint, type checking, architecture audits and the full unit suite passed (449 files and 4,191
tests). The branch was then based on the merged source/classification corrections; final focused and
documentation validation is recorded in the PR.
