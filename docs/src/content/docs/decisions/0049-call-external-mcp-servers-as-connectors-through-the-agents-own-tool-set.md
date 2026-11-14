---
title: "ADR 0049: Call external MCP servers as connectors through the agent's own tool set"
description: Let users connect remote MCP servers, and give the agent their tools through the same discovery, approval, failure and resume rules as its own tools.
---

## Status

Accepted. This decision amends ADR 0044 for the logos of third-party services.

## Context

The agent can act only on FollowThrough data. Users keep related work in other services, such as
Linear, GitHub, Notion and Sentry. Most of these services now host a remote MCP server behind
OAuth. FollowThrough already is an MCP server (ADR 0002): other hosts call its tools at `/mcp`.
Nothing in FollowThrough calls out to another server.

A tool on another server is different from a FollowThrough tool in four ways:

- Its name, description and schema come from a third party at run time, not from the catalog.
  `ToolName` is a closed list, and events, the journal, parked decisions and discovery check it.
- Its effects are outside FollowThrough. A write to Linear makes no proposal and has no revert
  (ADR 0003). A retry can repeat it.
- It needs a credential that belongs to one user. The application has no storage for user
  credentials.
- Its server is on the public network, and a user can name any URL.

The agents SDK has its own MCP client. Its `Agent.mcpServers` option lists each server's tools on
every turn and turns them into SDK tools. That conversion sets no approval, ignores the tools'
annotations, and returns raw output. Tool lists are cached in process memory by server name, so
two users with a server of the same name share an entry. The call takes no abort signal, and the
connection discards the server's `serverInfo`. Its hosted MCP tool needs the Responses API, and
the agent uses Chat Completions through OpenRouter.

## Decision

We chose to call external MCP servers ourselves, as **connectors**, and to give the agent their
tools through the tool set that serves its own tools. The word "MCP" in code and copy keeps its
current meaning, the inbound server. The new domain is `connectors`.

### Client and transport

The connectors service uses `@modelcontextprotocol/sdk` directly: `Client` with
`StreamableHTTPClientTransport`, and the standalone OAuth functions in `client/auth.js`. It does not
use the agents SDK's MCP client. Each call opens a connection, calls one tool and closes the
connection, so no session stays in process memory between operations (ADR 0025). Connectors use
Streamable HTTP only. FollowThrough never starts a local process for a connector.

A user connects a server from a catalog of hosted servers that we have checked, or by its HTTPS
URL. The client advertises no client capabilities: no sampling, elicitation or roots.

### Authorization

Authorization follows the MCP authorization specification. The service discovers the protected
resource metadata and the authorization server metadata. It registers a client in this order:

1. A client ID metadata document served by FollowThrough, when the authorization server supports
   it and the deployment's origin is public HTTPS.
2. Dynamic client registration, when the server has a registration endpoint.
3. Client credentials that the operator configured for a catalog entry.

If none applies, connecting fails with a message that names the missing registration. Every
authorization uses PKCE with S256, a single-use state stored in the database, and the `resource`
parameter. The service refreshes a token before it expires and once after a 401 response. When a
refresh fails, the connector needs reauthorization, and each of its tools fails with a message that
tells the user to reconnect it. A custom server can also use a pasted bearer token, or no
authentication.

### Secrets and network

Credentials are encrypted in the database with AES-256-GCM. The associated data names the
connector, the user and the field, so a value cannot move to another row. The keys come from
`CONNECTOR_SECRET_KEYS`, an optional application key (ADR 0031). It holds a list of versioned keys:
the first one encrypts, and all of them decrypt, which lets an operator rotate keys. Without the
key, the Connectors settings say that connectors are not set up, and runs get no connector tools.
A value under an unknown key makes its connector unreadable; the row is kept.

Every request to a connector, an authorization server or an icon goes through one guarded fetch. It
accepts only HTTPS, rejects loopback, private, link-local and metadata addresses after it resolves
the host, refuses redirects to another origin, applies a timeout, and sends no cookies or trace
headers. Logs and spans name the connector and the tool, never the payload or a credential. A
controller method that receives or returns a secret uses a redacted boundary surface, which records
the span without a summary of the arguments or the result.

### Tool snapshots and names

When a user connects or refreshes a connector, the service lists its tools and stores a snapshot:
name, title, description, input schema, annotations and a checksum. The agent builds its tools from
the snapshot, not from a live list. A run that resumes after an approval therefore sees the same
tools, and an approval binds to the checksum that the user saw. A parked call whose tool has
changed, disappeared or been turned off fails with that reason, and nothing runs.

The model sees a connector tool as `<connector>__<tool>`. The connector slug has no underscore, and
no catalog name contains `__`, so the two sets cannot collide. Events, journal rows and parked
decisions carry a `source` field: `catalog` with a catalog name, or `connector` with the connector
tool name and a label frozen at call time. The catalog checks stay closed. A transcript stays
readable after its connector is removed.

The input schema is published to the model as the server wrote it, in non-strict mode. A JSON
Schema validator checks the model's arguments against it before the tool runs or asks for
approval. A schema that does not compile makes its tool unusable, and the connector's settings show
the reason. A server's description is untrusted text; the agent's instructions name connectors by
their catalog title or slug only.

### Discovery

