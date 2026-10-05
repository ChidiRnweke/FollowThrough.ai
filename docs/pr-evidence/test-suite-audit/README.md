# Test suite audit

This audit checks whether tests fail when the behavior they claim to protect is broken.
It applies the QA guidance merged in [PR #298](https://github.com/chidirnweke/FollowThrough.ai/pull/298).
All locations in the review records refer to base commit
`6adceb20f0a671ff62d0d3620878dcbadf95b435`, before the test changes.

## Scope and method

Three concurrent `gpt-6-luna` reviewers covered all 659 tracked test files. Each reviewer
first submitted a useful test and a weak test for calibration. The coordinating reviewer
checked these examples, corrected the review criteria, and approved the full audit.
Reviewers examined test setup, assertions, production behavior, and neighboring coverage.
The coordinator reviewed findings and selected evidence, rather than rereading the full suite.

The inventory reconciles 5,038 source declarations, including 117 parameterized declarations,
12 generated cache/outbox contract cases, and 221 generated eval cases. The eval wrapper has
no source test declarations. All 5,271 review records have a disposition; none remain pending.
These counts describe review units, not executed test cases. Parameter expansion and shared
contract registration make runner counts different.

Some initial recommendations were based on assertion excerpts without full fixture review.
Those records were reopened. The reviewers then read the affected source and reconciled the
final ledgers. One reviewer's lost per-test explanations were recovered from retained assertion
and finding records. Those explanations are not the original review notes. The full-source
review and file coverage were subsequently confirmed. The ledger records the final auditor
recommendations; the accepted findings and coordinating review govern the implemented changes.

While implementation was in progress, PR #300 added table-spacing tests and replaced an old
automatic-spacing case. A Luna reviewer audited all six new declarations and the removed case
at `13aa14e36a194b7246053680b5c826bfe9904189`. No further gaps were found. The integration branch
includes that change and release 2.0.9. The original inventory remains pinned to its audit base.

## Changes selected

The accepted changes focus on observable results:

- Read back exact retained revisions, restored documents, downloaded resources, sync receipts,
  and account-isolated records. Counts and markers alone can accept lost or wrong data.
- Check visible editor text, comparison panes, selected ranges, clipboard content, and diagram
  payloads. An element's existence or an empty result can satisfy weaker checks.
- Use distinct, valid fixtures when testing edits, restoration, and attachments. Identical
  initial and expected content can let a no-op pass.
- Exercise public service behavior in place of constructor/import smoke checks. Remove checks
  already implied by stronger neighboring tests and a scenario production cannot produce.
- Make the two eval checks reject unchanged note content and absent suggestions.
- Expose the empty suggestion corpus as missing coverage instead of a passing empty loop.

The audit imposed no removal quota. It retained focused tests when neighboring tests protect
other parts of the same workflow. It rejected recommendations based only on assertion count,
internal call order, or implementation details. The test-quality checker remains in force.

## Limits and follow-up

This is a static semantic review with selected executable counterexamples, not exhaustive
mutation testing or proof that every retained test detects every relevant defect. No live
model evals were run. The 221 eval definitions were reviewed as code.

`tests/corpus/suggestion-payloads.json` is empty. Real producer output is still needed to
exercise that corpus. Schema-authored synthetic payloads would not fill this coverage gap.

Several app E2E scenarios depend on pre-existing development notes. Auth setup creates a user
and session, not a representative workspace. Conditional skips therefore leave gaps on a
fresh database. A separate task should create isolated, valid workspace fixtures for these
scenarios. This change does not redesign that setup or claim fresh-database E2E coverage.

## Baseline validation

At the audit base, `pnpm lint`, `pnpm check`, `pnpm test:architecture`, and `pnpm docs:check`
passed. The docs check reported one hint and no errors or warnings. `pnpm test:unit` passed
4,441 tests in 494 files. `pnpm test:browser:full` passed 639 tests in 81 files.
`pnpm test:contracts` passed 508 tests in 101 files against local PostgreSQL containers.
These results establish that the identified gaps existed in a passing suite.

## Executable counterexamples

Workers temporarily introduced these defects, ran the affected revised tests, observed failure,
and restored the source before the final checks. These are selected mutation checks, not a
whole-suite mutation score. The original tests were not rerun for every mutation.

| Temporary defect                                                 | Result of revised check                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Make the indexing content hash constant across edits             | Rejects reuse of the previous embedding for changed content |
| Restore the current document instead of the selected revision    | Rejects the wrong rich-text document                        |
| Clear a pending reveal when another note consumes it             | Rejects loss of the intended note's reveal request          |
| Render the current document in the selected snapshot pane        | Rejects the wrong previous-version text                     |
| Return without error when a selected replacement note is missing | Rejects a silent no-op in place of the required failure     |
| Send an empty Blob instead of the attachment File                | Rejects the wrong bytes at the upload boundary              |

The predicate blocks extracted from the two revised eval sources were also exercised with
deterministic inputs. This did not run the full eval callbacks or call a model.
The note-content check rejects the unchanged Kubernetes seed and accepts the requested CKA
certification added while retaining existing content. The suggestion-shape check rejects an
unavailable or empty suggestion and accepts a nonempty continuation with valid shape.

The revised split-outline predicate was executed in Chromium against a controlled two-pane DOM.
Both predicates accepted the valid page. Removing one rail or replacing its labels with the
other pane's labels left the old predicate passing; the new predicate returned a failed match
for that pane. This verifies the predicate in a browser, not the full application E2E flow.

The draw.io browser tests use a page-scoped served editor fixture and native iframe messages.
The fixture retains the XML received from the app and derives its preview from that XML.
The tests verify that an unsaved edit survives a theme remount and that each comparison region
shows its own document. They do not patch browser methods or contact the real editor service.

## Final local validation

The combined branch, based on `13aa14e36a194b7246053680b5c826bfe9904189`, passed:

- `pnpm lint`.
- `pnpm check`: no errors or warnings.
- `pnpm test:architecture`: topology, source, test-quality, Chisel, and UI audits.
- `pnpm test:unit`: 495 files; 4,440 passed and 2 explicitly skipped corpus cases.
- `pnpm test:browser:full`: 82 files; 641 passed.
- `pnpm test:contracts`: 101 files; 508 passed against PostgreSQL.
- `pnpm docs:check`: no errors or warnings; one existing hint.
- The source-extracted eval predicate simulation and `git diff --check`.

Unit and full-browser counts overlap and must not be added. Full app E2E and live model evals
were not run. The controlled outline check and eval predicate simulation are narrower evidence,
as described above. Required CI results are recorded on the pull request.
