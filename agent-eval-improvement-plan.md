# Agent Eval Improvement Campaign

## Campaign contract

- Subject model: `openai/gpt-5.6-luna`
- Acceptance sample count: one per case
- Branch and commit policy: work and commit directly on `master`; never push implicitly
- Result ledger: `/tmp/followthrough-eval-results.json` unless `EVAL_RESULTS_PATH` overrides it
- A section is complete only when every selected case passes once.

## Calibration

- [x] Confirm the initial branch is `master` and the worktree is clean.
- [x] Record the initial inventory: 21 sections, 175 cases.
- [x] Add exact `EVAL_SECTION` and `EVAL_CASE` selectors with unknown/empty rejection.
- [x] Preserve the four-case smoke profile.
- [x] Add `EVAL_RUN_ID` and complete per-result provenance.
- [x] Wire deterministic strict mode to the documented `EVAL_STRICT_CACHE` variable.
- [x] Refresh four missing deterministic tool embeddings and verify all 64 catalog entries.
- [x] Run 12 selector, provenance, and strict-cache tests; run architecture and Svelte checks.
- [x] Commit calibration to `master`.

Calibration evidence (2026-08-24): focused Vitest `12/12`; topology `1413` files; source audit
`1139` files at zero violations; quality audit `299` files / `2889` declarations; Chisel `1467`
files; `svelte-check` zero errors and warnings.

## Section ledger

|   # | Section                  | Cases | Baseline run | Result  | Diagnosis / evidence | Fix and verification | Commit |
| --: | ------------------------ | ----: | ------------ | ------- | -------------------- | -------------------- | ------ |
|   1 | `tool-retrieval`         |    47 | —            | pending | —                    | —                    | —      |
|   2 | `retrieval`              |     3 | —            | pending | —                    | —                    | —      |
|   3 | `tool-calling`           |     3 | —            | pending | —                    | —                    | —      |
|   4 | `stopping`               |     3 | —            | pending | —                    | —                    | —      |
|   5 | `tool-invocation`        |    18 | —            | pending | —                    | —                    | —      |
|   6 | `context-awareness`      |     5 | —            | pending | —                    | —                    | —      |
|   7 | `grounding`              |     4 | —            | pending | —                    | —                    | —      |
|   8 | `memory`                 |     8 | —            | pending | —                    | —                    | —      |
|   9 | `skill-adherence`        |     9 | —            | pending | —                    | —                    | —      |
|  10 | `selection`              |     3 | —            | pending | —                    | —                    | —      |
|  11 | `multi-step`             |     5 | —            | pending | —                    | —                    | —      |
|  12 | `safety`                 |     6 | —            | pending | —                    | —                    | —      |
|  13 | `diagrams`               |     2 | —            | pending | —                    | —                    | —      |
|  14 | `effects`                |    10 | —            | pending | —                    | —                    | —      |
|  15 | `note-editing`           |     4 | —            | pending | —                    | —                    | —      |
|  16 | `correctness`            |     9 | —            | pending | —                    | —                    | —      |
|  17 | `time-awareness`         |     9 | —            | pending | —                    | —                    | —      |
|  18 | `inline-suggestion`      |     2 | —            | pending | —                    | —                    | —      |
|  19 | `intent-interpretation`  |    20 | —            | pending | —                    | —                    | —      |
|  20 | `multi-turn-correctness` |     3 | —            | pending | —                    | —                    | —      |
|  21 | `completion`             |     2 | —            | pending | —                    | —                    | —      |

## Final verification and report

- [ ] Run `pnpm check` and `pnpm lint`.
- [ ] Run relevant unit tests and `pnpm test:architecture`.
- [ ] Verify deterministic cache completeness.
- [ ] Run all 175 cases with `EVAL_GATE=1`, `EVAL_REPETITIONS=1`, and Luna.
- [ ] Confirm no unexplained tracked cache changes.
- [ ] Record before/after results, changes by tuning seam, remaining risks, and final `master` revision.
