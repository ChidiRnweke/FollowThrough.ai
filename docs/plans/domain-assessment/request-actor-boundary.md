# Authenticated actor resolution

AppFactory.actor delegates to config.requestActor. Remote functions reach it through
request-actor-factory and the current SvelteKit request locals. HTTP routes pass their own locals.
MCP uses its verified bearer identity when authentication is enabled and calls AppFactory.actor
without locals only in the explicit authentication-disabled branch.

Previously requestActor chose the local account whenever there was no validated user, even with
Authentik configured. The normal session hook rejects anonymous protected-page requests, but the
actor boundary itself turned missing authentication into a valid local actor. This was an unsafe
fallback, not evidence that a particular HTTP path was exploitable.

Resolve the mode first. In authentication-disabled mode, use the configured local UUID (or the
existing fixed UUID when the setting is absent). In authenticated mode, require the validated user
and return that user's identity. A missing user now throws before a controller receives an actor.
Keep the error explicit: it indicates a missing authentication boundary at the caller. Normal page
redirects and MCP's 401 response remain owned by their existing HTTP boundaries.

## Evidence and test disposition

A regression failed before the fix because authenticated resolution silently returned the local
account. Six focused boundary cases now pass: missing user refusal, validated identity, configured
local identity, stale browser identity ignored in single-user mode, malformed local configuration
refusal, and the documented absent-setting default. Existing UserDirectory tests retain idempotent
local provisioning and failed persistence behavior. The real Workspace provisioning composition
retains its first-read Inbox and built-in skill result.

The review also traced root landing redirects, waiting-user routes, session/account cookies,
authentication-disabled request handling, bootstrap account identity and MCP's separate bearer path.
It does not claim end-to-end browser admission coverage, nor settle D08's provider-email linking
policy. W01.01, W01.04, W01.09 and W01.10 remain open for their complete workflows. In particular,
ProjectRecords.ensureUser and UserRecords.ensureLocal both create local profile rows with different
role defaults; reconcile that ownership before treating single-user initialization as fully assessed.
