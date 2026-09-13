# Sync recovery and review evidence

These captures render the real review, indicator, and error components with synthetic records
through `WorkspaceResources`, `ResourceCache`, `MutationQueue`, and the in-memory repositories.
They verify component behavior and layout. They are not authenticated full-app or PostgreSQL
end-to-end evidence: the local Docker runtime was unavailable.

The original review components were read from PR head
`8dd1697936906c1cd295a3057008b0b6704d6021` without resetting the worktree. Both versions use
the same synthetic project and queued creation. Viewports are 1280×720 and 400×800; captures
wait for theme transitions to finish. Additional result images cover synced, offline-pending,
attention, grouped-list, conflict, and startup-recovery states. The temporary preview routes
were removed after capture. No real account content or credentials appear in these images.

The conflict fixture retains “Original project” as its base, “Offline review project” as its
local value, and “Server review project” as the observed version. Both changed fields use the
brand wash. The startup error retains an export action when bootstrap metadata cannot load.

See [client benchmark and limitations](performance.md) for performance measurements.

![Attention indicator: a conflicting edit needs review. Desktop, dark theme.](after-attention-desktop-dark.png)

Attention indicator: a conflicting edit needs review. Desktop, dark theme.

![Attention indicator: a conflicting edit needs review. Desktop, light theme.](after-attention-desktop-light.png)

Attention indicator: a conflicting edit needs review. Desktop, light theme.

![Attention indicator: a conflicting edit needs review. Mobile, dark theme.](after-attention-mobile-dark.png)

Attention indicator: a conflicting edit needs review. Mobile, dark theme.

![Attention indicator: a conflicting edit needs review. Mobile, light theme.](after-attention-mobile-light.png)

Attention indicator: a conflicting edit needs review. Mobile, light theme.

![Conflict review: local and server names are compared against the retained original. Desktop, dark theme.](after-conflict-desktop-dark.png)

Conflict review: local and server names are compared against the retained original. Desktop, dark theme.

![Conflict review: local and server names are compared against the retained original. Desktop, light theme.](after-conflict-desktop-light.png)

Conflict review: local and server names are compared against the retained original. Desktop, light theme.

![Conflict review: local and server names are compared against the retained original. Mobile, dark theme.](after-conflict-mobile-dark.png)

Conflict review: local and server names are compared against the retained original. Mobile, dark theme.

![Conflict review: local and server names are compared against the retained original. Mobile, light theme.](after-conflict-mobile-light.png)

Conflict review: local and server names are compared against the retained original. Mobile, light theme.

![Review list: changes are grouped by the decision or delivery state. Desktop, dark theme.](after-list-desktop-dark.png)

Review list: changes are grouped by the decision or delivery state. Desktop, dark theme.

![Review list: changes are grouped by the decision or delivery state. Desktop, light theme.](after-list-desktop-light.png)

Review list: changes are grouped by the decision or delivery state. Desktop, light theme.

![Review list: changes are grouped by the decision or delivery state. Mobile, dark theme.](after-list-mobile-dark.png)

Review list: changes are grouped by the decision or delivery state. Mobile, dark theme.

![Review list: changes are grouped by the decision or delivery state. Mobile, light theme.](after-list-mobile-light.png)

Review list: changes are grouped by the decision or delivery state. Mobile, light theme.

![Offline indicator: one locally saved change waits for reconnection. Desktop, dark theme.](after-offline-desktop-dark.png)

Offline indicator: one locally saved change waits for reconnection. Desktop, dark theme.

![Offline indicator: one locally saved change waits for reconnection. Desktop, light theme.](after-offline-desktop-light.png)

Offline indicator: one locally saved change waits for reconnection. Desktop, light theme.

![Offline indicator: one locally saved change waits for reconnection. Mobile, dark theme.](after-offline-mobile-dark.png)

Offline indicator: one locally saved change waits for reconnection. Mobile, dark theme.

![Offline indicator: one locally saved change waits for reconnection. Mobile, light theme.](after-offline-mobile-light.png)

Offline indicator: one locally saved change waits for reconnection. Mobile, light theme.

![After: queued offline creation shows its state, meaningful fields, and clear actions. Desktop, dark theme.](after-review-desktop-dark.png)

After: queued offline creation shows its state, meaningful fields, and clear actions. Desktop, dark theme.

![After: queued offline creation shows its state, meaningful fields, and clear actions. Desktop, light theme.](after-review-desktop-light.png)

After: queued offline creation shows its state, meaningful fields, and clear actions. Desktop, light theme.

![After: queued offline creation shows its state, meaningful fields, and clear actions. Mobile, dark theme.](after-review-mobile-dark.png)

After: queued offline creation shows its state, meaningful fields, and clear actions. Mobile, dark theme.

![After: queued offline creation shows its state, meaningful fields, and clear actions. Mobile, light theme.](after-review-mobile-light.png)

After: queued offline creation shows its state, meaningful fields, and clear actions. Mobile, light theme.

![Startup recovery: saved edits can be downloaded while settings are unavailable. Desktop, light theme.](after-startup-recovery-desktop-light.png)

Startup recovery: saved edits can be downloaded while settings are unavailable. Desktop, light theme.

![Synced indicator: saved workspace with no pending changes. Desktop, dark theme.](after-synced-desktop-dark.png)

Synced indicator: saved workspace with no pending changes. Desktop, dark theme.

![Synced indicator: saved workspace with no pending changes. Desktop, light theme.](after-synced-desktop-light.png)

Synced indicator: saved workspace with no pending changes. Desktop, light theme.

![Synced indicator: saved workspace with no pending changes. Mobile, dark theme.](after-synced-mobile-dark.png)

Synced indicator: saved workspace with no pending changes. Mobile, dark theme.

![Synced indicator: saved workspace with no pending changes. Mobile, light theme.](after-synced-mobile-light.png)

Synced indicator: saved workspace with no pending changes. Mobile, light theme.

![Before: queued offline creation shows an empty shared-base column and internal role. Desktop, dark theme.](before-review-desktop-dark.png)

Before: queued offline creation shows an empty shared-base column and internal role. Desktop, dark theme.

![Before: queued offline creation shows an empty shared-base column and internal role. Desktop, light theme.](before-review-desktop-light.png)

Before: queued offline creation shows an empty shared-base column and internal role. Desktop, light theme.

![Before: queued offline creation shows an empty shared-base column and internal role. Mobile, dark theme.](before-review-mobile-dark.png)

Before: queued offline creation shows an empty shared-base column and internal role. Mobile, dark theme.

![Before: queued offline creation shows an empty shared-base column and internal role. Mobile, light theme.](before-review-mobile-light.png)

Before: queued offline creation shows an empty shared-base column and internal role. Mobile, light theme.
