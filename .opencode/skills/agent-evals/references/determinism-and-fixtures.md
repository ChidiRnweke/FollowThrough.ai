# Determinism and fixtures

Model evals must be repeatable *as measurements*. These rules keep a case from passing or failing for reasons that have nothing to do with the agent.

## Clock rules

The agent's system prompt is rendered from a server clock at request time. When a case needs "today" or a date window:

- **Compute the expected value from `new Date()` immediately before driving the run**, then bake it into the judge instruction and any argument assertion. Date-granularity means the seconds of drift between "compute expected" and "agent renders clock" are harmless.
- **Never hard-code a date** in a fixture or instruction — it will silently go stale and start failing or, worse, start passing for the wrong reason.
- **Widen argument tolerances to the reasonable interpretation space.** A "last month" window can be "30 days ago" or "start of the previous calendar month" (up to ~31 days). Assert a band (e.g. 20–40 days), not an exact value.
- **The midnight-crossing risk is negligible** at date granularity, but if a case could straddle a boundary in its timezone, prefer timezones far from the UTC date boundary so the two expected dates are almost always different.

## Seeding through the real path

Build the workspace with the **actual controllers**, never raw inserts:

- Memories must land in the entry table *and* the vector index.
- Notes must be chunked and embedded the way production does it — a case seeded by raw insert can pass while `search` is broken.
- Revisions and provenance must exist, because the agent reads the persisted event log, not the in-memory loop.

## Backdating creation times

When a case needs artifacts of different ages, create them normally and then rewrite only the timestamp rows:

- `notes.created_at` / `notes.updated_at`
- the search index's `source_created_at` for those notes (the indexer snapshots it at save time — backdating only the note row makes `list` respect the age but `search` silently ignore it)
- `todos.created_at` / `todos.updated_at` for todo fixtures

Order matters: backdate *after* the controller-path save/index so the chunks exist to rewrite. Verify the indexing is synchronous in your harness before relying on this (if indexing is deferred to a worker, chunks may not exist yet).

## Isolation

- **Fresh user id per run** — repositories are actor-scoped, so cases isolate without truncating. This also stops a repetition from inheriting a memory the agent proposed in an earlier run.
- **Seed inside the case's `run`**, not at suite load, so repetitions cannot share state.
- **Synthetic, committed fixtures** — no real person's details, because fixtures ship to the shared dataset.

## Recording

- Log the **output** (response, model, tool calls, duration) so a red case is debuggable.
- Log the **annotation** (archetype name, 0/1, label, explanation) so the score is attributable. Never rely on a thrown assertion alone — the dataset accumulates annotations, not exceptions.

## When a case is flaky

Triage, in order:

1. **Judge over-strictness** — loosen the instruction (format vs meaning).
2. **Wrong lane** — the model reached the behaviour another way; pivot the assertion.
3. **Real variance** — the agent genuinely varies run to run. This is what pass-rate gating is for: measure it across repetitions and gate at a threshold below 1, rather than deleting the case.
