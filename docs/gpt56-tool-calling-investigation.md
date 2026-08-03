# Investigation: gpt-5.6 models cannot drive the note/skill edit tools

Status: needs a different model to root-cause. Handed off for a second pass.

## Problem

The strict note/skill edit eval cases fail on every model tried so far. The
`applyNotePatch` matcher was made robust (whitespace/punctuation-tolerant unique
apply, committed in `d228f35`), but it did not change the outcome, because the
models never reach the matcher.

| Model | Behavior on the strict surgical edit case |
| --- | --- |
| `deepseek-v4-flash` (default) | completes, but intermittently passes a wrong noteId or malformed payload |
| `gpt-5.6-luna` | loops to max turns (20) |
| `gpt-5.6-terra` | pre-change: `edit_note` with `{}`; post-change: re-searches and gives up |
| `gpt-5.6-sol` | re-searches and gives up (identical to terra) |

## What was ruled out

1. **The markdown↔ProseMirror bridge.** A tool-layer diagnostic ran the real
   `edit_note`/`save_note` against the seeded Background note with valid inputs:
   `edit_note Kubernetes→K8s` → `appliedEdits: 1, matchedTexts: ["Kubernetes"]`,
   and `save_note` succeeded. The matcher is correct.
2. **The `input_schema` visibility.** `search_tools` returns a clean inline JSON
   Schema (`z.toJSONSchema`) with `required` fields and no `$ref` indirection,
   and `invalidUseToolPayload` re-sends it in the failure. The schema is not
   hidden from the model.
3. **The instruction gap.** Adding a concrete worked example to `use_tool`'s
   description and making `payload` required in the envelope did not make the
   gpt-5.6 models construct the payload.

## Diagnostic evidence

Tool-call dumps from the surgical edit prompt ("change Kubernetes to K8s in the
Background note"), captured via the eval lab's event log.

### Before the description change (gpt-5.6-terra)

```
get_note      args={"noteId": "..."}                    OK
search_tools  args={...edit an existing note...}        OK
edit_note     args={}                                   → "Invalid payload for \"edit_note\"." (×3)
save_note     args={}                                   → "Invalid payload for \"save_note\"."
status=completed
```

### After the description change (gpt-5.6-terra and gpt-5.6-sol, identical)

```
get_note      args={"noteId": "..."}                    OK
search_tools  args={"limit":5,"query":"edit an existing note by exact text replacement"}   OK
get_note      OK   search_tools(...)   search_tools({"limit":10,"query":"modify note markdown exact replacement edit_note save_note"})
get_note      OK   search_tools(...)   ...   search_tools({"limit":15,"query":"notes update content"})
status=completed                                      ← gives up, never calls edit_note/save_note
```

## Key facts

- gpt-5.6 models correctly fill **flat** tool arguments (`get_note {noteId}`,
  `search_tools {query, limit}`) but never construct the **nested** `payload`
  for `use_tool`. Flat-ok / nested-empty is the core signal.
- The SDK parser (`@openai/agents` `tool.js:607`) succeeded on the `use_tool`
  call — there was no "Invalid JSON input" error. The failure came from
  `invalidUseToolPayload` (`tool-recovery.ts:65`), so the model genuinely sent
  an empty/absent payload, not malformed JSON.
- gpt-5.6-luna/terra/sol are consistent: read → search → re-search → give up.
  This looks systematic (model family or provider/runner integration), not a
  per-model flake.

## Root-cause candidates for the next model to investigate

1. **gpt-5.6 family limitation with nested object tool arguments** — the
   `payload` object inside the `use_tool` envelope is dropped or never built.
2. **Provider/SDK boundary** (highest-value next step): inspect the RAW model
   tool-call output *before* the `@openai/agents` runner parses it, and confirm
   whether the payload was emitted by the model and lost in parsing, or never
   emitted. This distinguishes a model bug from an integration bug.
3. **The two-hop indirection** (`search_tools` returns the schema; the model must
   repackage it under `use_tool.payload`) is hard, but no tested model completes
   it, so treat it as unlikely to be the sole cause.

## Code changes made (uncommitted, interleaved with tool-embeddings WIP)

- `src/lib/server/services/agent/runs/tool-recovery.ts`: `payload` is now
   required in `useToolEnvelopeSchema`; `invalidUseToolEnvelope` /
   `invalidUseToolPayload` recovery text names the required fields from the
   schema.
- `src/lib/server/agent-tool-factory.ts`: `use_tool` and `search_tools`
   descriptions now include a concrete worked example (`edit_note`) and direct
   the model to place schema fields under `payload`.

## To reproduce

- Matcher unit tests: `src/lib/models/notes/note-patch.spec.ts` (21 tests).
- Eval: `pnpm test:evals -t "edit"` with `EVAL_MODEL=openai/gpt-5.6-*`. Strict
  cases: `note-surgical-edit-requires-edit-note`, `invoke-edit-note`,
  `note-rewrite-requires-save-note`.
- Tool layer: `edit_note`/`save_note` on the seeded Background note succeed with
  valid inputs (a temporary diagnostic under `src/evals/lab/`).

## Open questions

- Does a capable model (full `gpt-5.6` non-variant, Claude, or another
  OpenRouter model) pass the strict edit cases? If yes, the eval-model story is
  "pick a capable model." If no, the exact-anchor edit UX itself may need
  revisiting.
- Should the edit evals stay strict (tool choice + landed effect) or assert tool
  choice with tolerated execution (green on the fast model)?
