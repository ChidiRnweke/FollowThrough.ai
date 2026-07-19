# Implementation Plan — AI Foundations (Milestone 1)

> Scope: milestone 1 of the direction in `docs/ai-systems-audit.md` / `PRODUCT_BACKLOG.md`. Detailed here; later milestones are sketched at the end.

## Context

The AI audit (`docs/ai-systems-audit.md`) identified foundations that every later improvement depends on: silent fallbacks that hide bugs, scattered model-default chains, embeddings that can silently run on a fake, and zero observability. This milestone fixes those four things so the retrieval/compaction/authoring work that follows is measurable and runs on real infrastructure.

**Non-negotiable correctness constraints:**

- `deepseek-v4-flash` is the **generation/chat** default only. **Embeddings must remain `text-embedding-3-large` (3072-dim)** — the `search_chunks.embedding` column is `halfvec(3072)`; changing the embedder invalidates every stored vector. We only move the _provider_ (OpenAI-direct → OpenRouter), not the model.
- **Fail hard applies to config/secrets/embeddings, not to telemetry export.** A missing key should crash at startup; a trace-export failure must never break a user request.

## Scope

**In this milestone:** (A) single generation default + fail-hard config, (B) embeddings on OpenRouter + delete the fake + fail hard, (C) Phoenix observability.

---

## Workstream A — Single generation default + fail-hard config

**Goal:** one explicit generation-model default (`deepseek/deepseek-v4-flash`, confirmed present on OpenRouter); no `??` chains that hide which model ran; crash at startup when a required secret is missing.

- **Collapse the model chains** into one constant sourced from a single env var. Replace:
  - `production-factory.ts:166-168` — `firstConfigured(OPENROUTER_DEFAULT_MODEL, OPENAI_AGENT_MODEL) ?? 'openai/gpt-5.6'` → `process.env.OPENROUTER_DEFAULT_MODEL ?? 'deepseek/deepseek-v4-flash'` (drop the deprecated `OPENAI_AGENT_MODEL` fallback).
  - `openai-relationship-capabilities.ts:30` and `openai-capabilities.ts:38` — `?? 'gpt-5.6-luna'` → the single default.
  - `openai-reference-capabilities.ts:122` — `?? 'openai/gpt-5.6'` → the single default.
  - Keep the runtime override precedence in `settings.ts:115-119` (`conversation.modelOverride ?? preferences.defaultModel ?? environmentDefault`) — legitimate user choice, not a hidden fallback. Only `environmentDefault` changes.
- **Verify tool support:** `deepseek/deepseek-v4-flash` must report `tools` in `supported_parameters` (the submit-time gate at `controller.ts:117` rejects non-tool models). Reuse `normalizeOpenRouterModelId` (`production-factory.ts:206`).
- **Fail hard on required secrets** at factory construction (`production-factory.ts`): throw a clear error if `OPENROUTER_API_KEY` is unset instead of letting individual capabilities degrade.
- **Unify background extraction on OpenRouter.** `openai-capabilities.ts` (promise, `:40`) and `openai-relationship-capabilities.ts` (relationship, `:32`) use the OpenAI SDK OpenAI-direct. Point both `new OpenAI(...)` at the OpenRouter `baseURL` + headers with model `deepseek-v4-flash`, and **drop `OPENAI_API_KEY` entirely** — everything runs on `OPENROUTER_API_KEY`. **Caveat:** both currently call `client.responses.parse(...)`. If that structured path doesn't round-trip on OpenRouter, switch to `client.chat.completions.parse(...)` / `response_format: {type: "json_schema"}` reusing the same Zod schema (consistent with the agent's `useResponses: false`). Validate early.

## Workstream B — Embeddings on OpenRouter, delete the fake, fail hard

**Goal:** embeddings run on OpenRouter with the same model/dimensions; the SHA-256 fake is gone; missing key crashes.

- **Add `baseURL` + `defaultHeaders` to `OpenAIEmbeddingClient`** (`openai-embedding-capabilities.ts:6-13`), mirroring the OpenRouter client shape at `openai-reference-capabilities.ts:123-130` (`baseURL: 'https://openrouter.ai/api/v1'`, `HTTP-Referer` from `PUBLIC_APP_URL`, `X-OpenRouter-Title: 'FollowThrough'`). Model default → `openai/text-embedding-3-large` (**same underlying model, same 3072 dims** — provider/base-URL change only).
- **Delete `DeterministicEmbeddingClient`** (`openai-embedding-capabilities.ts:36-55`) entirely.
- **Rewire the factory** at `production-factory.ts:169-172`: remove the `openAIKey ? OpenAIEmbeddingClient : DeterministicEmbeddingClient` branch; construct `new OpenAIEmbeddingClient(OPENROUTER_API_KEY, { baseURL, headers, model })`. The single instance still feeds the five consumers unchanged (attachment svc `:180`, note indexer `:182`, diagram indexer `:183`, knowledge searcher `:184`, memory indexer `:231`). No changes to the `EmbeddingClient` interface (`services/retrieval/contracts.ts:18-21`), the `.embed()` call sites (`indexing.ts:88,147,207,263`, `semantic.ts:28`), or the test fake `InMemoryEmbeddingClient` (`in-memory-search.ts:183`).
- **Reindex caveat:** if the deployment has been running without `OPENAI_API_KEY`, existing `search_chunks` vectors are fake and must be re-embedded once real embeddings are live. Same model via OpenRouter = compatible vectors, so if it _was_ on real OpenAI embeddings, no reindex is needed.

