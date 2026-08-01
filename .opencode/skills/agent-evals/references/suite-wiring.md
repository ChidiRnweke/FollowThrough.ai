# Suite wiring

How cases become a dataset you can slice, run, and gate. Backend-agnostic in principle; the shape below is what this repo's Phoenix client expects, but the decisions carry over.

## One suite, many cases

All cases for the app register into **one suite** — never one dataset per archetype. The client syncs a suite by replacing the dataset's current version with exactly the examples the suite declared, so two suites sharing a dataset name clobber each other and the dataset ends up holding only whichever ran last. One suite avoids that; `splits` make the single dataset navigable.

## Archetypes

A named capability with a stable id: `time_awareness`, `memory_adherence`, `parallel_execution`, `tool_calling`. Kept in one place (a `const` object) so the split tags and the annotation names cannot drift apart. They are the slice and the gate at once: filtering the suite by `time_awareness` selects exactly the annotation you gate on.

## Splits

Every case carries `splits: [archetype, ...tags]`. Tags are things like `negative`, `regression`, `retrieval`. The archetype is always first and is mirrored into metadata, because some dataset servers persist metadata but not splits — mirror it so the dataset stays sliceable either way.

## Case shape

A case is data plus a runner:

```ts
{
  id: 'stable-id',                       // upsert key across runs
  name: 'human readable, the test name',
  splits: ['time_awareness', 'negative'],
  input: { prompt: '...' },              // recorded as the dataset example input
  expected: { ... },                     // recorded as the reference output
  metadata: { observedAt, note },        // regression provenance
  run(lab) { /* seed, drive one turn, log output, log annotation, assert */ }
}
```

The `id` is what makes the dataset *accumulate*: the same id upserts its example across runs, so historical comparisons stay aligned.

## Registration and ordering

Register everything into the one suite. Order cases by cost so a broken catalog or subsystem surfaces in seconds rather than after the full suite:

- cheapest first (subsystem / deterministic lanes),
- then single-turn agent cases,
- then vague multi-intent and multi-turn cases.

## Running filtered

Filter by test name — the split names are also the annotation names, so `-t "time_awareness"` and the dataset filter select the same work. A filtered run produces no samples for the other archetypes, so:

- gates must not run for archetypes that produced no samples (a filtered run would report a wall of spurious failures that buries the one result the developer asked for);
- gates engage in CI or when explicitly enabled.

## Gating

Acceptance criteria are **pass rates over repetitions**, not "one sample passed". One run is a signal; a gate is a trend. `passRate(archetype, minRate)` counts annotations with score 1 and compares against the threshold. Newly-discovered variance should be gated at a rate below 1 rather than the case deleted — the red-to-green history is the point of a canary.

## Dry-run when no backend is configured

If no tracking endpoint is configured, the suite runs locally without uploading — the assertions still hold, the accumulation does not. That keeps a developer's exploratory run working offline while CI still records.

## The model under test and the judge

- The **model under test** comes from an env override that defaults to the deployed configuration, so a bare run measures what production would use, and a sweep is the same suite under a different value.
- The **judge** is pinned separately and to a stronger model. Changing it changes every historical comparison, so it is a deliberate act.
