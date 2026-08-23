---
name: backfilling-adrs
description: Recover enforced invariants and the reasons behind them in an existing codebase. Use for architecture archaeology or retroactive ADR discovery. Routes meaningful confirmed decisions to an ADR candidate ledger and questionable behavior to a suspicious-code ledger. Does not batch-draft ADRs.
---

# Backfilling ADRs

Perform architecture archaeology across the whole codebase.

Recover the rules the system protects. Find the reasons for those rules. Separate deliberate
design from accidental behavior.

## Produce two outputs

Maintain two separate ledgers:

1. **ADR candidate ledger:** Invariants that come from a confirmed choice with a real trade-off.
2. **Suspicious-code ledger:** Findings that are bugs, incomplete features, stale explanations,
   hidden failures, or behavior with no confirmed reason.

Finding invariants is the discovery method. Do not create a third invariant catalog.

An invariant does not become an ADR only because tests enforce it. An ADR explains why a costly or
non-obvious choice must survive a change. Ignore obvious local rules that need neither an ADR nor
cleanup.

Never turn suspicious behavior into an ADR to make the current code look intentional.

## Cover the whole system

Start with every controller and every public controller method. Controllers show what the product
does. Build a coverage table so no capability disappears because another subsystem is more
interesting.

Then trace each useful behavior through:

- Services for domain rules, special cases, and orchestration costs.
- Client code for local authority, sync, caching, and interaction constraints.
- Repository contracts and schemas for durable invariants.
- Transactions for state that must agree.
- Tests for behavior a future change must preserve.
- Dependency audits for enforced ownership and layer boundaries.
- Product and subsystem documents for earlier explanations.
- Version history for incidents, rejected approaches, and the change that introduced a rule.
- Deployment files for operational constraints that application code cannot explain.

Give the UI, application core, persistence, background work, deployment, and agent equal attention.
Do not focus on the agent only because its choices are easy to name.

## Find invariants before naming ADRs

Record a behavior as an invariant when the code or tests show that the system depends on it.
Examples include:

- State that must commit together.
- Data that is authoritative and data that is derived.
- Scope and ownership boundaries.
- Retry, idempotency, and conflict rules.
- Visibility, archive, restore, and deletion rules.
- Ordering and precedence rules.
- Failure and partial-result contracts.
- Security boundaries and actions a caller cannot perform.
- Context, storage, latency, and resource limits.
- Cross-process recovery rules.

For each non-obvious invariant, determine its scope, evidence, failure class, rationale, and
trade-off. Then route it to the ADR candidate ledger or the suspicious-code ledger. Do not keep a
third list.

Do not infer intent from enforcement. Code proves the rule exists. It does not prove why it exists.

## Use uncertainty as a lead

Investigate code that has:

- An explanatory comment.
- An exception or special case.
- A fallback, default, retry, cap, or compatibility path.
- A transaction boundary.
- A race or crash-recovery rule.
- A result that is partial, delayed, hidden, or irreversible.
- Behavior that looks like a bug but has a test.
- A dependency rule that makes an easier implementation illegal.

Treat doubt as evidence that an interview may be useful. State the observed behavior first. Ask why
the system accepts its cost. Name the real alternative that a reasonable engineer could choose.

Do not ask the user for facts the repository can answer.

## Recover rationale without inventing it

Use sources for different purposes:

- Code, tests, schemas, and audits prove current behavior.
- History can prove the incident or limitation that caused a change.
- Existing decision records can prove earlier rationale.
- The user can confirm product and operational intent that the repository cannot contain.

Mark an explanation as an inference until the user or a decision record confirms it. Remove
unsupported explanations from a ready ADR candidate.

Blogs, issue titles, and design notes are search leads. They are not proof that the current system
still makes the same decision.

## Apply the ADR threshold

Promote an invariant to the ready ADR queue only when all statements are true:

- A reasonable engineer could choose a different design.
- The choice has a real cost, constraint, or trade-off.
- A future engineer should know the reason before changing it.
- The rationale is confirmed.

Use these readiness states:

- `ready`: All four checks pass.
- `needs interview`: Behavior is proven, but its reason or trade-off is not.
- `unstable`: The feature or design is still changing.
- `suspicious`: The behavior may be wrong, obsolete, or misleading.

## Audit every fallback and exception

Classify each fallback as:

- **Explicit mode:** A user or operator selected it.
- **Visible partial result:** The result states what it omitted or weakened.
- **Hidden failure:** The system hides a failure or silently returns a weaker result.

Put hidden failures in the suspicious ledger unless confirmed intent says otherwise.

Also inspect best-effort work. Decide whether it is part of the requested outcome or secondary
bookkeeping. Record failures that are swallowed without user or operator evidence.

## Keep the ledgers useful

For each ADR candidate, record:

- Decision.
- Confirmed reason.
- Cost or limit.
- Evidence.
- Readiness.

When an ADR gets a clearer final title, update the candidate heading to match it. The ledger is also
an index and must remain searchable.

Before drafting a candidate, compare its reason and boundary with existing ADRs. If an existing ADR
already governs the same decision, mark the candidate as covered there. Do not create a narrower
ADR only because the audit found the invariant through another feature.

When current code conflicts with a confirmed decision, keep both records:

- The ADR candidate records the intended decision.
- The suspicious-code ledger records the conflicting implementation.

Do not rewrite the decision around the violation.

For each suspicious finding, record:

- Observed behavior.
- Why it is suspicious.
- Evidence.
- Confirmed expected behavior, when known.
- Cleanup status.

Use clear titles that a human would search for. A title must name the actual choice. Avoid vague
labels such as “application contract” when the decision is “one SvelteKit app instead of a web app
and Python agent service.”

Write short sentences. Use one term for one thing. Do not use sales language.

## Improve this skill from the audit

This skill is a living result of the backfill process. When user feedback reveals a general lesson
about discovery, interviews, classification, or evidence, update this skill during the same task.
Do not leave the lesson only in the current ledger or conversation.

Add only codebase-agnostic lessons. Keep product decisions in the ADR candidate ledger.

## Draft one ADR at a time

Do not convert the ledger into a batch of ADR files.

When the user selects one ready candidate:

1. Re-read the evidence.
2. Check whether an existing ADR already covers the same reason and decision.
3. Confirm that the implementation has not changed.
4. Use the dedicated ADR drafting process.
5. Draft one ADR, or mark the candidate as covered by the existing ADR.
6. Keep cleanup findings outside the ADR.
7. Add the ADR number to the candidate ledger.

Do not mark other candidates as accepted.
