# Product Backlog

This backlog tracks product capabilities and records completed foundations where they clarify the
remaining scope. Unchecked items are intentionally high-level and should be turned into their own
feature blueprint before implementation.

## Offline access and sync

### Completed foundations

- [x] **Device-local drafts for existing notes** — Persist the last-synced base and local rich
      document in IndexedDB before attempting a remote save. Coalesce repeated edits in a durable
      per-user, per-note outbox and retry pending work when connectivity returns or the app becomes
      visible.
- [x] **Atomic ETag synchronization for note content** — Identify notes persistently, derive an
      opaque ETag from note identity and content revision, and conditionally save title, rich content,
      plain text, and pin state through a SvelteKit remote command. The server performs an atomic
      compare-and-swap and returns the next authoritative ETag. Identical retries are acknowledged
      idempotently.
- [x] **Initial note sync inventory** — List current note IDs, project IDs, ETags, and update times
      through a SvelteKit remote query. Conditional writes remain the correctness boundary.
- [x] **Conflict comparison and explicit resolution** — Preserve the last-synced base, local working
      copy, and current remote rich document when ETags diverge. Compare base-to-local and
      base-to-remote changes, then let the user keep the complete local or remote document without
      silently replacing either side.
- [x] **Core sync visibility and replay** — Show loading, pending-on-device, syncing, conflict, error,
      and synced states; provide manual retry; and partition cached records by user and note.

### Remaining work

- [ ] **Installable PWA and offline workspace shell** — Make the workspace installable and able to
      reopen without a connection by caching versioned application assets and the minimum navigation
      shell. This enables offline access but does not, by itself, make server-backed data safe to edit
      offline.
- [ ] **Offline note creation and broader mutations** — Cache the project metadata required to create
      notes with client-generated IDs. Extend the outbox and conditional-write model to create,
      delete, move, and archive operations while keeping agent actions, retrieval, and attachments
      online-only initially.
- [ ] **Incremental change and deletion discovery** — Extend the initial inventory with tombstones and
      a change cursor so clients can efficiently discover remote updates and deletions across many
      notes after their first snapshot.
- [ ] **Safe automatic conflict merging** — Automatically merge changes only where rich-document
      structure and edit ranges prove that the edits do not overlap; retain the explicit comparison
      flow for every ambiguous case.
- [ ] **Offline data lifecycle controls** — Detect and communicate offline state explicitly, define
      storage quotas and eviction behavior, and let sign-out clear or deliberately retain cached
      workspace data on the device.

## Images and assets

- [ ] **Image search and insertion** — Find relevant external images from selected content and insert an approved result into a note.
- [ ] **Image asset management** — Keep image files, metadata, attribution, provenance, and source relationships available within the project.



## Backlog conventions

- An item being listed here does not imply a chosen scope, design, priority, or implementation order.
- Scope one item at a time against the current repository before implementation.
- Remove an item from this file once its agreed acceptance criteria are implemented and verified.
