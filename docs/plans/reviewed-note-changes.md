# Reviewed note changes: implementation record

## Intent and boundaries

This is the note-change pilot from [PR #57](https://github.com/ChidiRnweke/FollowThrough.ai/pull/57).
The assessment snapshot was `74215c9a`; implementation starts from `f16207a5`.
Integration uses `1cb8f213`, retaining the later run-settlement, attachment processing,
export preparation, and shared note-view changes.

The accepted direction is semantic ownership, selected concept by concept. Approval of a
note-body tool authorizes the reviewed base and prepared result. A changed base requires a
new call and review. Models retain values, schemas, and pure decisions; controllers own
cross-feature transactions. ADR 0003 records the approval policy.

`save_note` and `edit_note` keep their existing argument shapes. They prepare one value,
carry it through durable approval and transcript replay, and apply the saved result using
the note revision. Existing skill documents reached through these tools remain supported;
`save_skill` and `edit_skill` and their identity/history policies are outside this pilot.
No new database table or generic execution framework is introduced.

## Workflow dispositions

PR #57 merged while this pilot was being implemented. This record supplies the completed
pilot's evidence without claiming the global assessment is complete.

| Assessment items                                        | Disposition and guarantee                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C01–C02 / P01; W05.01, W05.06, W05.11                   | Literal replacements across matching modes; comparison-only line-ending normalization; untouched source and supplied replacement bytes survive. |
| C03 / note portion of P12; W05.02–W05.05, W05.08–W05.10 | One prepared change supplies preflight, review, checkpoint resume and conditional save.                                                         |
| W05.07                                                  | Invalid preparation returns an explicit tool failure; stale or legacy approvals request a fresh call.                                           |
| W05.12                                                  | Keep the editor-schema converter and its existing rich-node tests; inject it at the notes boundary.                                             |
| Skill portion of C03, C04–C05                           | Deferred to their existing assessment slices; no new skill identity/history decision or body-consequence consolidation.                         |

## Test dispositions

| Concern                                     | Disposition                                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch matching and atomic rejection         | Keep existing guarantees; rewrite the global normalization expectation as matching tolerance; add literal-token and mixed-ending cases.                   |
| Tool note-content and rich-node tests       | Keep guarantees; replace obsolete get/save stubs with real notes orchestration over the shared in-memory repositories.                                    |
| Browser-computed patch previews             | Remove the displaced implementation and its mechanical target lookup tests; replace expectations with persisted base/result rendering and legacy refusal. |
| Notes preparation and application           | Add state/output tests for stale reviews, account ownership, archive/deletion, unchanged retries and rollback.                                            |
| Checkpoints, transcript and browser readers | Add review persistence/replay and explicit corrupt-review tests.                                                                                          |
| Database contracts                          | Add real PostgreSQL conditional-write, rollback, retry and approval-payload round-trip coverage.                                                          |

## Evidence setup

The authenticated Playwright setup was attempted first. Local Postgres on port 5432 was
not running. Screenshot evidence uses the real approval card and `layout.css` through the
repository's component-fixture server. It supplies a saved review for “Release briefing”:
“Launch on Monday.” becomes “Launch on Tuesday.” No workspace note is downloaded.

Both images use a 1000 × 800 light-theme viewport and wait for the editor text to render.
The before image runs the original approval card and preview code from `f16207a5`; the
after image runs this change. Temporary fixtures are removed before commit. These are
component captures, not a live model or authenticated end-to-end approval journey.

## Validation

Local lint, type checking, architecture audits, and documentation checking passed.
The documentation checker reports its existing hint and TypeDoc entry-point notices.
The unit suite passed 314 files and 3,462 tests; the added corrupt-review regression
also passed in its 13-test tool suite. All 64 browser files and 540 tests passed.

The full database suite passed 210 tests and exposed a fixture that skipped the required
running state. After correcting that fixture, all 28 agent repository contracts passed.
The notes contracts cover conditional writes, unchanged retries, and rollback on PostgreSQL.

Production PWA and required CI results are recorded in the implementation PR.
