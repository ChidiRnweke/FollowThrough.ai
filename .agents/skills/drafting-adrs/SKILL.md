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

Write the decision as a record of what the team chose. Do not write commands to the reader. Prefer
this form:

- We chose X because Y.
- We will keep X while condition A holds.
- If condition B appears, we will reconsider X or take the named next step.

Use “must” only for an invariant created by the decision. Do not use “do not” to make the reader
obey a choice whose reason and limits the ADR should explain.

Keep the decision separate from its implementation. For example, deterministic checks can be the
decision while a specific checker is only a way to implement it.

Before explaining how a feature works, explain why the system has the feature. Ask these questions:

- What risk or need caused the feature to exist?
- Why would removing the feature change the product contract?
- Is the proposed decision only a mechanism that supports a larger decision?

If the draft starts with a table, transaction, controller, queue, or status field, move one level
up. State the user or system decision first. Keep the mechanism as part of the decision only when
it protects that reason.

State the decision's boundary. Name nearby behavior that the ADR does not govern when a reader
could reasonably confuse it with the decision. For example, agent-chosen search over saved work
does not imply that user-attached context or small standing facts must also be fetched by a tool.

## Apply the ADR threshold

Draft the ADR only when all of these statements are true:

- A reasonable engineer could choose a different design.
- The choice has a meaningful cost, constraint, or trade-off.
- A future engineer should know the reason before changing it.
- The rationale is confirmed.

Also check the existing ADRs. Do not draft a second ADR for the same decision only because it
appears in another feature. Extend or reference the broader ADR when its reason and boundary are
the same.

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

## Report known violations

An accepted decision can have a known implementation violation. Do not weaken the decision to make
the current code look compliant. Do not hide the violation.

Name the conflicting code in Evidence. Put the same finding in the suspicious-code ledger when the
backfill process uses one. This tells a future engineer which side is the intended design.

## Make the ADR discoverable

The title is an index entry. A human should understand the choice without opening the ADR.

Test the title as if the reader knows software but has never seen the product. Replace product
terms that need explanation with the plain action and result. The title has no room to define a
term.

- Name the concrete parts affected by the decision.
- Name the chosen shape, boundary, or behavior.
- Include the rejected split or alternative when it makes the choice easier to find.
- Avoid broad titles such as “application contract”, “persistence strategy”, or “agent design”.
- Do not rely on an internal domain noun. Name what that object contains or affects. For example,
  “suggestions” is unclear without “agent-proposed workspace changes”.
- Avoid product nouns such as “workspace” and “review record” when plain words such as “change” and
  “accepted” state the rule.
- Name the actor at the product boundary. Do not attribute an agent decision to its model, or an
  application decision to a library inside it.
- Use the terms that a future engineer will search for.

For example, prefer “Build the web UI, agent, and MCP as one SvelteKit application” to “Keep one
application contract”.

## Improve this skill from review

Treat user critique of an ADR as process evidence. When the lesson applies to other codebases,
update this skill in the same change. Fixing only the current ADR loses the lesson.

Keep the lesson as a short rule with a concrete example. Do not add project-specific rationale to
this skill.

## Check the draft

Before finishing:

1. Check every statement about why. Keep only confirmed rationale.
2. Check that the title is a useful search result and states the concrete decision.
3. Check that the Decision section records the team's choice instead of commanding the reader.
4. Check that the Context explains why the feature exists, not only why its mechanism is safe.
5. Check that the decision states why it applies and when it may be reconsidered.
6. Check that the ADR states what nearby behavior is outside its scope when needed.
7. Check that the consequences include a real cost or limit.
8. Check that the evidence supports the behavior without pretending to prove intent.
9. Check that known violations are visible and tracked outside the ADR.
10. Remove jargon and split long sentences.
11. Run only checks that are proportionate to the files changed.

Return the ADR and identify any unresolved rationale or suspicious code separately.
