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

## Durable agent execution

- [x] **Durable server-owned agent runs** — Deliver one vertical reliability slice in which an
      accepted agent run no longer depends on the originating browser request. Persist the run and its
      ordered text/tool/status events, then let a server-side worker claim it with a lease and
      heartbeat. A refresh, route change, temporary disconnect, or closed tab must not cancel the run.
      Any client can reattach by run ID, recover persisted progress and terminal output, and continue
      receiving live events; a status query remains the reliable fallback when streaming is
      unavailable. Support explicit cancellation and detect abandoned leases. Give run submission and
      mutating tool calls stable idempotency keys before enabling bounded automatic retries, so crash
      recovery cannot duplicate notes, todos, suggestions, or other writes. Surface queued, running,
      awaiting-approval, cancelling, cancelled, failed, and completed outcomes rather than leaving a
      run permanently in progress. Keep distributed scheduling, priority queues, and multi-worker
      throughput optimization out of the first slice unless the existing deployment topology requires
      them.

## Content transformations

- [ ] **General selection transformations** — Rewrite, expand, summarize, or restructure selected note content in place through the suggestion flow.
- [ ] **Action-oriented drafting** — Turn project context or selected material into follow-ups briefs, emails, reports, and other working drafts.
- [ ] **Reusable output workflows** — Allow skills to define repeatable transformations from notes, todos, project context, and artifacts into useful outputs.

## Images and visual assets

- [ ] **Image search and insertion** — Find relevant external images from selected content and insert an approved result into a note.
- [ ] **AI image generation** — Generate images from note content or instructions, review them, and save approved images to the project.
- [ ] **Image asset management** — Keep image files, metadata, attribution, provenance, and source relationships available within the project.

## Diagrams

- [ ] **Embedded draw.io editor** — Open and manually edit promoted draw.io diagrams without leaving the workbench.
- [ ] **Production Mermaid-to-draw.io conversion** — Convert Mermaid structure into useful editable draw.io shapes, connectors, and layout.. Will be done "agentically" in the sense that the agent will be able to propose a conversion, but the user will have to approve it before it is applied.
- [ ] **Draw.io rendering and versioning** — Produce reliable previews and retain revisions as diagram is polished.

## Backlog conventions

- An item being listed here does not imply a chosen scope, design, priority, or implementation order.
- Scope one item at a time against the current repository before implementation.
- Remove an item from this file once its agreed acceptance criteria are implemented and verified.
