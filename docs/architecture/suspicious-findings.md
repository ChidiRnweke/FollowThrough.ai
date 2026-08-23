# Suspicious findings from ADR backfill

This is a cleanup queue. These items are not architecture decisions.

Treat each item as a lead. Reproduce it before changing code. Preserve user work and current
worktree changes.

## Data integrity and lifecycle

- **Ambiguous anchor repair can keep stale offsets.** When the quoted text has several matches,
  repair does not have a safe target.
- **Folder archive does not cascade.** The current project or note folder lifecycle can leave
  children active when the intended parent lifecycle says otherwise.
- **Cross-note replacement may partly commit.** A later failure can leave earlier note changes
  stored.
- **Diagram deletion leaves broken note references.** The intended behavior is to repair or remove
  references as part of deletion.
- **Todo Trash is missing.** Todos are soft-deleted for future restore and audit, but users cannot
  list or restore them.
- **No-result pipelines leave unused records.** Reference search commits an anchor when nothing is
  relevant. Relationship search can commit provenance when it creates no suggestions.
- **Trust-policy behavior is inconsistent.** Some pipelines bypass the evaluator or use settings
  that do not affect the result.

## Attachments, indexing, and exports

- **Attachment indexing stops after 50 chunks.** It indexes the head of a long file and silently
  makes the rest unavailable to retrieval.
- **Attachment processing can stay queued after a crash.** Startup recovery handles `processing`
  rows but may miss a row committed as `queued` before in-process work starts.
- **Expired upload cleanup can orphan bytes.** Some storage deletion failures are caught before the
  database pointer is removed.
- **Some exports omit images without a clear user message.** Partial output must state what it
  omitted.
- **Attachment fallback comments are stale.** They describe behavior that no longer matches the
  active pipeline.

## Hidden fallback and failure

- **Model-catalog failure becomes an empty list.** The app shell uses `.catch(() => [])`, so a
  provider failure looks like no models exist.
- **API-token bookkeeping fails silently.** Token verification starts `touchLastUsed` without
  awaiting it and swallows every error. The confirmed intent is to fail the request.
- **Feedback documentation is wrong.** It says feedback is fire-and-forget. A failed feedback
  submission must be visible and retryable.
- **Promise extraction has a rule-based fallback.** Missing model configuration can silently
  replace model extraction with weaker behavior.
- **Relationship classification has a rule-based fallback.** Missing model configuration can
  silently replace classification with weaker behavior.
- **Export degradation can be silent.** Best-effort output is valid only when the UI reports the
  omitted parts.

## Stale or obsolete agent behavior

- **Conversation condensation remains in retrieval code and docs.** Workspace retrieval should use
  an agent-chosen query.
- **Old `use_tool` helpers and documentation remain.** The current tool search exposes the found
  tool with its real schema.
- **Old inline-image repair paths remain.** The current product does not need this compatibility
  layer.
- **Old anchored-edit fallback comments remain.** They do not match the current failure rule.
- **Inline suggestions are incomplete.** Do not record their current behavior as intended design.
- **Accepted context can be truncated.** Limits can silently discard context the user supplied.

## Skills and Trash

- **Skills are hidden from Trash.** The confirmed model is that this is wrong, not a special skill
  lifecycle.
- **Skill metadata may duplicate note data.** Confirm the replacement before removing it.
- **Built-in skill comments are stale.** Publication and released-content identity have changed.

## Accepted behavior that looks suspicious

- **A vault import can leave a blank note shell.** This is an accepted consequence of partial
  import. Do not change it to an all-or-nothing import without a new decision.
- **A note restored from a missing or archived folder moves to the project root.** This keeps the
  restored note visible. Keep it as a tested local rule, not a separate ADR.
