# ADR backfill candidates

This is a working queue. It is not an ADR index.

Repository evidence shows what the system does. It does not prove why the system does it. A
candidate is ready only when the reason and trade-off are confirmed in an interview or an earlier
decision record.

## Ready to draft

### C002 — Build the product as one SvelteKit application, not a frontend and agent backend

- **Decision:** Keep the UI, server, agent tools, and MCP in one SvelteKit and TypeScript
  application. Make controllers the framework-free application contract.
- **Reason:** All delivery surfaces can use the same capabilities and domain types. The project
  does not need a second service boundary or a duplicate domain model.
- **Cost:** A new channel, such as a desktop app, may require a monorepo. At that point the
  controllers can move to a shared package.
- **Evidence:** `src/lib/server/controllers/`, `src/lib/remote/`,
  `src/lib/server/factories/agent/agent-tool-factory.ts`,
  `src/lib/server/factories/agent/mcp-tool-factory.ts`.
- **Readiness:** Ready. Drafted as ADR 0002.

### C003 — Treat the design system as a collaboration contract

- **Decision:** Keep one repository-owned design system for UI rules, tokens, interaction rules,
  and accessibility limits.
- **Reason:** Humans and agents need the same explicit rules. The product must not change by
  author or session.
- **Cost:** The rules need maintenance. Some visual decisions still need human judgment.
- **Evidence:** `DESIGN_SYSTEM.md`, `src/routes/layout.css`, `src/lib/components/ui/`.
- **Readiness:** Ready.

### C004 — Organize and construct the app by capability

- **Decision:** Group product code by capability. Construct each capability through its own
  factory.
- **Reason:** Product ownership stays visible. Humans and agents can change separate capabilities
  with less overlap.
- **Cost:** Factories add files and wiring.
- **Evidence:** `src/lib/server/factories/capabilities/`, commit `bfd0b3d`.
- **Readiness:** Ready.

### C005 — Put domain rules in services and workflows in controllers

- **Decision:** Keep one-domain rules in services. Put workflows that use several services in a
  controller.
- **Reason:** This prevents hidden service coupling. It also keeps services reusable.
- **Cost:** Controllers need explicit collaborators and transaction boundaries.
- **Evidence:** `src/lib/server/services/`, `src/lib/server/controllers/`, architecture audits.
- **Readiness:** Ready.

### C006 — Keep suggestion state and its result consistent

- **Decision:** Apply a suggestion and record its acceptance, result, and provenance in one
  transaction.
- **Reason:** The history must never say that a change landed when it did not. A landed change
  must not appear pending.
- **Cost:** Suggestion workflows need transaction-aware collaborators and reversal checks.
- **Evidence:** `src/lib/server/controllers/suggestions/controller.ts`,
  `src/lib/server/controllers/suggestions/lifecycle.spec.ts`.
- **Readiness:** Ready.

### C007 — Use projects as the durable work boundary

- **Decision:** Scope notes, todos, memory, attachments, diagrams, settings, and retrieval to a
  project when they belong to durable project work.
- **Reason:** A project defines ownership, context, and the boundary of a work stream.
- **Cost:** Moving data across projects needs an explicit transition.
- **Evidence:** Controller inputs and repository ownership checks across project capabilities.
- **Readiness:** Ready.

### C008 — Archive a project as one visible unit

- **Decision:** Hide an archived project and its content from normal views without archiving every
  child row.
- **Reason:** The project is the visible lifecycle boundary. Its data must remain stored.
- **Cost:** Every active view must scope through an active project.
- **Evidence:** `src/lib/server/controllers/projects/controller.ts`, project repository contracts.
- **Readiness:** Ready.

### C009 — Detect divergent note edits and accept landed retries

- **Decision:** Use revision tokens to reject divergent saves. Treat a repeated save as successful
  when the same content already landed.
- **Reason:** Two browser tabs must not silently overwrite each other. A lost response must not
  turn a successful save into a conflict.
- **Cost:** The client must retain base, local, and remote versions for conflict handling.
- **Evidence:** `src/lib/server/controllers/notes/controller.ts`,
  `src/lib/client/notes/sync/coordinator.ts` and their tests.
