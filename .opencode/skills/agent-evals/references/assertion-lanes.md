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

Hand the instruction, the user prompt, and the response to a judge model that returns a structured **categorical verdict** (`followed` / `violated` / `not_applicable`) with one line of reasoning.

**Use when** the claim is semantic: language, precedence, scope, grounding. A lexical check would encode one rule into the harness and misjudge every other instruction.

**The instruction is data.** You write the instruction per case, so the *same* judge serves every adherence case. Bake concrete expected values into the instruction (the expected local date, the expected weekday) so the judge compares against a target instead of ruling on vibes.

**Pinning**: a stronger model than the subject, separately configured, so the judge can catch the subject's mistakes.

**Never numeric output.** A judge emits a categorical verdict, never a score. The *number* a case records comes from consensus, not from asking the model for a number.

### Consensus — parallel judges, majority verdict

A single verdict is a signal; the score is the consensus. Run several judges **in parallel** and take the majority:

- Start with three. If they agree unanimously, you are done — the consensus is 3/3.
- If they disagree, that is exactly the "unsure" case: escalate with two more judges and take the majority of five.
- A tied top verdict is reported as `split` and fails the case — never round a tie into a fake majority.
- Record the **agreement** (`2/3`, `3/3`, `3/5`) in the annotation explanation. That agreement is the number; the 0/1 score is derived from the consensus verdict.
- Keep the majority judge's reasoning in the explanation so a red case stays debuggable.

Two operational notes from running this in anger:

- **Parallel judges multiply the transient-failure surface.** An empty completion or timeout on one of three parallel calls must be retried, not allowed to kill the case. Retry each judge call before its vote counts.
- **Consensus turns judge flakiness into agreement.** The cases that used to flip on a single judge's wording now pass or fail on the majority, so the remaining variance is the agent's, not the judge's.

This repo's implementation: `judgeAdherenceConsensus` / `judgeRubricConsensus` in `src/evals/judges/consensus.ts` (pure aggregation in `consensus-aggregate.ts`, unit-tested).

**If the judge genuinely cannot decide** — the verdicts split with no majority even after escalation — that is not a green light. Record `split` (score 0) and re-read the instruction: an instruction that judges can't agree on is ambiguous, and an ambiguous instruction is a bad case.

## Lane 4 — Composite

A deterministic check pins the *mechanism*; a judge pins the *behaviour*.

**Example**: "limits a last-month query with createdAfter" — hard-assert the search call carried a `createdAfter` within a sensible window (the mechanism), and judge that the answer excludes the old note (the behaviour). The two can fail independently and tell you which half broke.

**When to downgrade**: if the deterministic check proves brittle (the model reaches the same behaviour through another legitimate route), keep it as the annotation and gate on the judge. The hard gate should always be the thing you actually mean to guarantee.

## Lane 5 — Artifact inspection (no LLM)

Parse the thing the agent *produced* and assert properties of it. Not what the agent did, and not what it said — what it made.

**Use when** the deliverable is a structured artifact whose quality is objective: a diagram, a document, a spreadsheet, a schema. A judge asked "is this diagram professional?" is grading vibes; the graph either has an arrow anchored to a shape or it does not.

**Two kinds of check, and they must stay separate.**

- **Parameter-free rules** — true of every artifact of that kind, whatever its subject. Boxes do not overlap. Arrows attach to shapes rather than to coordinates. A child of a container is drawn inside it. Coordinates are on the grid. These can hard-fail because there is nothing to tune.
- **Fixture-declared expectations** — true of *this* artifact because the source material says so. These components appear, these connections exist, this one does not, these boxes carry a brand mark, these sit inside that boundary. The fixture states them next to the prose the agent reads, so the two cannot drift.

**Resist the thresholded middle.** "At most two edge crossings" looks deterministic and is a guess wearing a number — and a guessed threshold on a hard-failing rule is a flaky red suite. If a property needs a number to express, either find the measurement that justifies it or move the property into the fixture, where the artifact's own subject supplies the answer.

**Run the parser through the production boundary first.** Inspect only what production would accept, so a rule can never report on an artifact no user could ever have.

**Unit-test the rules themselves.** A rule that never fires passes everything silently. Each rule needs a minimal artifact that breaks exactly it, asserting the fired set is exactly that rule — `toContain` lets a broken rule hide behind a neighbour.

**Know which draft you are grading.** An artifact eval runs a turn and inspects what came out, so it measures the *first* attempt. If the product gives the agent a way to see its own output and fix it — a render, a compile error, a screenshot — that loop is not being tested unless a case deliberately supplies the feedback and takes another turn. Check whether the first draft is what users actually get before treating the number as the product's quality: here it is, because the diagram render only rides back on the user's next message, so turn one is blind in production too.

This repo's implementation: `src/evals/assertions/diagram/` — `graph.ts` (draw.io XML to absolute geometry), `rules.ts` (the parameter-free invariants), `expectations.ts` (the fixture-declared ones), each with a colocated spec running free in `node-fast`.

## Choosing

| Question | Lane |
|---|---|
| Is a subsystem doing the right thing? | 1 |
| Did the agent use the specific capability? | 2 |
| Did the agent behave correctly in semantics/precedence/scope? | 3 |
| Both the mechanism and the outcome matter | 4 |
| Is the artifact it produced any good? | 5 |

Start at lane 1 and escalate only as far as the claim requires. Lane 5 is not an escalation of
lane 3 but an alternative to it: when the claim is about an artifact rather than a behaviour,
reach for it first and keep the judge for whatever genuinely needs reading.
