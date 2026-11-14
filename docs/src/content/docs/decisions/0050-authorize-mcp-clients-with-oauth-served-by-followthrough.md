---
title: 'ADR 0050: Authorize MCP clients with OAuth served by FollowThrough'
description: Serve the MCP authorization server from FollowThrough, register clients through Client ID Metadata Documents with anonymous registration as a fallback, sign the user in through Authentik, and remove API tokens.
---

## Status

Accepted.

## Context

The MCP endpoint accepts only API tokens. The user mints a token in Settings, copies it, and
pastes it into each client's configuration. The token has no expiry unless the user sets one, and
it works until the user revokes it. A client cannot connect from the endpoint URL alone.

The MCP authorization specification describes a flow without copied secrets. The client receives
a `401` from the endpoint and reads the protected resource metadata (RFC 9728). That metadata names
an authorization server, and the client reads the server's metadata (RFC 8414). The client then
identifies itself, sends the user to a browser sign-in with PKCE, and receives a token for the
endpoint. The 2026-07-28 revision of the specification prefers Client ID Metadata Documents (CIMD)
for identification: the `client_id` is an HTTPS URL, and the authorization server fetches the
client's metadata from it. Dynamic Client Registration (RFC 7591) remains supported but is
deprecated.

FollowThrough already signs users in through Authentik. The deployment runs Authentik 2025.12.3,
which has no client registration endpoint. Authentik 2026.8 adds Dynamic Client Registration to
the open-source edition, but it does not fit MCP clients:

- A registration request must carry a bearer token with a registration scope. MCP clients register
  anonymously, before they have any token.
- Each registration creates an application and provider that stay until an administrator deletes
  them.
- Authentik sets a token's audience to the client id. The MCP endpoint needs a token bound to its
  own URL (RFC 8707), so that a token issued for another client cannot be replayed against it.
- Authentik does not support CIMD.

## Decision

- FollowThrough serves the authorization server for `/mcp`. It publishes
  `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, and
  serves `/oauth/authorize`, `/oauth/token` and `/oauth/register`. The `401` from `/mcp` names
  the resource metadata in its `WWW-Authenticate` header.
- A client identifies itself with a CIMD URL first. FollowThrough fetches the document over HTTPS
  only, refuses private, loopback and link-local addresses, follows no redirects, and limits the
  time and size of the fetch. The document's `client_id` must equal its URL. A document that fails
  any check is a failure result, and authorization stops.
- Clients without CIMD register anonymously through `/oauth/register`. Registration accepts only
  public clients (`token_endpoint_auth_method: none`) and stores the client's redirect URIs.
- Every client is public. The authorization request must use PKCE with `S256`, a `redirect_uri`
  that matches a registered one, and a `resource` equal to the `/mcp` URL. A redirect URI matches
  exactly, with one exception from RFC 8252 §7.3: on a loopback host, any port and any loopback
  name match. A metadata document can only publish a fixed URI, and a native client listens on a
  port the operating system picks.
- Every failure on the authorization page is shown to the user. Nothing is sent to a redirect URI
  until the client and that URI have passed review.
- `/oauth/authorize` requires a FollowThrough session. Without one, it sends the user through the
  existing Authentik sign-in and returns to the request afterwards. A user waiting for approval
  cannot authorize a client. The consent screen names the client and the host that publishes it, and the user
  chooses the scope: `mcp:read` or `mcp:full`. These replace the API token scopes `read` and `full`.
- Each approval creates one connection, so the same client on two machines holds two. An
  authorization code is deleted when it is exchanged and expires after 60 seconds. An access token
  expires after one hour. Each refresh replaces both tokens, and a refresh token that was already
  rotated out revokes its connection. FollowThrough stores only hashes of codes and tokens.
- `/mcp` accepts only access tokens issued for its own URL. Settings lists the connected clients,
  and the user can disconnect each one. The agent's `list_mcp_connections` and
  `revoke_mcp_connection` tools replace its token tools. No agent tool can approve a client.
- API tokens are removed: their table, the minting form in Settings, and their verification on
  `/mcp`.

## Consequences

- A client connects from the endpoint URL and one browser sign-in. No long-lived secret is copied
  into a client configuration.
- Existing API tokens stop working. Each MCP client must reconnect through OAuth. This is a
  breaking change.
- Authentik and the deployment configuration do not change. Authentik remains the only identity
  provider; FollowThrough issues tokens only for its own MCP endpoint.
- FollowThrough now owns security-sensitive protocol code: code and token issuance, refresh
  rotation, and fetching documents from URLs that clients choose. Each rule above needs a test
  that fails without it.
- Scripts and clients that cannot run a browser flow lose access to MCP. If they need access
  later, a new decision must add a credential type for them.
- Anonymous registration lets anyone create client rows. A client row grants nothing without a
  signed-in user's consent, but the rows accumulate; nothing prunes them yet.
- A client that registered itself can claim any name. The consent screen marks it as unverified
  and asks the user to connect it only if they just added FollowThrough to it.

## Evidence

- `playbooks/services/authentik/compose.yml` in the server configuration pins
  `ghcr.io/goauthentik/server:2025.12.3`.
- [Authentik 2026.8 release notes](https://docs.goauthentik.io/releases/2026.8/): Dynamic Client
  Registration, moved to the open-source edition in the same release.
- [Authentik Dynamic Client Registration](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/dynamic-client-registration/):
  registration requires a bearer token with the registration scope, and registered clients stay
  until they are deleted. The page does not mention CIMD.
- [MCP client registration, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration):
  CIMD is preferred when the server advertises `client_id_metadata_document_supported`, and
  Dynamic Client Registration is deprecated.
- Before this decision, `src/routes/mcp/+server.ts` accepted only an API token as its bearer
  credential.
- Claude Code identifies as `https://claude.ai/oauth/claude-code-client-metadata`. Its document
  publishes portless loopback redirect URIs, and the client sends a URI with a port; reports such
  as [anthropics/claude-code#37767](https://github.com/anthropics/claude-code/issues/37767) show
  servers that match exactly refusing it.
- `src/lib/server/services/identity/mcp-clients.spec.ts` and `mcp-grants.spec.ts` cover each rule
  above; `tests/integration/identity/mcp-authorization.contract.spec.ts` covers the stored hashes,
  single-use codes and refresh races against PostgreSQL.
