---
name: drafting-adrs
description: Draft or revise one architecture decision record from confirmed rationale and repository evidence. Use when the user asks to write an ADR. Do not use to discover or backfill a list of ADR candidates.
---

# Drafting ADRs

Write one ADR at a time. Explain why the decision exists. Do not restate the code structure.

## Establish the decision

Read the relevant code, tests, documents, and history. Use them to learn what the system does and
which constraints it enforces.

Do not infer why the team chose the design from the code alone. Ask the user when the reason is not
explicit. Treat these sources differently:

- Repository evidence confirms behavior and constraints.
- The user or a recorded decision confirms rationale and trade-offs.
- An inference is not confirmed rationale.

Remove every unsupported inference before writing. Do not invent rejected alternatives, motives,
or reconsideration rules.

Do not turn a bug, missing feature, temporary workaround, or unexplained limit into an ADR. Report
it separately when it may need cleanup.

Keep the decision separate from its implementation. For example, deterministic checks can be the
decision while a specific checker is only a way to implement it.

## Apply the ADR threshold

Draft the ADR only when all of these statements are true:

- A reasonable engineer could choose a different design.
- The choice has a meaningful cost, constraint, or trade-off.
- A future engineer should know the reason before changing it.
- The rationale is confirmed.

If any statement is false, stop and explain why the item is not ready for an ADR.

## Use this structure

```markdown
---
title: "ADR NNNN: <decision title>"
description: <one plain sentence>
---

# ADR NNNN: <decision title>

## Status

<Proposed, Accepted, Deprecated, or Superseded.>

## Context

<State the problem and the confirmed constraints.>

## Decision

<State the decision. Name implementation details only when they clarify the decision.>

## Consequences

<State the confirmed benefits, costs, and limits.>

## Evidence

<List the code, tests, documents, or history that show the decision in use.>
```

Use the repository's existing ADR location and numbering. If none exists, use
`docs/decisions/NNNN-<short-title>.md` unless the user chooses another location.

## Write in Simplified Technical English

- Use short sentences.
- Put one idea in each sentence.
- Use active voice.
- Use common words.
- Use the same term for the same thing.
- Define a required technical term on first use.
- Prefer concrete verbs to abstract nouns.
- Remove filler, praise, metaphors, and sales language.
- Do not use a long word when a short word has the same meaning.

Keep the ADR as short as the decision allows. Add a section only when the user requests it or the
decision cannot be understood without it.

## Check the draft

Before finishing:

1. Check every statement about why. Keep only confirmed rationale.
2. Check that the title states the decision, not a tool name.
3. Check that the consequences include a real cost or limit.
4. Check that the evidence supports the behavior without pretending to prove intent.
5. Remove jargon and split long sentences.
6. Run the repository's documentation checks when available.

Return the ADR and identify any unresolved rationale or suspicious code separately.
