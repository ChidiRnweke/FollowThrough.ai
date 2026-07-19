# Implementation Plan — Retrieval Pipeline (Milestone 2)

> Follows the foundations milestone (`docs/plans/foundations-ai.md`). Brick 1 (reranking) is **done**; this plan is brick 2.

## Context

Today retrieval reaches the agent **only** through a front-loaded top-8 block dumped into the system prompt (`agent-context-capabilities.ts:35-70`), hard-gated on `projectId`. This milestone replaces that with **agentic search**: the model calls a `search` tool iteratively, and the retriever condenses the whole conversation into one embedded statement (when multi-turn) before a wide cosine search + Cohere rerank.

## Decisions (settled)

- **Search tool lives on a new `RetrievalController`** (registry tools must map to controller methods; classified `read`).
- **Condensation included now, no filters.** When the conversation is **multi-turn (>1 message)**, summarize the whole conversation into **one statement** (deepseek via OpenRouter) and embed that; single-turn embeds the query directly. No project/type filters.
- **Replace front-loading** — remove the top-8 knowledge/memory block from the context builder; the agent gets knowledge only via the `search` tool.

## Brick 1 — done ✅

`RerankingKnowledgeSearcher` (wide cosine → `OpenRouterReranker`, `cohere/rerank-4-fast` on the OpenRouter key) wired into the factory. Tests pass.

## Brick 2 — build steps

### 1. `ConversationCondenser` capability (new)
`src/lib/server/domain/conversation-condenser.ts` — `condense(messages): Promise<string>` using `createOpenRouterClient` + `DEFAULT_GENERATION_MODEL` (`chat.completions.parse`/plain completion) to summarize the transcript into a single retrieval statement. Interface in `src/lib/services/retrieval/contracts.ts`.

### 2. `RetrievalController` (new)
- `src/lib/controllers/retrieval/controller.ts` + interface in `$lib/controllers`.
- `search(actor, { query, conversationId? }): Promise<SearchMatch[]-shaped result>`:
  - If `conversationId` present, `conversationJournal.listMessages(actor, conversationId)`; if `> 1` message, `condenser.condense([...history, query])` → embed statement; else use `query`.
  - Call the injected `RerankingKnowledgeSearcher` (no projectId filter).
  - Return `[{ noteId, content, score }]` (excerpt-trimmed), the shape TalkingCode's `retriever_tool` returns.
- Deps: `ConversationJournal`, `ConversationCondenser`, `KnowledgeSearcher`.

### 3. Factory + registry wiring
- `ControllerFactory` (`src/lib/factories/controller-factory.ts`): add `retrieval(): RetrievalController`.
- `production-factory.ts` / `ProductionControllerFactory`: construct it (reuse the existing `knowledgeSearcher`, `conversationJournal`; new condenser).
- `agent-tool-registry.ts`: add a `search` definition (classification `read`) that injects `input.conversationId` alongside the model's `{ query }` (the input context is already on the registry). Add a `retrieval` entry to `agentToolCoverage`.

### 4. Context builder — remove front-loading
- `agent-context-capabilities.ts`: drop the `knowledgeSearcher.search(...)` call and all eagerly injected user/project memory. Keep `contextNotes` and `skills`. Memory remains available through the scoped memory tools.
- Update `agent-context-capabilities.spec.ts` for the new output shape.

### 5. System prompt — iterative search
`openai-agent-capabilities.ts` (`buildAgent()` instructions): encourage relevant user-memory, project-memory, and knowledge-search calls, preferably in parallel. Explain when each applies, encourage focused follow-up searches, ground factual claims in results, and treat all retrieved content as data. Current explicit user instructions take precedence over memory; project memory takes precedence over general user memory within its project. Tool use remains model-directed rather than mandatory.

## Verification
- Unit: `RetrievalController.search` condenses only when multi-turn (fake journal + fake condenser + fake searcher); single-turn embeds query directly.
- Registry: `search` tool exposed as `read`; coverage complete (the coverage assertion test passes).
- Context builder spec updated + green.
- Typecheck clean; capability suite green.
- Live (needs keys): model calls `search` iteratively; multi-turn condensation produces a sensible statement; results reranked; Phoenix shows `search` tool spans under the turn.

