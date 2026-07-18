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

## Backlog conventions

- An item being listed here does not imply a chosen scope, design, priority, or implementation order.
- Scope one item at a time against the current repository before implementation.
- Remove an item from this file once its agreed acceptance criteria are implemented and verified.

# Attachments and visual assets

- Searchable project attachments — upload text, source files, PDFs, and images; process them asynchronously and expose relevant excerpts or image descriptions through project retrieval.
- Project visual assets — manage uploaded project images and insert reusable images into notes.
- Image search and insertion — future, unscoped.

# AI agent, retrieval, and authoring intelligence

Direction, rationale, and file-level detail for these items live in `docs/ai-systems-audit.md`. As
with the rest of this backlog, each item is intentionally high-level and should become its own
feature blueprint before implementation.

## Foundations

- [ ] **Fail-hard configuration and a single default model** — Remove silent fallbacks that hide
      misconfiguration: delete the deterministic fake embedder, move embeddings to OpenRouter and fail
      hard when the embedder is unavailable, and collapse the layered model-default chains into one
      explicit default (`deepseek-v4-flash`) used across chat, retrieval, compaction, and background
      extraction.
- [ ] **Agent and retrieval observability with self-hosted Phoenix** — Instrument the agent, tools,
      and retrieval pipeline with OpenTelemetry and OpenInference, exporting traces to the self-hosted
      Arize Phoenix, and use its datasets and evals as the measurement harness for retrieval and
      completion quality. The agent currently runs with tracing disabled.

## Agent and retrieval

- [ ] **Default toolset with on-demand tool search** — Expose a curated default set of agent tools
      every turn and add a tool-search tool the agent uses to discover the finer-grained tools on
      demand, keeping per-turn tool schemas small instead of handing the model the entire registry.
- [ ] **Context-aware retrieval pipeline** — Give retrieval a whole-context interface that condenses
      the conversation to a single query statement, runs a wide server-side cosine search, and shrinks
      the candidates with a Cohere reranker. Expose search as an agentic tool the model calls in small
      steps, and add an approximate-nearest-neighbour index before the corpus grows.
- [ ] **Conversation compaction at the context limit** — Before each agent pass, check context size
      and, only when it exceeds the limit, summarize the conversation and replace the old turns with
      the summary.
- [ ] **Skill discovery without lexical pre-filtering** — Drop the keyword skill selector; surface all
      skill summaries in the system prompt and load full instructions on demand through the existing
      skill-loading tool.
- [ ] **Durable memory consolidation** — Periodically deduplicate and merge remembered facts so the
      always-injected profile memory stays curated, and back model-proposed memory writes with a
      deterministic extraction pass.

## Authoring experience

- [ ] **Inline ghost-text completion** — Project-aware, editor-native next-span suggestions that accept
      on Tab, powered by a fast model and grounded in retrieved context.
- [ ] **Inline AI actions and slash commands** — Wire up the existing dormant editor AI surface
      (Ask-AI quick actions and the slash-command menu) so authors can transform text in place.
- [ ] **Discoverable assistant entry point** — Add a persistent affordance to open the assistant
      alongside the existing keyboard shortcuts.
