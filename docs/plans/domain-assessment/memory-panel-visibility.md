# Memory surface after project archival

ADR 0009 retains archived project records but hides their content from active workflows. The full
project memory page checked this state. The shared memory list used by the side panel did not.
A selected project can remain in the panel after archival, so retained memory and editing controls
remained visible there.

The shared list now reads the selected project's resource state before it exposes project memory.
It shows loading, download failure, unavailable and archived states through the existing resource
messages. An archived project replaces its content with “This project is no longer available.”
Open editors and confirmation dialogs close when their project becomes unavailable. Profile memory
has no project and retains its existing loading and creation behavior.

## Evidence and test disposition

The component reproduction uses the actual MemoryEntryList, application CSS and WorkspaceResources
with the existing in-memory cache and outbox. Seed an active project and one valid memory entry,
initialize the cache offline, then stage archiveProject. Before the change, the saved entry, sharing
checkbox and add/edit/delete actions remain visible. After the change, only the unavailable state
remains. Captures use the same light theme and 384 by 480 pixel surface. This is seeded component
verification, not an authenticated whole-application or live-agent run.

Keep the existing profile-loading regression. Add browser regressions for active project memory,
archived visibility, removed actions, closed add/delete dialogs and project context still downloading.
Six regressions failed on the original component; both controls passed. All eight focused browser
tests passed with the fix. The raw cache remains intact; archival visibility does not delete memory. The server boundary is
covered separately by [PR #221](https://github.com/ChidiRnweke/FollowThrough.ai/pull/221).

This addresses a presentation gap in W11.02, W11.03 and W11.05. It does not complete the memory
family review; agent retrieval, proposal listing and concurrent lifecycle behavior remain separate.
