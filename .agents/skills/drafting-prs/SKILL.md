---
name: drafting-prs
description: Draft or revise pull request titles and bodies as concise, self-contained records of intent, behavior, and verified evidence. Use when preparing or updating a PR, and before implementing a UI change that needs before/after captures.
---

# Drafting PRs

A PR is durable context for humans and agents who arrive later. Explain why the change
was needed and what it does so a reader can understand it without the diff or conversation.

## Gather the context

Read the task request, final changes, relevant checks, and repository contribution rules.
Preserve the original problem and intended outcome in your own words. Do not describe the
prompting process or invent rationale that the request and evidence do not support.

Read relevant merged PRs when they explain earlier intent or behavior. Check that history
against current code and accepted ADRs. An unmerged proposal is not evidence of current behavior.
Include a related PR or ADR link only when it helps explain this change.

Prepare evidence early. For UI fixes, attempt reproduction before editing. For a PR drafted
after implementation, recover the before state from the base revision in an isolated worktree
when feasible. Never reset another agent's worktree.

## Write in Simplified Technical English

Use short sentences, one idea per sentence, active voice, and common words. Use the same term
for the same thing. Define necessary technical terms on first use. Prefer concrete verbs.
Remove filler, praise, metaphors, and sales language. Apply these practical STE conventions;
do not claim formal certification.

Use the repository's Conventional Commit title format. Name the concrete problem or resulting
behavior. Rewrite the title and body around the final implementation when scope changes.

Use exactly these four sections, in this order:

### Why

State the original problem, who or what it affects, and the intended outcome. Preserve the
reason the work was requested. Do not open with a list of edits.

### What changed

Explain previous and resulting behavior with a concrete trigger or example when useful.
Describe the final solution and consequential choices. Include API, compatibility, migration,
or rollout details here only when a reader needs them to understand or use the change.

### Evidence

Give a repeatable scenario and the observed result. For visible frontend changes, include
captioned before/after screenshots. For a new UI, show the starting state and resulting flow.
For nonvisual changes, use a concrete input/output example, relevant result, or compact
before/after comparison. Do not force screenshots onto documentation or backend-only work.

### Validation

Name checks actually run and their results. State material limitations and checks not run
when they leave a relevant gap. Distinguish a seeded UI check from full end-to-end verification.
Do not report pending CI as passed. Update this section when the final results arrive.

Keep each section as short as the change allows. Remove file inventories, work diaries, raw
logs, abandoned approaches, repeated summaries, template comments, and empty checklist items.
Keep a rejected approach only when it explains a material choice.

## Reproduce and capture UI behavior

Attempt UI reproduction unless the scenario is too intricate and depends on live LLM calls.
First check whether representative stored data can expose the same UI state without a model call.
If reproduction remains impractical, explain the specific limitation and what was verified instead.

In FollowThrough.ai, use the authenticated Playwright setup in `tests/auth.setup.ts` and
`tests/.auth/state.json`. Follow `AGENTS.md` for startup and cookie reuse. Inspect the current
Playwright configuration rather than assuming that starting the dev server also creates a session.

You may inject representative data into a local development/test database to reproduce a state.
Confirm the target is local development/test, use valid production-producible records, and keep
the fixture scoped to the scenario. Record the setup or seed command needed to repeat it.
Remove only data created for the scenario after verification. Do not modify production data.

Capture the actual running application. Use matching data, viewport, theme, and interaction
state for before/after comparisons where possible. Include the affected hover, focus, drag,
error, or loading state when that is the issue. Inspect each capture for the claimed result.
Never substitute a generated mockup or label an after capture as before.

Keep temporary captures under ignored `artifacts/`. Commit only useful evidence images under
`docs/pr-evidence/<task>/`, using descriptive names such as `sidebar-before.png`.
Exclude credentials and private content; use synthetic data where needed.

Embed images in the PR with full commit-pinned raw URLs:
`https://raw.githubusercontent.com/<owner>/<repo>/<full-commit-sha>/docs/pr-evidence/<task>/<file>.png`.
Use the real pushed commit that contains the image. Check each URL after pushing; local paths
and expiring CI artifacts do not provide durable evidence. If an image changes or its commit
is replaced by a rebase, update the URL to the new pushed commit.

Give every image descriptive alt text and a visible caption. The caption names the screen,
state, and observable result, such as "Before — at 1024 px, the open panel covers the Save button."
Record shared reproduction details once. If a before image is unavailable, say why and provide
the verified after state; never fabricate the comparison.

## Publish and review

Use the repository PR template when it matches this structure. When using `gh`, write the exact
body to a temporary file and pass `--body-file` to preserve Markdown and avoid shell expansion.

Follow the task's authorization and repository rules for opening or updating a PR. Drafting
alone does not authorize publishing, merging, or unrelated external actions.

Before publishing, read the body without the diff. Can a new reader explain the original
problem, the resulting behavior, and the evidence? Remove anything that does not help them.
Verify image links and captions, and ensure every validation claim matches an observed result.
