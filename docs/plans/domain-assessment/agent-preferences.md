# Agent preference write ownership

## Entry paths and guarantees

AgentSettings.updatePreferences serves direct controller calls and the agent settings tool.
The settings workspace command reaches AgentSettings.synchronize through the validated workspace
mutation remote. Offline command preparation calls agentPreferenceWrite. These paths edit one
account's execution, completion, model and research preferences. Model selection and preference
resolution during a run remain separate concerns.

The controller validates requested model capabilities and numeric limits, then owns a transaction
that locks the actor's preference resource. It reads the authoritative row, applies the shared patch
rule and persists the resolved value. The resource advisory lock matches synchronized writes and
covers an absent row; a row lock protects an existing row. Two independent direct edits therefore
retain each other, including simultaneous first edits. Synchronization retains its stale-base rejection
and exact receipt contract; direct partial edits do not acquire a new public version parameter.

An absent row is a valid first-use state. The controller constructs defaults only after the locking
read proves that absence. It uses one timestamp for first creation and update. Read failures propagate.
Omitted fields retain current values, null clears an override, and explicit false disables inline
completion. Offline and server edits use the same rule and update timestamp. CreatedAt remains stable
after persistence. Resolved persistence checks actor identity and retains nullable column clearing.

Vision and generation capability checks run in the controller through the shared model-choice rule.
The catalog supplies metadata and cannot bypass validation. The configured deployment choices and
provider capability facts determine which model can fill each role. See the
[model-choice disposition](agent-model-choice.md) for the current owner and evaluation behavior.

## Ownership and test decisions

Remove the service's read-apply-write update method and its unused rule re-export. The service provides
reads, default construction and resolved persistence. Shared edit behavior leaves models and is called
by both controllers. The read-only preferences interface remains for run and completion consumers.
Factories supply the controller clock. No migration or public command/response change is required.

Move the three existing partial-update assertions beside the shared rule. Extend the timestamp case
to distinguish retained creation time from advanced update time. Replace the settings suite's local
preference and model implementations with the actual catalog and shared in-memory repositories.
Retain existing settings/model-resolution assertions. Add first creation, nullable offline parity,
account separation, vision rejection and inline model capability cases.

Existing synchronization contracts use actual controller updates for intervening writes and retain
stale-base and null-clear assertions. A retired model in a migration fixture is inserted as resolved
persisted state, not accepted as a new model choice. PostgreSQL races hold the account resource lock
while two independent controller calls wait, then verify both edits survive for absent and existing
rows. The inline-disabled completion fixture seeds resolved preferences instead of calling the removed
workflow. PostgreSQL evidence comes from CI while the local Docker socket remains unresponsive.

This disposition covers preference writes. Deployment catalog completion, environment parsing,
per-run model resolution and other account settings still require their own dispositions.

Local validation passed 16 focused files and 100 tests, then all 413 unit files and 3,917 tests.
Lint, type checks, architecture audits and documentation checks passed; docs report one existing hint.
[PR #169 CI](https://github.com/ChidiRnweke/FollowThrough.ai/actions/runs/35861816871) passed
the PostgreSQL races, quality, full browser/unit tests and sync PWA. Commit and PR title checks also passed.
