# Assessment evidence and validation

Assessment source: `74215c9acf3e0461dfa41b598338fa168a0754b4`, 2026-09-15.
Application code was not changed. Current source was reconciled after the initial `ad17b2bd` review.

Current continuation evidence is recorded in [the continuation register](continuation.md).
The results below belong to the original documentation delivery.

## Checks observed

| Check                          | Result                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency installation        | Frozen lockfile, offline pnpm store; completed with existing ignored dependency build-script notices                                       |
| `pnpm check`                   | Passed; zero errors and warnings                                                                                                           |
| `pnpm test:architecture`       | Passed topology, source, test-quality, Chisel and UI audits                                                                                |
| `pnpm test:unit`               | Passed: 308 files, 3,418 tests, node-fast and browser-focused                                                                              |
| Initial sandboxed unit attempt | Interrupted after local-server `listen EPERM` failures; not counted as domain failures; full permitted rerun passed                        |
| `pnpm docs:check`              | Passed: zero errors/warnings; one existing async-function hint and existing TypeDoc entry-point notices                                    |
| Source inventory generation    | 1,653 files, 168 controller capabilities, 14 remote modules, 9 server routes, 53 model files, 824 model exports, 3,939 literal test titles |

Final formatting/lint, inventory freshness, documentation links and PR checks are recorded at delivery
below. Counts have different definitions: literal test titles are not executed parameterized cases.

## Reproduced patch contradictions

Run from the repository root with Node on PATH:

```sh
node --experimental-strip-types --input-type=module <<'JS'
import { applyNotePatch } from './src/lib/models/notes/note-patch.ts';
console.log(applyNotePatch('old', [{ oldText: 'old', newText: '$&' }]));
console.log(applyNotePatch('A\r\nold\r\nZ', [{ oldText: 'old', newText: 'new' }]));
JS
```

Observed at the snapshot:

1. The first result reports `ok: true`, `appliedEdits: 1`, and unchanged `markdown: 'old'`.
   Requested replacement content is interpreted as JavaScript substitution syntax.
2. The second result returns `markdown: 'A\nnew\nZ'`. Untouched line endings change.

These are diagnostic observations, not new tests pinning defective behavior. Future P01 regressions
must assert the intended literal/preservation contract. The current full unit suite passes despite
these examples. The suite's pass is not used to dismiss a directly demonstrated contradiction.

## Static evidence and limits

The domain reports distinguish inspected implementation mismatches from reproduced failures and open
product decisions. Database, production PWA, full-browser and live model/telemetry journeys were read
where relevant but were not rerun for this documentation change. Local provider-boundary tests use
local HTTP fixtures; no live model evaluation was intentionally launched.

No percentage of unnecessary code, performance improvement or security exploit is claimed. Future
code slices require their own relevant contracts/PWA/format output tests and measured before/after
evidence. There are 411 assessment tasks, not 411 completed reviews.

## Merged-history reconciliation

GitHub reported PR #47 and #48 merged at `1ce7afb0` and `830ca5b0`; PR #50 merged at `48f7f457`.
The task branch was rebased to release commit `74215c9a` before writing the assessment. All three
earlier duplication/omission findings were rechecked and retired where current code repaired them.
The existing composition plan's selection-origin checkbox is historical evidence, not proof that
the source still lacks that capability.

## Delivery

- `pnpm lint` passed.
- Final `pnpm docs:check` passed with zero errors and warnings and one existing hint.
- Source inventory `--check` passed against the recorded snapshot.
- Local links resolve across the eight assessment Markdown documents; all 411 workflow IDs are unique.
- Application changes and per-workflow completion remain outside this assessment delivery.
- Pull-request checks are reported on the PR; they are not represented here as local results.
