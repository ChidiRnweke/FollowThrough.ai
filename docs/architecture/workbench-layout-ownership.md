# Account ownership of saved workbench tabs

Resource tabs, pins, and recent-tab identities belong to one account on one device.
The URL determines current navigation focus. Saved layout can add sibling tabs to a deep
link, but a delayed read cannot replace a newer navigation or another account's state.
IndexedDB does not synchronize this layout between devices.

`IndexedDbWorkbenchLayout` opens `followthrough-workbench:<encoded account id>` and creates
only its layout store. The client storage boundary parses rows with the Zod schema in
`models/workbench`. Invalid rows cause an explicit restore error. Reads do not delete or
repair those rows. Closing a connection ends its lifetime; it cannot reopen later.

The application shell binds the store to the current account and releases it on account
change or unmount. Releasing a binding clears tabs, pins, recent identities, split focus,
interaction focus, and the active project. Generation checks discard stale restore results
and prevent old navigation completions from saving into a new binding.

The store suppresses writes while the initial read is pending. This prevents the initial
single-note URL from replacing the saved working set before it can be restored. A newer
navigation during that read wins and is then saved for the current account.

## Existing device data

The previous `followthrough-note-sync` database has no account owner. The new reader does
not adopt it for whichever account signs in first, and it does not delete it. Users reopen
their tabs from navigation; note bodies and queued edits stay in their existing account-owned
synchronization database. No note or queued mutation is migrated by this change.

The strip-hidden and pane-width localStorage preferences remain device display preferences.
They carry no resource identities. Account layouts also retain their last saved values.

## Verification

Native IndexedDB tests cover account isolation, clearing one account without changing another,
unowned legacy data, malformed tab identities, invalid split ratios, reactive-state writes,
and closed connection lifetime. Stateful store tests cover account changes, delayed reads,
initial-write suppression, deep-link focus, and navigation/save races.

The authenticated browser regression seeds two accounts in an isolated PostgreSQL database.
It opens two notes for the first account, changes to the second account in the same browser,
and returns to the first note. Running it against the previous storage and shell code loses
the first account's second tab. The changed code restores both tabs. Matching before/after
captures are in `docs/pr-evidence/account-owned-workbench-tabs/`. The scenario's records are
removed after the test.
