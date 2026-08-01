# Assertion lanes

Every case asserts through one or more of these lanes. Pick the cheapest lane that genuinely discriminates; add more only when they pin something the cheaper lane can't.

## Lane 1 — Subsystem / deterministic (no LLM)

Drive a subsystem directly instead of the agent. Cheap enough to run dozens of cases in the time one agent turn takes.

**Use when** the thing under test is the subsystem, not the agent's judgement: retrieval ranking, a repository filter, a catalog lookup.

**Example** (this repo, `retrieval`): seed a corpus, call the retrieval controller directly, assert the top result contains the expected phrase. It separates "the agent chose not to search" from "search ranked the wrong document" — two failures that look identical from outside.

**Temporal filtering** is a perfect fit: seed notes backdated across ages, call search with `createdAfter` / `createdBefore`, and assert the right notes survive. Fully deterministic, no model call, and it validates the "index backfills the owning source's creation time" claim end to end.

## Lane 2 — Tool-call presence / arguments

Assert the agent reached for the right capability, or passed usable arguments. Deterministic — no judge.

**Use when** the feature *is* a specific tool or argument: "proposes a memory for a durable fact", "passes the local date to the today view", "pauses a mutation for approval".

**Shape**: assert `calledToolNames` contains the tool (presence), or inspect a specific call's `arguments` (exact string / numeric range). Note the tool-wrapping caveat: if the registry dispatches long-tail tools through a `use_tool` wrapper, the event log records the *inner* name — assert on the capability, not the wrapper.

**Caveat — tool choice is model variance.** If the model can reach the same outcome through several tools, a hard "must call tool X" assertion measures tool-preference, not behaviour. Prefer asserting on the *set* of acceptable tools, or drop to a behavioural lane.

## Lane 3 — LLM judge

Hand the instruction, the user prompt, and the response to a judge model that returns a structured verdict (`followed` / `violated` / `not_applicable`) with one line of reasoning.

**Use when** the claim is semantic: language, precedence, scope, grounding. A lexical check would encode one rule into the harness and misjudge every other instruction.

**The instruction is data.** You write the instruction per case, so the *same* judge serves every adherence case. Bake concrete expected values into the instruction (the expected local date, the expected weekday) so the judge compares against a target instead of ruling on vibes.

**Pinning**: a stronger model than the subject, separately configured, so the judge can catch the subject's mistakes.

**Flakiness**: judges occasionally over-fixate on wording. If the date was right but the format differed, that is a judge bug, not an agent failure — loosen the instruction. If the judge wavers on an otherwise-stable deterministic check, prefer the deterministic check as the hard gate and keep the judge as the recorded signal.

## Lane 4 — Composite

A deterministic check pins the *mechanism*; a judge pins the *behaviour*.

**Example**: "limits a last-month query with createdAfter" — hard-assert the search call carried a `createdAfter` within a sensible window (the mechanism), and judge that the answer excludes the old note (the behaviour). The two can fail independently and tell you which half broke.

**When to downgrade**: if the deterministic check proves brittle (the model reaches the same behaviour through another legitimate route), keep it as the annotation and gate on the judge. The hard gate should always be the thing you actually mean to guarantee.

## Choosing

| Question | Lane |
|---|---|
| Is a subsystem doing the right thing? | 1 |
| Did the agent use the specific capability? | 2 |
| Did the agent behave correctly in semantics/precedence/scope? | 3 |
| Both the mechanism and the outcome matter | 4 |

Start at lane 1 and escalate only as far as the claim requires.
