# AI Systems Audit — FollowThrough.ai

> **Deliverable type:** Audit & direction document (not an implementation plan). It maps how the app uses AI today, flags what's holding back the "smooth, smart, seamless" bar, and records the agreed direction on each item. File/line citations are included so any item can be picked up directly.

---

## Context

The product's core value proposition is that the AI feels smart and seamless. This audit examines the systems that determine that — the agent + its tools, retrieval/memory, and the AI-facing UX — and records the direction we've aligned on. The codebase is well-architected (durable run state, approval queues, a proposal pattern, prompt-injection framing); the gaps are places where intelligence is left on the table or where silent fallbacks hide problems.

**Provider note:** the app runs on **OpenRouter** (chat agent via `@openai/agents`, `useResponses: false`) and **OpenAI direct** (background extraction + embeddings). OpenRouter's Responses API is **stateless** (rejects `store` / `previous_response_id`, no compact endpoint), so the SDK's native `OpenAIResponsesCompactionSession` is not available on either OpenRouter path — anything stateful (compaction) is ours to build.

**Prior art — reuse the TalkingCode patterns.** [TalkingCode](https://github.com/ChidiRnweke/TalkingCode) runs the same stack (OpenAI Agents SDK over OpenRouter chat-completions, OpenRouter embeddings, Phoenix via OpenInference) and already implements most of what's below — it's Python, this app is TypeScript, but the shapes port directly. Concrete references are cited inline per section; treat its `services/tools/retriever_tool.py`, `services/tools/query_intent.py`, `services/ingestion/embedder.py`, `services/agent/agent_service.py`, `telemetry/*`, and `evals/*` as the reference implementation.

---

## Guiding principle: no silent fallbacks — fail hard and fast

Several places degrade silently instead of failing, which hides bugs and quietly lowers quality:

- **Fake embeddings.** With no `OPENAI_API_KEY`, production falls back to a SHA-256 `DeterministicEmbeddingClient` (`openai-embedding-capabilities.ts:36`, wired in `production-factory.ts:170`). Retrieval keeps "working" but returns semantic noise. **Delete this fallback**; throw if the embedder is unavailable. Mirror TalkingCode's `OpenRouterEmbedder` (`services/ingestion/embedder.py`): OpenRouter embeddings, retry 3× with backoff, then raise — never fabricate.
- **Model-default chains.** `OPENROUTER_DEFAULT_MODEL ?? OPENAI_AGENT_MODEL ?? 'openai/gpt-5.6'` (`production-factory.ts:166`) and similar `?? 'gpt-5.6-luna'` defaults silently paper over misconfiguration. Collapse these multi-level `??` chains into a single explicit default — **`deepseek-v4-flash`** (see §3.4) — rather than a fallback chain that hides which model actually ran.

The rest of this document assumes this principle.

---

## Observability: instrument everything with Arize Phoenix

Today the agent runs with `tracingDisabled: true` (`openai-agent-capabilities.ts:138`) — we have **zero** visibility into agent behavior, tool calls, or retrieval quality. Every change in this document (tool-search gating, the retrieval pipeline, compaction, ghost-text) needs traces to tune and to catch regressions. We already self-host Phoenix (at `phoenix.chidinweke.be`, instrumented in [TalkingCode](https://github.com/ChidiRnweke/TalkingCode)); reuse it here.

**Direction:** instrument with **OpenTelemetry + OpenInference**, exporting to the self-hosted Phoenix.

- **JS/TS path (TalkingCode is Python — this app isn't).** Register a `NodeTracerProvider` with a `BatchSpanProcessor` → OTLP exporter, plus `@arizeai/openinference-instrumentation-openai` so the underlying `new OpenAI(...)` client (`openai-agent-capabilities.ts:267`) is auto-instrumented. Packages: `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/resources`, `@opentelemetry/instrumentation`, `@arizeai/openinference-instrumentation-openai` — or the `@arizeai/phoenix-otel` wrapper for one-call setup. **Instrumentation must load before app code.**
- **Reuse the TalkingCode env conventions:** `OTEL_EXPORTER_OTLP_ENDPOINT`, `PHOENIX_BASE_URL`, `PHOENIX_API_KEY`, `PHOENIX_PROJECT_NAME` (set to `followthrough`). Add these to `env.ts` as first-class config (fail hard if the endpoint is set but unreachable — same principle as above).
- **Wrap each turn in a manual span carrying input/output.** TalkingCode learned that the OpenAI Agents instrumentor **never records input/output on the trace-root or agent spans** (`telemetry/tracing.py`, `services/agent/agent_service.py`), so it wraps every turn in a manual OpenInference span (`openinference_span_kind="agent"`) and calls `set_input(question)` / `set_output(final)`. Do the same in the FollowThrough run executor.
- **Group by conversation, and mind the root-span rule.** Phoenix only honors `session.id` on a span whose **parent is null** — TalkingCode detaches the turn span from the ambient HTTP request span (passes an empty context) so session grouping isn't silently dropped. Group FollowThrough spans by `conversationId` the same way.
- **No-op tracer until registered.** TalkingCode's `get_phoenix_tracer()` returns a no-op tracer until Phoenix is configured, so call sites never guard span creation. Mirror that with a small tracer helper.
- **Manual child spans for the rest:** tool calls (via the registry), the retrieval pipeline (condense → cosine search → Cohere rerank, each a child span), compaction, ghost-text. OpenInference JS ships `withSpan` / `traceTool` / `traceChain` for this.
- **Keep the `@openai/agents` native tracing disabled** (it targets OpenAI's platform) and rely on the OTel/OpenInference export to Phoenix instead.
- **Beyond traces — port TalkingCode's eval harness.** It has a full one (`evals/`: `build_agent` reused between prod and evals, golden datasets, an LLM judge, scorers, trajectory eval). Build the FollowThrough equivalent so retrieval-quality (§2.2) and completion-quality (§3.1) changes are measured against a curated dataset, not eyeballed — and factor the agent construction so evals reuse the exact production agent.

Sources: [OpenInference JS](https://arize-ai.github.io/openinference/js/), [Phoenix TS tracing setup](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/javascript).

---

## 1. How AI works today (architecture map)

| Layer                          | Implementation                                                                                                    | Key files                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Chat agent**                 | `@openai/agents` `Runner.run(..., {stream, session, maxTurns: 20})` over an OpenRouter `OpenAIProvider`           | `openai-agent-capabilities.ts`                                               |
| **Tools**                      | Hand-defined registry of ~55 tools wrapping controllers; classified `read \| proposal \| mutation`                | `agent-tool-registry.ts`                                                     |
| **Context builder**            | Parallel assembly: top-8 semantic search + profile memory + context notes + skills                                | `agent-context-capabilities.ts`                                              |
| **Retrieval (RAG)**            | pgvector `halfvec(3072)` over notes/memory/attachments/diagrams; cosine distance; `text-embedding-3-large`        | `services/retrieval/*`, `postgres-search.ts`                                 |
| **Memory**                     | Two-tier: profile memory (always injected) + project memory (retrieved); agent writes via `propose_memory_change` | `services/memory/management.ts`, `schema.ts:697`                             |
| **Sessions**                   | SDK `Session` interface backed by Postgres (`PersistentAgentSession` / `BufferedAgentSession`)                    | `persistent-agent-session.ts`                                                |
| **Durable runs**               | Per-user-message run; queued→running→awaiting_approval→completed; serialized `RunState` for approval resume       | `agent-run-executor.ts`                                                      |
| **Editor AI (partly dormant)** | Bubble-menu actions live; inline "Ask AI" + slash menu built but unwired                                          | `note-editor.svelte`, `edra/AI.svelte`, `edra/commands/BuiltinExtensions.ts` |
| **Chat UX**                    | Right-panel chat, `Ctrl/Cmd+Shift+I` focus, `@`-mention picker, apply-diff, suggestion cards                      | `chat-panel.svelte`, `commands/keyboard.ts`                                  |

**Run lifecycle (clarification):** context is rebuilt **per user message** — each message is a new `AgentRun`, and `prepare()` rebuilds context when `contextSnapshot` is empty (`agent-run-executor.ts:132`). `maxTurns: 20` is the internal tool-calling loop within one user message, not conversation turns. (An earlier draft wrongly claimed context was frozen across a conversation.) It's hardcoded — TalkingCode makes this a configurable `max_iterations` on the agent service; consider the same, since the iterative-search direction (§2.2) will use more tool-loop turns per message.

---

## 2. Findings & agreed direction

### 2.1 Tools — the agent always sees all ~55 tools · **agreed direction**

`openai-agent-capabilities.ts:262` calls `registry.tools()` with **no classification filter** (the `options.classifications` hook exists but is unused), so every tool is handed to the model every turn. Tool-selection accuracy degrades past ~20 tools, all schemas occupy context every turn, and it worsens with each feature added.

**Direction: default toolset + a tool-search tool for the long tail.** Expose a curated set of **default tools** every turn (the common core), and add a **tool-search tool** the agent can call to discover and pull in the more fine-grained tools on demand. Mention in the system prompt that when a needed capability isn't in the defaults, it should use tool search to find it. This is the same progressive-disclosure pattern already used for skills (`load_skill`) — small fixed surface, full capability reachable on demand — and it keeps per-turn schemas lean without hand-pruning the registry.

### 2.2 Retrieval — one-shot, coarse, no rerank · **agreed direction**

Today: a single top-8 vector search per user message, keyed on the message alone, raw cosine ranking, no ANN index (`postgres-search.ts:227` is a full sequential scan), and hard-gated on `projectId` (`agent-context-capabilities.ts:36`) so project-less chats retrieve nothing.

**Direction:**

- **Retriever interface takes the entire context; it condenses internally.** The retrieval interface accepts the full conversation context. Under the hood it calls OpenRouter (small model — `deepseek-v4-flash`) to summarize that context into a **single statement**, then embeds that one statement and runs the vector search. So the query always reflects the _whole_ conversation, not just the last message — callers don't construct a query. This is the same shape as TalkingCode's query-refinement step (`services/tools/query_intent.py`), which uses a small model with **structured output** to produce a refined query; the difference is FollowThrough condenses the full context rather than refining a per-search phrase. (Distinct from the compaction summary in §2.3.)
- **Auto-detect filters, don't hard-gate.** Alongside the condensed query, detect scope filters (project, note-type) the way TalkingCode's intent extractor does — set a filter _only_ when it's clearly implied, otherwise leave it null and search broad. This replaces the current hard `projectId` gate (`agent-context-capabilities.ts:36`): project-less/cross-project chats search broadly instead of retrieving nothing, and in-project intent still narrows.
- **Retrieve wide, then Cohere rerank to shrink.** Cast a wide net with the cosine-similarity search (computed **DB/server-side** in Postgres, as it already is — pull a large candidate set), then run a Cohere fast reranker over those candidates to shrink down to the final few passed to the model. Wide recall from the cheap vector step, precision from the reranker. (TalkingCode stops at `top_k=8` with no rerank — this is FollowThrough's extension.)
- **Agentic iterative search.** Make `search` a strong, always-available tool the model calls in small steps, instead of front-loading a big context block. Drive it from the system prompt exactly as TalkingCode does (`services/agent/agent_service.py`): "search several times across turns; after a search returns, write a sentence about what you found and what to check next, then search again," building the answer progressively.
- **Add an ANN index** (HNSW/IVFFlat) on `search_chunks.embedding` before the corpus grows.

### 2.3 Conversation length — unbounded, no summarization · **agreed direction**

`agent_session_items` grow unbounded; no summarization anywhere; `maxTurns: 20` is the only guard.

**Direction: coding-agent-style compaction, triggered only at a token limit.** Compaction is _not_ continuous. **Before each LLM call / agent pass, check the current context token size; if it exceeds the limit, compact** — summarize the conversation and replace the old turns with the summary. Otherwise pass the context through untouched. Implemented as a custom `Session` wrapper (or a pre-run check), since no native compaction is available on OpenRouter. The only "budget" is the single token-threshold check that gates whether to compact — no per-turn budgeting machinery. This compaction summary is separate from the retriever's one-statement condensation (§2.2).

### 2.4 Skills — lexical selection · **agreed direction**

`KeywordRelevantSkillSelector` (`services/skills/selection.ts`) pre-filters skills by lexical overlap before they reach the system prompt. But the good pattern already half-exists: `openai-agent-capabilities.ts:249` injects skill _summaries_ as a `<skills>` block with a `load_skill` tool for full instructions.

**Direction: drop the lexical selector.** Inject **all** skill summaries into the system prompt + keep `load_skill`. No embedding selector — progressive disclosure via the tool is enough.

### 2.5 Memory · **strong; minor follow-ups**

The two-tier model (profile always-injected, project retrieved) + revertible proposal queue is genuinely good. Follow-ups: periodic dedup/merge of `memory_entries` so always-injected profile memory doesn't grow uncurated; consider a deterministic extraction pass backing up model-initiated `propose_memory_change`.

### 2.6 AI-facing UX — solid, with large dormant upside

Strong: `@`-mention picker, context chips, apply-diff, suggestion cards, bubble-menu actions, `Cmd+K` chord.

Gaps:

- **Chat is shortcut-only** (`Ctrl/Cmd+Shift+I`) — no persistent, discoverable affordance.
- **No inline tab-completion.**
- **Slash-command menu is a no-op stub** — `SlashCommand` (`edra/commands/BuiltinExtensions.ts:185`) returns an empty extension.
- **The inline "Ask AI" surface is built but unwired** — `edra/AI.svelte` exists and `AIHighlight.configure({ callAI })` is registered, but `callAI` is never passed and `AI.svelte` is never mounted. Prompt templates already exist (`BuiltinExtensions.ts:195`).

---

## 3. New feature opportunities

### 3.1 VS Code / Copilot-style inline ghost-text completion · **flagship**

A fast, cheap model predicts the next span as **ghost text**; `Tab` accepts, `Esc` dismisses — suggestions appear without the user asking. Very feasible: the editor is real Tiptap/ProseMirror, `edra/AI.svelte:204` already does positioned streaming inserts, and `note-editor.svelte:250` registers runtime plugins, so a ghost-text decoration plugin slots in the same way. What makes it _smart_: condition completions on retrieved project context (§2.2), so it completes with the user's own notes/terminology. Debounce, fire on pause, cancel in-flight on keystroke; ghost text is a decoration (never real content until accepted) so it never touches undo history.

### 3.2 Revive the dormant inline "Ask AI" + slash commands · **near-free, mostly wiring**

- **Slash commands:** implement a real ProseMirror Suggestion plugin behind the `SlashCommand` stub; menu UI + prompt templates already exist.
- **Inline Ask-AI:** thread a `callAI` implementation from `note-editor.svelte` into `createEditor` and mount `AI.svelte`. Shares the fast-model plumbing with §3.1.

### 3.3 Make chat discoverable without the shortcut

Add a persistent affordance (floating "Ask" button or dock icon) alongside `Ctrl/Cmd+Shift+I` and the `Cmd+K → C` chord, plus an empty-state prompt in the panel.

### 3.4 Task-differentiated model tiers

A **fast/cheap tier** for latency-sensitive, high-volume paths (ghost-text §3.1, summary generation §2.2/§2.3), the **capable user-selected tier** for agentic chat, and a schema-reliable model for structured extraction. This is what makes keystroke-frequency completion affordable. **The default model everywhere — every default in the app: chat agent, retrieval condensation, compaction summary, background extraction, ghost-text — is `deepseek-v4-flash`.** User-selectable overrides still apply where they exist (e.g. per-conversation chat model); `deepseek-v4-flash` is the default they override _from_. Replace the current `gpt-5.6*` placeholder defaults accordingly. Note OpenRouter uses `provider/model` IDs, so the config value is likely `deepseek/deepseek-v4-flash` — verify the exact slug against the OpenRouter catalog.

---

## 4. Suggested reading order

1. `openai-agent-capabilities.ts` — agent, tool exposure, context injection, skills block (§2.1, §2.4).
2. `agent-context-capabilities.ts` — what the model knows each run (§2.2).
3. `services/retrieval/*` + `postgres-search.ts` + `openai-embedding-capabilities.ts` — retrieval + the fail-hard embedding fix (principle, §2.2).
4. `persistent-agent-session.ts` — the `Session` interface to wrap for compaction (§2.3).
5. `agent-tool-registry.ts` — the 55-tool surface (§2.1).
6. `edra/AI.svelte` + `edra/commands/BuiltinExtensions.ts` — dormant inline-AI to revive (§3.1, §3.2).

---

_Assessment only — no code changes proposed here. Agreed direction: no silent fallbacks / fail hard; instrument everything with self-hosted Arize Phoenix (OpenTelemetry + OpenInference); token-threshold-triggered summarization compaction; a retriever whose interface takes the full context and condenses it to one statement (via OpenRouter) before searching; small-K retrieval + Cohere rerank + agentic iterative search; drop the lexical skill selector (summaries + `load_skill`); OpenRouter embeddings; default toolset + a tool-search tool for the long tail (§2.1). No open items._