## Workstream C — Phoenix observability (OpenTelemetry + OpenInference)

**Goal:** every agent run, tool call, retrieval step, and OpenAI call is traced into the self-hosted Phoenix; nothing about export can break a request.

- **Preload module via `node --import`** — model it on TalkingCode's [`talkingcode-frontend/scripts/otel-instrumentation.js`](https://github.com/ChidiRnweke/TalkingCode/blob/main/talkingcode-frontend/scripts/otel-instrumentation.js) + [Dockerfile](https://github.com/ChidiRnweke/TalkingCode/blob/main/talkingcode-frontend/Dockerfile): a self-initializing ESM module using `@opentelemetry/sdk-node` `NodeSDK` with an OTLP-gRPC trace exporter that **auto-inits at import only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set** (guarded by a `globalThis` flag) and otherwise prints "telemetry disabled" and no-ops. This is the fail-hard boundary: telemetry is opt-in by endpoint presence and never crashes the app. Launch with `node --import ./scripts/otel-instrumentation.js build` (update the adapter-node start command / Dockerfile `CMD` and the dev run).
  - **Deps:** `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-grpc`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, **`@arizeai/openinference-instrumentation-openai`** + `@arizeai/openinference-semantic-conventions`. FollowThrough's server makes the OpenAI calls itself (unlike TalkingCode's frontend, which proxies to Python), so add `new OpenAIInstrumentation()` to the `instrumentations` array (optionally keep `pg` auto-instrumentation for retrieval DB spans). One instrumentation auto-captures **all six** `new OpenAI()` sites (agent `:267`, diagram `:437`, structured `:40`, reference `:123`, embeddings `:12`, relationship `:32`).
- **Env config:** `OTEL_EXPORTER_OTLP_ENDPOINT`, `PHOENIX_BASE_URL`, `PHOENIX_API_KEY`, `PHOENIX_PROJECT_NAME`/service name (`followthrough`). Declare in `src/env.ts` for documentation (manifest only — consumers read `process.env`). No hard-fail on a missing endpoint.
- **No-op tracer until registered:** a small tracer helper (mirror TalkingCode `telemetry/tracing.py`) returning a no-op tracer until the provider is set, so call sites never guard span creation.
- **Manual per-turn agent span:** wrap `openai-agent-capabilities.ts:154-167` (`runner.run(...)` through `stream.completed`) in an OpenInference span (`openinference_span_kind: "agent"`), set input (prompt) and output (final text), set **session id to `run.conversationId`**. Gotcha: Phoenix honors `session.id` only on a **root span (null parent)** — start it in a detached context so it isn't parented under an ambient HTTP span. Keep `tracingDisabled: true` (`:138`) for now.

---

## Verification

- **Capability tests (Vitest, `test:capability`; `expect.requireAssertions: true`):**
  - `OpenAIEmbeddingClient` is constructed with the OpenRouter `baseURL`, headers, and `openai/text-embedding-3-large`; assert target/model.
  - Factory throws when `OPENROUTER_API_KEY` is unset.
  - Model default resolves to the single `deepseek/deepseek-v4-flash` constant (grep asserts no `gpt-5.6*` literals remain).
  - Telemetry: register the provider with an OTel `InMemorySpanExporter`, run an agent turn against fakes, assert a span with `openinference_span_kind=agent`, non-empty input/output, `session.id == conversationId`.
- **End-to-end (`AppFactory`):**
  - Send a chat message; confirm in Phoenix (project `followthrough`) a turn span grouped by conversation with child OpenAI spans; trigger a search and confirm the embedding call is traced.
  - Unset `OPENROUTER_API_KEY` → app fails loudly at startup.
  - If migrating off the fake embedder: run the reindex path and spot-check retrieval.

---

## Roadmap (later milestones, dependency-ordered)

1. **Tool-search gating** — curated default toolset + a tool-search tool via the unused `options.classifications` hook (`openai-agent-capabilities.ts:238`) + system-prompt note.
2. **Retrieval pipeline** — retriever interface takes full context → OpenRouter condensation (single statement) → wide server-side cosine → Cohere rerank → agentic `search` tool with auto-detected filters. Port the TalkingCode `retriever_tool.py` / `query_intent.py` shapes.
3. **Compaction** — token-threshold check before each agent pass; summarize-everything into a custom `Session` wrapper around `PersistentAgentSession`. Make `maxTurns` configurable.
4. **Skills** — drop the lexical `KeywordRelevantSkillSelector`; inject all summaries + `load_skill`.
5. **Memory consolidation** — dedup/merge `memory_entries`; optional deterministic extraction backup.
6. **Authoring (features)** — ghost-text inline completion, revive the dormant slash/Ask-AI editor surface, discoverable chat affordance.
7. **Evals harness** — port TalkingCode `evals/` once traces are flowing.
