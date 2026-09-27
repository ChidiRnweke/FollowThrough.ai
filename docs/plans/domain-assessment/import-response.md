# Markdown import response outcomes

This continues W04.17 and W04.18. Neither workflow is marked fully assessed by this change.

## Owner and defect

ADR 0014 preserves independent imported notes and folders when another file fails. Notes creates
identities before saving bodies, reports blocked folder descendants and failed body writes, and
retains successful branches. The multipart route parses archive entries before invoking that
controller. The dialog renders created counts, individual failures, skipped files, frontmatter
limitations and unresolved links from the returned report.

The dialog previously parsed JSON inside the same catch as the upload request. A successful HTTP
response with truncated JSON therefore displayed “The import could not be sent” and suggested a
retry. That was false: the server could already have created the notes. Repeating the archive can
create additional copies. A structurally invalid JSON report already had different copy, so the
JSON decoder failure bypassed an existing distinction rather than exposing a new product policy.

The client response reader now owns decoding this HTTP boundary into a report or an explicit failure.
It handles both unreadable JSON and schema mismatches after a successful response as an unreadable
completed report. A readable server rejection retains its message. An unreadable error response
asks the user to inspect the project before retrying. A request failure likewise describes the
outcome as unconfirmed; it does not claim that nothing reached the server.

The dialog refreshes the workspace after a successful HTTP response even when its report cannot be
read. It still renders valid partial reports without turning failed bodies into an empty result.
No import transaction, identity, folder reconstruction or retry policy changed.

## Evidence and test dispositions

Five response tests use real Response bodies. Truncated success JSON and an HTML error response fail
under the previous parsing logic. Valid partial reports, readable server errors and malformed report
shapes retain their separate outcomes. Existing archive-reader, import-controller and link-resolution
suites remain with their current owners. They cover unsafe archive paths, archive limits, frontmatter,
independent successes, blocked descendants, blank shells after failed bodies and qualified links.

Matched 1280 × 900 captures in docs/pr-evidence/import-response show the actual import dialog making
an HTTP request to a local fixture endpoint that returns status 200 with truncated JSON. Before, it
claims the import could not be sent. After, it reports the unreadable completed result. This verifies
response presentation, not a database-backed archive import. The fixture endpoint bypasses archive
reading and was removed after capture. No real notes or model calls were created for the images.

## Remaining assessment

W04.17 and W04.18 remain open for route-level persistence evidence and dialog lifecycle handling
when a user closes or reopens it during an import. Existing archive size and depth policies are
unchanged. This repair does not establish that repeating an archive is idempotent.
