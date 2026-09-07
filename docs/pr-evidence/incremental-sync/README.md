# Offline write review

These are starting-state and result captures of the new review flow, at 1280 × 720 in the light theme.
They are not before/after captures of the old implementation.

Setup: `pnpm test:sync:pwa` creates an isolated temporary PostgreSQL container, runs all migrations,
and seeds a synthetic account, inbox, note, and saved conversation. Playwright mints a session for
that account. The scenario creates a project while offline, returns to Today, and opens its pending
change for review. No model calls or private user data are involved. The container is removed when
the test command exits normally.

![Offline project retained in the sidebar with one pending change](saved-offline-project.png)

Starting state: the project is saved on the device and the shared status offers **Review changes**.

![Review dialog showing a new project with download and discard actions](review-offline-project.png)

Result: the review shows the retained local project and its absent server base. The user can download
its full record or explicitly discard it. The same test verifies that discard removes the pending write.
