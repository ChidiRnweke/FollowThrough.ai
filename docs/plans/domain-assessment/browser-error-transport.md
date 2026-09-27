# Browser error report transport

This continues W25.02 under ADRs 0029 and 0037. It does not mark public-route reporting or all
recovery surfaces assessed.

## Observed failure

The browser hook describes an error and its cause chain, then sends that message and the original
stack to /api/client-errors. The endpoint rejects messages longer than 2,000 characters, stacks
longer than 8,000, and route or pathname strings longer than 500. The browser previously sent those
fields unbounded. An oversized error therefore lost its entire report at ingestion. Its original
failure remained in the local console, but the remote report was not logged.

A transport regression uses an Error with a long document diagnostic, a repeated stack, and long
route/path context. The serialized report fails the actual endpoint schema before the repair.
Another regression checks that shortening is visible rather than presenting a partial message as
complete. Both fail before the fix.

## Repair and ownership

The schema and existing limits now live together in the telemetry model. The ingestion route parses
at its HTTP boundary. The browser serializer preserves each diagnostic prefix and appends
[truncated] within the existing field limit. Short reports retain their contents and optional fields.
This imposes no new server limit. Stack, route, path and status are independently optional because
callers can have any subset of that context; they do not describe one paired optional state.

The browser still sends a keepalive POST without awaiting it, and the terminal reporter still
contains transport and serialization failures. It does not recursively report its own failure.
The original error fingerprint and the existing per-page deduplication/budget remain unchanged.
The endpoint continues to emit one console error for the OpenTelemetry console bridge rather than
adding a browser exporter or a backend-specific SDK.

## Test dispositions and remaining assessment

Add the oversized-report regression, explicit truncation regression and short-report preservation
case. All three pass after the repair. Local and CI results are recorded in the PR. These tests
verify producer payloads against the actual ingestion schema; they do not establish live collector
or Phoenix delivery.

Authentication redirects still govern the endpoint, including unauthenticated and waiting-account
requests. Changing that policy requires an explicit ingestion access decision. Public-route errors,
the page report budget and deduplication lifetime, malformed endpoint requests, and recovery UI
interactions remain unassessed here. W25.02 stays open.
