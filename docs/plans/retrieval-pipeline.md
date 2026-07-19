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

**Architecture (agreed):** register a fixed first-class set plus **two meta-tools** instead of all ~55, and dispatch the long tail by name.

The first-class set is `get_workspace_context`, `get_note`, `search`, `list_user_memory`, `list_project_memory`, `list_todos`, `load_skill`, and `propose_memory_change`. These frequent grounding, skill-loading, and memory-proposal capabilities are always visible. All other reads, proposals, and mutations remain in the searchable catalog.

1. **`search_tools(query)`** — searches the registry and returns the **exact input schema** of the top matches, so the model learns how to call them. Search is **embedding/rerank-based** over each tool's name + description (reuse the brick 1/2 retrieval + `OpenRouterReranker`), not lexical.
2. **`use_tool(name, payload)`** — dispatches to the registry by **verbatim `name`**. On mismatch → Levenshtein-nearest and return `"did you mean <x>?"` **without executing** (never run a guessed tool). Validates `payload` against the target tool's zod schema; on failure returns the validation error verbatim (fail loud + self-correction signal). On success, runs the underlying controller binding.

**Must-preserve — approval gating.** The safety model currently lives per-tool (`needsApproval = classification === 'mutation' && mode === 'approval_required'`). With a generic `use_tool`, resolve the target tool's classification from `payload.name` and gate **dynamically**: if `@openai/agents` `tool()` accepts a function `needsApproval(runContext, input)`, use it; otherwise have `use_tool`'s execute emit the approval interruption itself. Reads/proposals run through; mutations still hit the existing approval checkpoint/queue.

**No turn-start ranking.** Do not embed or rank tool descriptions before every turn. The direct set is stable; the existing tool retriever runs only when the model calls `search_tools`.

**Prompt.** Explain the data-first flow: inspect relevant workspace, note, todo, memory, search, or skill data with first-class tools; for anything else, `search_tools(query)` → read the returned schema → `use_tool(name, payload)`; iterate.

**Registry stays the source of truth** — `definitions()` continues to hold each tool's name, description, zod schema, classification, and controller binding; the two meta-tools read from it.

**To verify during build:**

- `@openai/agents` `tool()` supports a function-form `needsApproval` (else gate inside `use_tool`).
- Parallel tool calls still work (multiple `use_tool` calls in one turn).
- Levenshtein threshold: return a single suggestion only within threshold, else "no matching tool".
- Payload zod validation surfaces a clean, model-readable error.

---

# Cross-cutting — stable tool surface

Knowledge is never seeded; it comes from first-class reads such as `search`, `get_note`, and the memory tools. Tool schemas are never injected into the user message or persisted session history. `search_tools` performs the only long-tail ranking, and normal tool spans make that discovery visible without a separate turn preprocessing span.

When `use_tool` dispatches a long-tail capability, user-facing events and approval prompts show the inner tool name and payload. The SDK's outer call ID and serialized state remain unchanged so the exact interrupted call can resume safely.