- **Readiness:** Ready.

### C010 — Restore note history by copying forward

- **Decision:** Restore an old snapshot as a new revision. Do not rewrite revision history.
- **Reason:** A restore must itself be reversible.
- **Cost:** Snapshot storage grows and needs a retention policy. Snapshots occur on publish, not on
  every edit.
- **Evidence:** `src/lib/server/controllers/notes/restore-revision.spec.ts`, commit `1cfe1b7`.
- **Readiness:** Ready.

### C011 — Run proofreading on the device

- **Decision:** Run proofreading in a browser worker. Keep the personal dictionary on the device.
- **Reason:** Typing feedback must be fast. Draft text must not leave the device for basic
  proofreading.
- **Cost:** The checker is English-only. Learned words do not follow the user to another device.
- **Evidence:** `src/lib/client/proofreading/harper-linter.ts`,
  `src/lib/stores/notes/proofreading.svelte.ts`, commit `80616c5`.
- **Readiness:** Ready.

### C012 — Keep todo categories open

- **Decision:** Store todo categories as user-defined text, not as a fixed enum.
- **Reason:** Users invent vocabulary that fits their work.
- **Cost:** The system cannot rely on a closed category set.
- **Evidence:** Todo model and schema, commit `9b3dbf8`.
- **Readiness:** Ready.

### C013 — Keep valid results from a partial vault import

- **Decision:** Import valid files when other files fail. Report each failure. A note shell may
  remain when its body cannot be saved.
- **Reason:** Rolling back a large onboarding import because a few files are malformed loses useful
  work. A reported partial result is recoverable.
- **Cost:** Users may need to remove or repair blank shells after the import.
- **Evidence:** `src/lib/server/controllers/imports/controller.ts` and `import.spec.ts`.
- **Readiness:** Ready.

### C014 — Fail instead of hiding weaker behavior

- **Decision:** Do not silently switch to a weaker result. Fail clearly. If an operation can return
  a partial result, state what it omitted.
- **Reason:** A user must know whether the requested work happened with the promised quality.
- **Cost:** Some non-critical failures will interrupt work until the user retries or changes the
  request.
- **Evidence:** Retrieval and OCR services that throw instead of falling back. Several violations
  are listed in `suspicious-findings.md`.
- **Readiness:** Ready.

### C015 — Keep binary media outside authored text

- **Decision:** Put binary bytes in object storage. Put references in notes and other authored
  text.
- **Reason:** Lists, exports, sync, and agent context must not carry repeated base64 data.
- **Cost:** References and bytes have separate lifecycles.
- **Evidence:** Attachment and todo screenshot storage, commit `f4488f5`.
- **Readiness:** Ready.

### C016 — Use direct, two-phase uploads

- **Decision:** Upload large bytes directly to an S3-compatible object store. Make the resource
  visible only after completion. Start later processing from durable state.
- **Reason:** The app server should not proxy large files. An abandoned upload must not look
  complete.
- **Cost:** Database and object storage cannot share one transaction. Retry and cleanup rules are
  required.
- **Evidence:** Attachment and deliverable upload controllers and services.
- **Readiness:** Ready.

### C017 — Keep vectors beside application data in PostgreSQL

- **Decision:** Use PostgreSQL with pgvector for stored embeddings. Do not add a separate vector
  service without a stronger need.
- **Reason:** Source and index lifecycle stay close. The project operates one less data system.
- **Cost:** Current retrieval has no BM25 and reciprocal-rank-fusion stage. This decision does not
  prevent adding one later.
- **Evidence:** `search_chunks` in `src/lib/server/db/schema/registry.ts`, knowledge-search
  repositories.
- **Readiness:** Ready.

### C018 — Treat chunking as product design

- **Decision:** Review chunk boundaries and carried context as product behavior. Keep exact token
  sizes as tuning values.
- **Reason:** Chunking controls what parts of a user's work can be found together.
- **Cost:** Changes require retrieval evaluation, not only a configuration edit.
- **Evidence:** `src/lib/server/services/knowledge-search/indexing.ts` and indexing tests.
- **Readiness:** Ready.

