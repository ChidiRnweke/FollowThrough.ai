---
title: "ADR 0051: Record the connector catalog from vendors' own MCP servers"
description: Build the connector catalog with a script that checks each vendor's endpoint, sign-in and logo, hide vendors that need an operator's client until it is configured, and freeze a connector's label into every call.
---

## Status

Accepted. This decision amends ADR 0049 for the catalog, its logos and the labels on calls.

## Context

ADR 0049 lets a user connect hosted MCP servers from a catalog "of hosted servers that we have
checked". The first catalog had ten entries. They came from a probe of 19 vendors, and the code
listed each entry by hand. Most vendors that host an MCP server were not listed. A user who wanted
Stripe or Figma had to know the server's URL and add it as a custom server.

The official MCP Registry has about 64,000 servers. About 25,000 are hosted on the domain that
their reverse-DNS name claims. A domain check proves only that the publisher controls the domain;
it does not show that the service is known or safe. Many entries are resellers, generated servers
or tests. The registry therefore cannot be the catalog.

A probe on 2026-11-14 found about 65 well-known vendors whose servers either need no sign-in, or
register a client by themselves through a client ID metadata document or dynamic registration,
with PKCE S256. Seven more vendors need a client that the operator registers: Asana, Box, GitHub,
HubSpot, PagerDuty, Render and Slack.

ADR 0049 also says that a connector call carries "a label frozen at call time". The calls stored
only the `<slug>__<tool>` name. Chat treated a slug equal to a catalog id as that vendor. With a
growing catalog this fails: a custom server named "stripe" before Stripe joined the catalog would
show Stripe's logo, and connecting the real Stripe would fail as "already connected".

## Decision

### The catalog is recorded

A reviewed list of vendors, `scripts/connector-catalog-sources.ts`, is the input. Each vendor has
an id, a title, a one-sentence description in our voice, a category, and the source of its
endpoint. `scripts/record-connector-catalog.ts --record` checks each vendor over the network and
writes `src/lib/models/connector-catalog/index.ts` and the logos in `static/connector-logos/`. Both
are generated and reviewed in the pull request; nobody edits them by hand.

The recorder takes a vendor only when every check passes:

1. **The endpoint is the vendor's own.** A registry vendor's Streamable HTTP remote must be hosted
   on the domain that its registry name claims. A vendor that is not in the registry is listed with
   a page from its own documentation, and that page must name the endpoint's host. A remote that
   needs a header other than `Authorization` is an API-key server and is refused.
2. **The sign-in works the way production signs in.** The recorder lists tools anonymously. A
   `401` leads to resource and authorization server discovery through the MCP SDK, which needs PKCE
   S256 and an HTTPS sign-in page. The result must equal the source's `expect`: `none`,
   `discovered` or `preregistered`.
3. **The logo is real.** The SVG Logos mark comes first when it fits a square tile (aspect at most
   2.2). Then an icon the source names explicitly, then the icon in the registry entry, then the
   largest icon that the vendor's site links. A raster must be at least 96 px. Every file is
   identified by its bytes, and an SVG must be a drawing only. A vendor without a usable logo is not
   recorded.

A vendor that fails a check fails the run by name; nothing is skipped silently. Without `--record`,
the script checks offline that the sources and the recorded catalog list the same vendors and that
every logo file is present and safe. A unit test checks the same in CI.

### Vendors that need the operator's client are hidden until configured

Each such vendor reads `CONNECTOR_<ID>_CLIENT_ID` and `CONNECTOR_<ID>_CLIENT_SECRET`. One without the
other stops startup. Without both, the catalog leaves the vendor out instead of showing it as
unavailable: the user cannot act on it. The self-hosting guide lists the vendors and their keys.

### A call keeps its connector's label

Tool events, journal rows and parked decisions carry the connector's label: its title and, for a
catalog connector, its catalog id. Chat reads the service name and the logo from that label, never
from the slug. A row saved before labels existed reads as a custom connector named by its slug, so
it never claims a vendor's mark. A catalog id that a custom server already holds as its slug no
longer blocks the vendor: the catalog connector takes the next free slug, such as `stripe2`.

## Consequences

- The catalog grows by editing the sources and recording again. The diff shows each new vendor,
  where its endpoint came from, how it signs in and where its logo came from.
- The probe proves discovery and registration support. It does not complete a sign-in at each
  vendor, so a vendor can still refuse a client at sign-in time.
- Endpoints change. The catalog is as current as its last recording; recording is manual.
- Removing a vendor from the catalog orphans its connectors: their rows name a catalog id that no
  longer parses. Removing an entry needs a migration of its rows to custom connectors first.
- Logos now include rasters and icons that vendors publish on their sites, served from
  FollowThrough's own origin like the SVG marks. ADR 0049's rule still holds: the browser never asks
  a third-party origin for a logo.

## Evidence

- `--record` on 2026-11-14 recorded 60 vendors. 50 sign in by themselves, 7 need the operator's
  client and 3 need no sign-in. 37 logos are SVG Logos marks and 23 are icons that the vendors
  publish.
- Excluded on that run, with the reason the recorder or the review gave:
  - Plaid: its endpoint path names the SSE transport.
  - Zoom: its documentation names a host but not the MCP path.
  - Miro, Datadog, Ramp and Pipedream: their documentation pages do not name the endpoint host.
  - Wix: it publishes no logo that the recorder can read.
  - New Relic: it needs an API key header.
- A Registry fetch on 2026-11-14 listed 64,111 servers. 24,964 were hosted on their claimed domain,
  and 22,896 of those needed no header other than `Authorization`.
