# Connectors

A connector is one user's connection to a remote MCP server: Linear, Notion, GitHub, or any HTTPS
URL the user names. [ADR 0049](../src/content/docs/decisions/0049-call-external-mcp-servers-as-connectors-through-the-agents-own-tool-set.md)
records the decision. This page describes how the parts connect. "MCP" elsewhere in the code means
FollowThrough's own server for other hosts; connectors are the other direction.

## Parts

| Part               | Location                                                                                | Role                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Models and catalog | `models/connectors/`, `models/connector-catalog/`                                       | Branded ids, the recorded catalog of hosted servers, credential and tool unions, request and views.   |
| Policy rule        | `services/connectors/policy.ts`                                                         | What a tool does when called: allow, ask or off. Shared with the browser.                             |
| Controller         | `server/controllers/connectors/controller.ts`                                           | Connect, sign in, refresh tools, set a tool's policy, disconnect.                                     |
| Authorization      | `server/services/connectors/authorization.ts`                                           | OAuth discovery, client registration, PKCE, token exchange and refresh, over the MCP SDK's functions. |
| Servers            | `server/services/connectors/servers.ts`                                                 | The MCP client: one session per operation, tool listing across pages, results parsed into models.     |
| Directory          | `server/services/connectors/directory.ts`                                               | Stored connectors and tools, slug and tool-name rules, OAuth attempts.                                |
| Repository         | `server/repositories/connectors/`                                                       | Rows in `connectors`, `connector_tools` and `connector_authorizations`. Seals and opens credentials.  |
| Secret box         | `server/infrastructure/crypto/secret-box.ts`                                            | AES-256-GCM over the `CONNECTOR_SECRET_KEYS` keyring.                                                 |
| Outbound guard     | `server/infrastructure/network/outbound.ts`                                             | The one way out: HTTPS only, public addresses only, same-origin redirects only, no trace context.     |
| Schema compiler    | `server/infrastructure/json-schema/compile.ts`                                          | Compiles a tool's input schema (2020-12 or draft-07) with RE2 patterns.                               |
| Entry points       | `remote/connectors/`, `routes/connectors/callback`, `routes/oauth/client-metadata.json` | Remote functions, the OAuth redirect target, and the public client metadata document.                 |

## Configuration

Connectors are on only when the deployment sets `CONNECTOR_SECRET_KEYS`. Without it,
`connectors.list` answers `unconfigured`, the catalog is empty, and every
connect operation fails with a message that names the key. A keyring that does not parse fails the
composition. The keyring lists `<keyId>:<base64 32-byte key>` entries newest first: the first one
seals, all of them open. A credential sealed under a key that is no longer listed reads as
`unreadable`, and its connector shows that status; the row is kept.

A catalog entry recorded as `preregistered` needs an OAuth app that the operator registers,
configured as `CONNECTOR_<ID>_CLIENT_ID` and `CONNECTOR_<ID>_CLIENT_SECRET`. Without both, the
catalog leaves the entry out. `server/config.ts` lists these entries, because `vite.config.ts`
loads it before `$lib` resolves; a spec holds that list, `src/env.ts` and the catalog equal.

## The catalog

The catalog is recorded, never written by hand (ADR 0051). To add a vendor:

1. Add a row to `scripts/connector-catalog-sources.ts`: an id that will never change, the title, one
   description sentence in our voice, a category, and where the endpoint comes from: the vendor's
   name in the official MCP Registry, or the endpoint and a page of the vendor's documentation that
   names its host. Name the SVG Logos mark when there is one.
2. Run `pnpm record:connector-catalog`. It checks every vendor's endpoint, sign-in and logo, and it
   fails by name when one does not pass. Fix the source or remove it; nothing is skipped.
3. Review the generated `src/lib/models/connector-catalog/index.ts` and the new files in
   `static/connector-logos/`. Look at every new logo on the plate in both themes.

`pnpm test:connector-catalog` checks the recording offline, and
`models/connectors/catalog-logos.spec.ts` checks it in CI. Removing a vendor orphans its
connectors, whose rows name a catalog id that no longer parses; migrate them to custom connectors
first.

## Call labels

Every connector call carries the connector's label, frozen at call time: its title and, for a
catalog connector, its catalog id. Events, journal rows and parked decisions keep it, and chat
reads the service and its logo from it. A row from before labels reads as a custom connector named
by its slug.

## Connecting

1. **Catalog entry without sign-in.** The servers service lists the tools anonymously, and the
   controller stores the connector with its tool snapshot.
2. **Custom server with a token.** The same, with the token as a bearer credential. A 401 rejects
   the token.
3. **Custom server without a token.** The servers service lists anonymously. A result means the
   server needs no sign-in. A 401 carries the challenge (resource metadata URL and scope), and the
   connector signs in with OAuth.
4. **OAuth.** The authorization service discovers the protected resource and authorization server
   metadata and refuses a server that does not advertise PKCE S256. It chooses a client:
   - a client ID metadata document, when the authorization server supports one and `ORIGIN` is
     public HTTPS;
   - dynamic client registration, when the server has a registration endpoint;
   - the operator's client for a preregistered catalog entry;
   - otherwise a visible failure.

   The controller stores the attempt (state hash, sealed verifier and grant, ten minutes) and
   returns the authorization URL. The browser goes there and comes back to `/connectors/callback`.
   The callback takes the attempt once, checks `iss` (RFC 9207), exchanges the code, lists the
   tools with the new token, and stores the connector. Reconnecting an existing connector replaces
   its credential and keeps its tools' policies.

## Tool snapshots

Every connect and refresh stores what the server listed: name, title, description, input schema,
annotations with the specification's defaults, and a checksum. A tool whose schema does not
compile is stored as unusable with the reason. The model name is `<slug>__<tool>`, cleaned to the
provider grammar and stable across refreshes. Usable tools are embedded through `ToolSearch` in
the catalog's wording, and the snapshot and its vectors are written in one transaction. A refresh
keeps a user's policy for every tool the server still lists and deletes the rest.

## Tokens

Before a request, a token that expires within a minute is renewed. A 401 renews once more. When the
authorization server rejects the refresh token, or the server still refuses, the connector moves to
`reauthorization_required` with the reason, and the operation fails with a message that tells the
user to reconnect it.

## Agent calls

The agent offers connector tools through the harness ([agent harness](agent-harness.md#connector-tools)).
`connectors.callTool` is the one operation behind every connector tool. It checks that the tool
still matches the snapshot the run was offered and is not turned off, and that the connector is
connected; otherwise it sends nothing and answers `withdrawn` or `reauthorization_required`. It
calls the server with the run's abort signal and the model's call id in `_meta`, renews the token
as listing does, and parses the result into text, binary, resource-link and resource blocks. The
model reads binary content as a description of what was omitted.

## Boundaries

- `connect`, `reconnect` and `completeAuthorization` use the `'redacted'` boundary surface. They
  are traced and logged without their arguments or results, which carry tokens and codes.
- Connector tables are never synced to the browser.
- No session, client or cache outlives an operation.
- Connecting and choosing what a tool may do are the user's decisions, so the only connector
  operation the agent reaches is `callTool`, behind each connector tool.

## Testing

`src/lib/testing/connectors/` holds a fake network routed by origin, a fake authorization server
(metadata, dynamic registration, PKCE checks, rotating refresh tokens) and a fake MCP server that
runs the SDK's own stateless server transport. `connectorsFixture` wires the real services, the
real `ToolSearch` and the policy rule over them, so controller specs run the SDK client end to end.
PostgreSQL contracts in `tests/integration/connectors` cover sealing, scoping, key retirement,
policy preservation and the check constraints.