### C019 — Keep search available during reindexing

- **Decision:** Keep the prior embedded chunks searchable until their replacements have vectors.
- **Reason:** An edit must not make a source disappear from semantic search.
- **Cost:** Semantic search may briefly return old text. Lexical search must exclude that old text.
- **Evidence:** `index-maintenance.spec.ts`, `search_chunks.supersededAt`.
- **Readiness:** Ready.

### C020 — Use durable state as the background-work queue

- **Decision:** Use rows with missing embeddings as the embedding backlog. Do not add a separate job
  table for this work.
- **Reason:** The backlog is already durable state. A crashed worker can resume by scanning it.
- **Cost:** The table needs a partial index and per-source failure isolation.
- **Evidence:** `index-maintenance.ts`, `search_chunks_pending_idx`.
- **Readiness:** Ready.

### C021 — Make workspace retrieval an agent tool

- **Decision:** Let the agent decide when to search, what to search for, and whether to retry.
- **Reason:** Automatic retrieval fills every prompt with unrequested text and prevents the agent
  from correcting a poor query.
- **Cost:** The agent can fail to search when search would help. Evals must test tool choice.
- **Evidence:** Knowledge-search agent tools and agent request construction.
- **Readiness:** Ready.

### C022 — Discover long-tail tools on demand

- **Decision:** Keep a small common tool set in context. Discover other tools on demand and then
  expose their real schemas.
- **Reason:** Tool definitions consume context. Real schemas are required for reliable calls.
- **Cost:** Tool search becomes part of capability reachability and needs its own tests.
- **Evidence:** Agent tool catalog, tool embedding seed, and tool search tests.
- **Readiness:** Ready.

### C023 — Evaluate decisions and effects, not prose alone

- **Decision:** Run agent evals against the real controller graph. Check tool choice, arguments,
  stopping, and persisted effects.
- **Reason:** A valid-looking answer can hide a rejected call or a change in the wrong project.
- **Cost:** Evals need a real database and recorded model-dependent services.
- **Evidence:** Evaluation tests and repository test harness.
- **Readiness:** Ready.

### C024 — Keep one trace from user action to result

- **Decision:** Preserve trace context across submission, commit, background execution, model calls,
  tools, controllers, and the visible result. Instrument controller boundaries centrally.
- **Reason:** Agent traces show what the model did. App telemetry shows what the user received. A
  diagnosis needs both in one trace.
- **Cost:** Trace context becomes durable run data. Instrumentation needs coverage checks.
- **Evidence:** Controller instrumentation, run submission, and telemetry tests.
- **Readiness:** Ready.

### C025 — Use durable and idempotent long-running workflows

- **Decision:** Commit a run before starting work. Key submissions for idempotency. Journal events.
  Support cancellation and replay after refresh.
- **Reason:** A dropped response, restart, refresh, or repeated submission must not lose or repeat
  work.
- **Cost:** Runs need explicit states, event storage, recovery, and cancellation settlement.
- **Evidence:** Agent run controller and services, commit `6c9fe76`.
- **Readiness:** Ready.

### C026 — Separate profile memory from project memory

- **Decision:** Inject a small set of profile facts into every run. Retrieve the larger project
  memory only when it applies.
- **Reason:** Profile facts are always relevant. Project memory is long, changing, and scoped.
- **Cost:** The system needs separate lifecycle and retrieval rules.
- **Evidence:** Memory controller, memory indexer, and agent prompt construction.
- **Readiness:** Ready.

### C027 — Let agents propose memory changes

- **Decision:** Do not expose direct memory writes to the agent. Record a proposal and apply it only
  through the review policy.
- **Reason:** Memory changes affect later runs and need review, provenance, and reversal.
- **Cost:** A useful memory can remain pending until reviewed.
- **Evidence:** `src/lib/server/controllers/memory/controller.ts` and suggestion services.
- **Readiness:** Ready.

### C028 — Keep tool control outside the agent's reach

- **Decision:** Let users disable tools. Keep a small locked recovery set. Apply live tool authority
  when retrying a frozen request.
