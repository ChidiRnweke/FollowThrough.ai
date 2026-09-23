# Agent tool-name recovery

## Owner and entry path

AgentReasoning supplies createToolRecoveryConfig to the SDK runner for each generation. It passes
the enabled tool names and the discoverable catalog separately. The recovery formatter now owns
name-distance ranking privately, alongside its decision to offer direct invocation or tool search.
No model export or service port is needed for this server-only rule.

The formatter preserves ADR 0022: an undiscovered catalog name must first be surfaced by search_tools.
Enabled suggestions remain directly callable with their real schemas. Candidate names are unique,
ranked by edit distance and then name. The existing three-edit threshold is preserved, not introduced
as a new read limit. Unknown names without suggestions receive tool-search guidance. Recovery does
not execute a guessed tool or replace argument validation.

## Declaration and test dispositions

Remove the model's ToolNameSuggestion intermediate shape and unused ToolNameMatch/matchToolName
API. Source search found no production caller of matchToolName. The distance algorithm becomes a
private implementation detail of recovery; there is no compatibility wrapper.

Remove the old utility spec's two algorithm-only cases and three cases for the unused API. The
formatter's existing tests already cover exact catalog names, nearest-first suggestions, no match,
enabled versus undiscovered invocation and a streamed SDK run that recovers from an unknown call.
Replace the remaining ranking-helper assertions with formatter-output cases for alphabetical ties,
the threshold boundary and duplicate names across both surfaces. Each case has one assertion.

This resolves the name-recovery rule placement within W18.06 and W18.07. Input validation, discovery
ranking, tool preferences and the complete workflow assessment retain their separate dispositions.
The SDK recovery contract and public commands do not change.
