# API-token verification and ownership review

## Authentication path

W01.07 follows the MCP request through AccessTokens, ApiTokenRecords and createMcpToolSurface.
The request hook leaves MCP authentication to the route so an invalid bearer credential receives a
JSON 401 with a Bearer challenge, not an HTML sign-in redirect. A valid credential supplies the actor
and scope. The request records that identity's MCP source before constructing the tool surface.

AccessTokens parses one Bearer credential with the application prefix, hashes it and reads the token
with its current user. Missing, revoked, expired and waiting-account credentials fail validation.
The current account role is read from storage, so a previously minted credential does not bypass a
later admission change. Database lookup failures propagate. Last-used bookkeeping is explicitly
best-effort and logged; its failure does not turn a valid credential into a failed authentication.

ApiTokenRecords looks up the stored hash, never plaintext. The public token mapper omits the hash.
Listing and revocation constrain both token identity and actor where applicable. Expired credentials
can remain visible in the owner's list; verification still refuses them. Revoked credentials remain
in storage for history but leave the active list.

A read-scoped token produces only read-classified tool definitions. Direct registration and search
promotion use that same permitted set. An excluded mutation cannot become callable through tool
search. Disabled tools remain excluded in either scope. A full token can invoke authorized mutations,
including revoking tokens, but no tool can mint another credential. Minting stays a deliberate
Settings action through its authenticated remote command.

## Caller and returned data

Settings defaults to read scope and submits a validated name/scope. The command returns plaintext
only from minting; subsequent list/revoke results contain public metadata. The component stores the
new credential in local component state, supports explicit copying and reports creation/revocation
failure. A page revisit cannot recover the plaintext. This source trace does not complete W01.08's
browser interaction and refresh-failure review; its checkbox remains open.

Token optional timestamps are independent: expiration, revocation and last use can each exist alone.
MintedApiToken contains both the public token and its one-time credential. VerifiedApiToken requires
the resolved user, scope and token ID. No partial successful authentication shape is introduced.

## Test disposition

Keep the service tests for random distinct credentials, header parsing, scope, expiration, revocation
and waiting users. Keep MCP protocol tests for direct registration, tool-search promotion, forbidden
revocation under read scope, schema validation and absence of a minting tool.

Replace the controller-local FakeAccessTokens, which repeated list/revoke behavior, with real
AccessTokens and the existing in-memory repository. The three controller cases now verify actual
credential invalidation, owner-only listing and preservation after foreign revocation. Correct that
repository's fixture IDs to valid UUIDs, matching production records and the remote boundary.

Add seven PostgreSQL contracts for hash-only persistence and public metadata, both scopes, revocation,
current role, expiration and foreign ownership. These use real token/user repositories and the real
service/controller. The focused service/controller/MCP suite passed three files and 30 tests.
Database contracts require CI because local Docker is unavailable.

W01.07 is assessed, with the new database contracts required before merge. W01.08, session cookies,
OAuth linking and repository-wide ownership remain separately tracked. No live external MCP client
or live identity provider is claimed by these deterministic checks.