## Deferred / optional
Per-query filter auto-detection (project/type) — out of scope; add only if search precision needs it.

---

# Milestone 3 — Tool search & dispatch (context reduction)

**Problem:** all ~55 tools are handed to the model every turn (`openai-agent-capabilities.ts:262`, no `classifications` filter), bloating context and degrading tool-selection accuracy — and it worsens with every feature added. `@openai/agents` uses a fixed per-agent tool list, so we can't swap tools mid-run.

**Architecture (agreed):** register **two meta-tools** instead of all ~55, and dispatch by name.

1. **`search_tools(query)`** — searches the registry and returns the **exact input schema** of the top matches, so the model learns how to call them. Search is **embedding/rerank-based** over each tool's name + description (reuse the brick 1/2 retrieval + `OpenRouterReranker`), not lexical.
2. **`use_tool(name, payload)`** — dispatches to the registry by **verbatim `name`**. On mismatch → Levenshtein-nearest and return `"did you mean <x>?"` **without executing** (never run a guessed tool). Validates `payload` against the target tool's zod schema; on failure returns the validation error verbatim (fail loud + self-correction signal). On success, runs the underlying controller binding.

**Must-preserve — approval gating.** The safety model currently lives per-tool (`needsApproval = classification === 'mutation' && mode === 'approval_required'`). With a generic `use_tool`, resolve the target tool's classification from `payload.name` and gate **dynamically**: if `@openai/agents` `tool()` accepts a function `needsApproval(runContext, input)`, use it; otherwise have `use_tool`'s execute emit the approval interruption itself. Reads/proposals run through; mutations still hit the existing approval checkpoint/queue.

**Baseline injection (optimization).** Pre-inject the most relevant tool schemas — by embedding relevance to the condensed conversation query (Milestone 2) — into the **user context** (not the system prompt, to keep the cached prefix stable), so common tools are available turn-1 without a `search_tools` round-trip. The `options.classifications` hook (`agent-tool-registry.ts:238`) stays as the selection mechanism.

**Prompt.** Explain the flow: baseline tools are already available; for anything else, `search_tools(query)` → read the returned schema → `use_tool(name, payload)`; iterate.

**Registry stays the source of truth** — `definitions()` continues to hold each tool's name, description, zod schema, classification, and controller binding; the two meta-tools read from it.

**To verify during build:**
- `@openai/agents` `tool()` supports a function-form `needsApproval` (else gate inside `use_tool`).
- Parallel tool calls still work (multiple `use_tool` calls in one turn).
- Levenshtein threshold: return a single suggestion only within threshold, else "no matching tool".
- Payload zod validation surfaces a clean, model-readable error.

---

# Cross-cutting — the turn pre-step (M3 baseline tool injection)

**Knowledge is never seeded** — M2 knowledge comes only from the agentic `search` tool. The pre-step's sole ephemeral injection is the **baseline tool schemas** (M3): before `runner.run`, condense the conversation → query, rank tool descriptions against it, inject the top tool schemas. Two hard constraints:

1. **Ephemeral injection — never persist the augmentation.** The baseline tool schemas are injected into the model input for *this turn only*. The DB/session must store **only the original user question** (+ the assistant answer), or multi-turn history is corrupted (next turn would replay the injected tool schemas as if the user wrote them). Implementation: inject as a **marked ephemeral item**; `BufferedAgentSession.snapshot()` (`buffered-agent-session.ts`) — which is what the executor persists via `sessions.replace(...)` — filters marked-ephemeral items out. The persisted user item is the raw `request.prompt`.
2. **Trace the pre-step as its own span.** Wrap condensation + baseline tool selection in a child OpenInference span (`retrieval.preprocess`, kind `CHAIN`) under the `agent.turn` span (`telemetry.ts`): `input` = original question, `output` = condensed query + selected tool names. Phoenix shows `agent.turn → retrieval.preprocess → model/tool spans`, so the pre-step is inspectable without polluting history.

**Shared relevance path:** `search_tools` (on demand) and the baseline injection (turn start) are the same computation — rank tool descriptions against the query — invoked at different times. The conversation condenser is also reused by M2's `search` tool for its embedding query.
