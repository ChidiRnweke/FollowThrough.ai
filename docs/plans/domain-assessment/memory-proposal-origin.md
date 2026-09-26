# Memory proposal source identity

ADR 0003 requires accepted proposals to remain traceable to their source. AgentTools and McpTools
already receive the caller's provenance ID. Memory proposals ignored it and created a new
“Agent memory” source with empty metadata. This lost the workbench run/model identity or the MCP
client's recorded scope, although the caller already knew it.

The tools now pass their trusted context's provenance ID into the memory controller. The controller
reuses that owned source for the proposal and applied entry. The model-facing schema does not expose
the provenance ID and rejects an extra model-supplied source argument. SuggestionInbox validates
the source through its actor-scoped repository before persisting the proposal. The memory trust-policy
classification remains memory, independent of the source's pipeline.

Remove the redundant provenance-recording dependency from the memory controller. Existing generic
memory provenance rows remain readable through the retained storage schema; no historical source is
invented or rewritten. Direct user memory creation remains a separate path.

## Evidence and test disposition

Four tests through the actual agent and MCP tool definitions failed before the correction: pending
agent provenance, pending MCP provenance, applied-entry provenance and preservation of the known
source without an extra generic row. They now pass. Add a control proving that model-supplied source
arguments cannot replace trusted context. Fixtures use a workbench run source for the agent and an
MCP client source for MCP, with their actual distinct metadata.

Keep scope, trust, effect, rollback and indexing contracts. Rewrite the old generic-memory-source
assertion to verify the supplied source identity. Add PostgreSQL contracts for owned, foreign and
missing source records; failure must leave no proposal behind. Local Docker is unavailable, so those
contracts require CI.

This repairs the source identity gap in W11.04, W11.06 and W11.09. Their remaining mutation and
provenance assessment is not completed merely by this correction.
