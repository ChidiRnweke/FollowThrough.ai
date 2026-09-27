# Local-mode identity initialization

## Ownership and caller trace

With authentication disabled, config.requestActor resolves the configured local UUID or the existing
fixed default. It ignores a stale browser session identity. A malformed configured UUID fails. With
authentication enabled, the same no-session call fails before returning an actor.

Previously ProjectRecords.insert also inserted a profile with the database's default WAITING role.
UserDirectory.get separately inserted a missing profile with ADMIN role. The first path to create a
project could therefore decide the local profile's role. A supposedly ordinary user read could also
create an administrator. MCP records provenance before creating projects, so implicit profile creation
inside a later project write was not a reliable initialization boundary.

AppFactory.localActor now resolves the explicit local-mode identity and initializes it through
UserDirectory.initializeLocal. The authentication-disabled HTTP hook awaits this before resolving the
request and setting the account cookie. MCP has its own authentication branch because the hook skips
that route; it awaits the same initializer before provenance or tool writes. Authenticated requests
continue to use their validated session or bearer identity and never enter this initializer.

UserDirectory.get is now a read and fails when the profile is missing. ProjectRecords only writes
projects and requires the account foreign key to exist. UserRecords.ensureLocal remains the single
local-profile insertion policy: a missing profile receives ADMIN and the synthetic local email, and an
existing profile is preserved. Do not upgrade an existing WAITING or USER account as a side effect of
switching configuration. This change does not migrate existing roles.

The subsequent browser bootstrap identifies the same account. The initial synchronization provisions
Inbox and built-in skills after the profile exists, and projects cannot independently choose profile
policy. Offline shells still skip request authentication and contain no server profile data. Existing
account-specific cache and cookie behavior is unchanged; its broader lifecycle remains W02.04.

## Evidence and test disposition

A regression demonstrated that an ordinary missing-profile read created an administrator. It now
rejects with NOT_FOUND. Existing local initialization tests moved to the explicit initializer and keep
idempotence and failed persistence coverage. An existing admitted account remains unchanged.

PostgreSQL contracts cover local initialization followed by the first provenance/project writes,
preservation of an existing WAITING account, missing-profile reads, and a project write without an
established account. Contract fixtures now seed their users explicitly instead of relying on project
insertion to do it. Existing project ownership, first Inbox/skill provisioning and account persistence
checks retain their original assertions. SQL contracts run in CI because local Docker is unavailable.

The request-actor cases cover enabled-auth refusal, configured/default local UUIDs, stale browser
identity rejection and invalid configuration. Caller wiring was traced through the hook and MCP;
this is not a new full HTTP authentication end-to-end test. W01.10 is assessed. Provider identity
linking (D08), general admission and every ownership boundary remain separate workflows.

## Evaluation lab follow-up

The evaluation lab calls controllers directly and does not pass through the HTTP or MCP local-mode
boundary. Its seedWorkspace and smoke setup also relied on implicit user creation. Give those entry
points one explicit seedActor helper that initializes the profile before requesting the provisioned
shell. The schema smoke expectation now includes the Inbox, matching existing first-shell behavior.

A deterministic PGlite test with the production application graph reproduced the missing-user foreign
key failure. It verifies the repaired profile and initial Inbox without submitting an agent run or
calling a model provider. Existing live-model evals remain separate from this local setup check.
