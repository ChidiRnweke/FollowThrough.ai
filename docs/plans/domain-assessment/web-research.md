# Web research configuration

## Meaning and entry paths

W17 chat submission, retry and execution use effective web research settings. Previously the saved
request contained only account overrides. A later deployment change could alter the engine or budget
of a resumed run. Agent now resolves account choices against deployment defaults before saving the
request. Execution receives complete settings. Existing saved requests with absent or partial fields
remain readable; their missing fields resolve against the deployment configuration.

The shared resolver owns per-field precedence. Models retain request options, complete settings,
default values and the total provider-tool value constructor. Environment interpretation lives at the
server configuration boundary. Its existing policy is preserved: unsupported engines and nonpositive
or noninteger limits are treated as unset. Chat keeps the 20/40 defaults; reference discovery keeps
8/16. Both default to Exa. Reference persistence adapters and HTTP transport receive a resolved tool
value and no longer select defaults or read deployment settings themselves.

AgentSettings owns the authenticated workspace bootstrap, including configured models, numeric
defaults and availability supplied by the capability factory. The remote boundary validates and
delegates. The bootstrap's array types are readonly to match the canonical model catalog; its wire
shape is unchanged. The former deploymentDefaults controller method has no remaining consumer.
No migration is required.

## Test dispositions and remaining review

A new controller regression reproduced missing frozen defaults before the change. Add coverage for
account/deployment precedence, changed deployment settings before execution, retry after account
changes and legacy partial requests. Move environment cases from transport tests to configuration
tests. Cover both default profiles and independent overrides at the resolver. Keep HTTP injection
tests and add custom resolved reference settings. Bootstrap tests verify resolved budgets and failure
propagation. Existing runner, lifecycle and PostgreSQL fixtures receive explicit settings.

The PR records observed validation. Provider session representation and the remaining declaration and
workflow inventory still require review. This does not complete P17 or the full assessment.