- **Reason:** The agent must not remove the route that lets it recover. A retry must not restore a
  tool the user has since disabled.
- **Cost:** Retry is not a byte-for-byte replay of old authority.
- **Evidence:** Tool-preference controllers and agent run retry tests.
- **Readiness:** Ready.

### C029 — Use direct Mistral OCR

- **Decision:** Call Mistral Document AI directly for OCR. Do not silently replace it with a weaker
  parser.
- **Reason:** Ordered Markdown conversion is the required document-ingestion result. The OpenRouter
  path does not provide the same OCR contract.
- **Cost:** The object store must be reachable by Mistral. The app needs a separate provider key.
- **Evidence:** Attachment processing, config, and commit `4eae319`.
- **Readiness:** Ready.

### C030 — Use OpenTelemetry as the telemetry contract

- **Decision:** Emit OpenTelemetry to a collector. Let deployment filter and route telemetry to
  Phoenix, Tempo, and Loki.
- **Reason:** The application should emit one portable stream instead of binding itself to each
  backend.
- **Cost:** The collector is another operated component.
- **Evidence:** `scripts/otel-instrumentation.js`, `otel-collector-config.yaml`.
- **Readiness:** Ready.

### C031 — Use Phoenix for agent traces

- **Decision:** Use Phoenix to inspect model, tool, retrieval, token, and evaluation traces.
- **Reason:** Ordinary logs do not show run shape. Phoenix provides the needed AI trace views and
  uses less memory than the considered MLflow deployment, which needed about 2 GB.
- **Cost:** Phoenix is another service. OpenTelemetry must remain the portable boundary.
- **Evidence:** Telemetry configuration, trace audit scripts, evaluation reporting.
- **Readiness:** Ready.

### C032 — Require managed secrets and rotation

- **Decision:** Require multi-environment secret management and rotation. Use Infisical as the
  current open-source provider. Keep plain environment variables as a supported simple mode.
- **Reason:** The app, worker, and provisioning process need one managed source of application
  secrets. The operator already uses Infisical across projects.
- **Cost:** The default setup reflects the maintainer's infrastructure and adds work for some
  self-hosters.
- **Evidence:** `src/lib/server/config.ts`, provisioning scripts, self-hosting docs.
- **Readiness:** Ready.

### C033 — Ship web and worker from one release image

- **Decision:** Build one image and run it as separate web and worker processes.
- **Reason:** Both processes must use the same code and contracts while they scale separately.
- **Cost:** The image contains code that each individual process does not run.
- **Evidence:** `Dockerfile`, `docker-compose.prod.yml`, worker build config.
- **Readiness:** Ready.

### C034 — Publish an opinionated reference deployment

- **Decision:** Maintain the current Caddy, Komodo, Infisical, external-network, and container setup
  as the reference deployment. Keep core interfaces portable. Do not abstract the topology before
  real consumers require it.
- **Reason:** Product and deployment can stay together while one operator owns both.
- **Cost:** Consumers may need to fork the deployment. Real adoption may require later separation.
- **Evidence:** `docker-compose.prod.yml` and self-hosting docs.
- **Readiness:** Ready.

## Confirm before drafting

These choices have evidence but still need a focused rationale check or a stable implementation:

- Skills are loaded on demand and record usage. The separate structured metadata model may be
  obsolete.
- Built-in skill upgrades protect user edits through released-content identity.
- Accepted context must not be silently truncated. The replacement design is not settled.
- Cross-project context transitions require explicit user intent.
- Unsaved editor text is context, not mutation authority.
- Preflight checks reject doomed mutations before an approval is requested.
- Generated diagrams remain temporary until kept. This behavior is in active development and is
  not ready for an ADR.

## Rejected as ADRs

- One shared search table is a current implementation.
- Exact chunk sizes are tuning values.
- Plain `ILIKE` matching is a current technique, not a retrieval quality decision.
- Broad vector recall followed by reranking is a technique until a durable trade-off is confirmed.
- One active run per conversation reflects a missing conversation-forking feature.
- Section numbering precedence is a tested setting rule, not an architecture decision.
