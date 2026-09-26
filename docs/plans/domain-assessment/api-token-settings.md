# API-token Settings and list recovery

W01.08 starts in Settings' MCP panel. The user enters a name and chooses read-only or full access;
read-only is the initial choice. Blank names do not submit. The authenticated remote command validates
name and scope, then AccessTokens creates a random credential and stores only its hash. Minting stays
outside the agent controller surface. The one-time plaintext travels only in the creation result.
The panel keeps it in local component state, provides clipboard copying and explicit dismissal, and
cannot recover it on a later visit. List and revoke use the actor-scoped controller and return public
metadata. Revocation invalidates authentication and removes the token from the active list.

The service, controller, repository and protocol review is recorded in
[API-token verification](api-token-verification.md), including SQL coverage for ownership, scope,
hash-only persistence, expiration and revocation. Those checks landed in #233.

## Confirmed failure and correction

A list refresh after minting could remove the entire Settings panel. The installed SvelteKit query
implementation schedules the refresh and serializes a failed query separately from the successful
command result. It does not reject minting because the list failed. The defect was instead in rendering:
the list's boundary had only a pending snippet, so its error reached the PageShell boundary and removed
the sibling one-time credential display.

Give the list its own failed snippet and retry control. Creation controls and the one-time credential
remain outside the failed region. Retry refreshes the query before resetting the boundary. Both refresh
outcomes reset it: success renders the list; a repeated failure renders the same error notice. No
successful creation is relabeled as failed, and no secret is stored for later recovery. Existing
rendering-error reporting remains automatic; there is no duplicate boundary log.

## Browser evidence and disposition

Local PostgreSQL is unavailable. A temporary component route rendered the real SettingsMcp inside the
real PageShell with production CSS. A temporary SvelteKit remote module supplied public synthetic token
metadata, a visibly fake credential and an error on the post-mint list read. It used real command/query
refresh behavior. Before the correction the outer page fallback rendered and the credential input was
absent. After the correction the credential remained visible beside a list-only failure notice.
The matched light-theme captures use a 1000 by 800 viewport and identical seeded values.

Playwright also verified retry, full-access selection, clipboard copy, explicit dismissal, revocation
and the resulting empty list. These are seeded component interactions, not authenticated database
round trips. The temporary route and remote module were removed. The fake credential in committed
images is not a working credential. Keep the service/controller and SQL contracts from #233; do not
replace them with the remote fixture. Keep this visual evidence and source disposition for the boundary
regression rather than adding a source-shape assertion or mocking SvelteKit internals.

W01.08 is assessed. API protocol authorization remains covered by W01.07. OAuth admission/linking and
repository-wide ownership retain their separate reviews.