Connector tools are never in the direct tool set. The model finds them with `search_tools`, as
ADR 0022 decides for the long tail, with their real names and schemas. Each tool's vector is
computed when its snapshot is stored, in the same transaction. Search ranks catalog and connector
tools together, at the existing limit. A missing vector fails the search with the fix: refresh the
connector. Refreshing a connector re-embeds its tools, so after the embedding model changes, a
connector's tools rank again once the user refreshes it; until then search names the connector.

### Approval

Each connector tool has a policy: allow, ask or off. The default comes from the tool's annotations:
a tool marked `readOnlyHint` is allowed, and every other tool asks. The default trusts the hints of
every server, including custom servers, because the user chose to connect that server. The user can
set any tool to allow, ask or off. A tool that is off is not built.

A tool that asks follows the same rule as a FollowThrough mutation: it parks the run for approval
when the execution mode requires approval, and it runs at once in auto-accept mode. A connector
tool never marks the workspace as stale, because it changes no FollowThrough data. Connector tools
are never offered through FollowThrough's own MCP server.

### Calls and results

A connector tool calls one controller operation, `connectors.callTool`, with the run's abort signal
(ADR 0007). The service parses each result at the boundary (ADR 0037) into text, binary,
resource-link, resource and unrecognised content. The model reads binary content as a description
of what was omitted, because Chat Completions accepts only text tool output. An error result from
the server is a tool failure that the model can read. Output above the replay threshold becomes an
agent file, and the tool returns the file's description (ADR 0035). Nothing is truncated. The call
id goes to the server in `_meta`, but a server may still repeat a write that a retry sends again.

### Logos

The connector surfaces show each service's own full-colour logo. Catalog logos are SVG files copied
from the SVG Logos collection (CC0) by a recorder script and committed, so the browser never asks a
third-party origin for one. A custom server's logo comes from the `icons` in its `serverInfo`. The
service accepts only an HTTPS or `data:` icon from the server's origin, fetches it without
credentials, and keeps it only when its bytes are a PNG, JPEG, WebP or SVG image. FollowThrough
serves the stored icon from its own origin under a sandboxing content security policy with
`nosniff`. An SVG shown as an image cannot run script, and the policy keeps it inert when opened
directly. A server without an icon gets a monogram. Logos sit on a light plate in both themes, so
dark marks stay visible.

This amends ADR 0044. A third-party logo is content that identifies another service, not an
application icon. It appears only where a connector is named, never in the application chrome, and
it is never animated. Every application icon still comes from the icon set.

## Consequences

- The agent can read and change data in the services that a user connects. The same approval,
  permission and failure rules apply to those calls as to FollowThrough's own tools.
- In auto-accept mode, connector writes run without a pause. Those writes have no proposal and no
  revert. The execution mode setting must say this.
- A server that marks a write as read-only can make that write run without approval. The user can
  set the tool to ask.
- External writes have no exactly-once guarantee. A retry after a failure can repeat a write.
- Each call opens a connection, which adds round trips. Reusing a session would need its id in the
  database; we will measure the latency first.
- A deployment that uses a client ID metadata document must be reachable at its origin by each
  authorization server. A private deployment falls back to dynamic registration.
- Services that support neither client ID metadata documents nor dynamic registration need client
  credentials that the operator registers. Without them, their catalog entries are unavailable.
- Each user's connector tools need their own vectors. A tool cannot be found until its snapshot and
  vector are stored.
- Project-level overrides, server instructions, sampling, elicitation and session reuse are not
  part of this decision.

## Evidence

- `@openai/agents-core` 0.13.2: `mcpToFunctionTool` in `dist/mcp.mjs` builds tools without
  `needsApproval` and without reading `annotations`. `defaultMCPToolCacheKey` keys the cache in
  `dist/mcpToolCache.mjs` by server name. In `dist/shims/mcp-server/node.mjs`, `connect` replaces
  the initialize result and `callToolWithClient` passes a timeout but no signal.
- `src/lib/server/factories/agent/agent-providers.ts` builds the OpenRouter provider with
  `useResponses: false`.
- `@modelcontextprotocol/sdk` 1.29.0 targets protocol `2025-11-25`. `client/auth.js` exports the
  discovery, registration, authorization, exchange and refresh functions, and
  `OAuthClientProvider.clientMetadataUrl` supports client ID metadata documents.
- A probe of authorization server metadata on 2026-10-25: Linear, Notion, Sentry, Vercel,
  Todoist, Hugging Face, Canva and monday support client ID metadata documents. Stripe, Figma,
  Zapier, Atlassian and Intercom support dynamic registration only. GitHub, Asana, HubSpot and Box
  support neither.
- The official MCP Registry on 2026-10-25: only Linear and Supabase publish `icons` among about
  twenty vendors checked. The SVG Logos collection on Iconify (`logos:`, CC0-1.0) has a mark for
  nearly every catalog candidate.
- MCP specification 2025-11-25, "Authorization" and the `icons` section of "Overview".
- `scripts/record-connector-logos.ts --record` on 2026-11-14 recorded a `logos:` mark for every
  catalog entry into `static/connector-logos/`. Linear's published server icon was a 16,055-byte
  PNG, which sets the scale for the 256 KiB cap on a fetched icon.
