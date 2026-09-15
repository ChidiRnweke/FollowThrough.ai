# Repository-wide domain assessment and implementation handoff

## Read this first after a context reset

The user wants to remove accidental complexity across the codebase by recovering a coherent domain
model. Their concern is **semantic ownership**, not simply file placement or function syntax. A name
such as `NotePatchApplicator` only describes mechanics and is not an acceptable domain abstraction.
Identify the product concept, its valid states and guarantees, then put behavior and tests with that
responsibility. Models should tend toward types, schemas and smart constructors. Shared behavior must
remain shared between browser and server. The exact global representation is not yet decided.

The agreed discovery method starts from controllers but traces **both callers and dependencies**.
Inspect what the UI, optimistic stores, agent tools and jobs decide before they invoke a controller.
Follow persistence and returned results back into the client. Consolidate findings by domain concept,
then reconcile every remaining object and path. A controller accepting a finished note can hide the
entire edit/preview/approval workflow upstream.

This delivery persists the full workflow inventory, reproducible source inventory, family-level
assessments and an ordered fix backlog. It does **not** claim every object or test has completed semantic
review. The item ledger makes that remaining work explicit. No application behavior is changed by this
documentation task. A checked implementation item requires its own code, evidence and merged PR.

## Start points and evidence

| Read                                                        | Purpose                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Workflow ledger](domain-assessment/workflows.md)           | 411 stable IDs in the 28 agreed families; assessment checkboxes                          |
| [Coverage register](domain-assessment/coverage.md)          | Every controller contract, request boundary and model namespace; coverage limits         |
| [Source inventory](domain-assessment/source-inventory.json) | 1,653 files, exports, imports, capabilities and test titles; searchable handoff evidence |
| [Content assessment](domain-assessment/content.md)          | Projects, notes, edits, origins, editor, skills, diagrams, uploads and exports; C01–C12  |
| [Agency assessment](domain-assessment/agency.md)            | Tasks, proposals, memory, conversations, run outcomes and authority; A01–A13             |
| [Workspace assessment](domain-assessment/workspace.md)      | Identity, synchronization, search, workbench, PWA and observability; S01–S08             |
| [Safeguards assessment](domain-assessment/safeguards.md)    | What existing checks/tests prove; how to avoid generating more structural scaffolding    |
| [Validation](domain-assessment/validation.md)               | Actual checks, reproductions, limitations and delivery evidence                          |

Code snapshot: `74215c9acf3e0461dfa41b598338fa168a0754b4` (release 0.5.4). The inventory's last
source-changing revision and source digest are separate from this document's commit. Review the diff
from this snapshot before using a finding. Other agents are changing master concurrently; do not reset
their worktrees or assume an unchecked old checklist means its work is absent.

### Existing work to continue, not duplicate

[Domain composition](domain-composition.md) remains the implementation checklist for shared decisions,
proposal effects, execution settlement, indexing and export preparation. This assessment broadens its
coverage and supplies evidence. Where an item overlaps, amend that concern and link its PR here rather
than creating another implementation under another name.

- [PR #47](https://github.com/ChidiRnweke/FollowThrough.ai/pull/47) shares browser/server placement,
  lifecycle and task decisions, and checks incomplete inventories.
- [PR #48](https://github.com/ChidiRnweke/FollowThrough.ai/pull/48) makes skill imports drafts and
  routes document writes through note orchestration; note discard/restore consequences were repaired.
- [PR #50](https://github.com/ChidiRnweke/FollowThrough.ai/pull/50) resolves selection origins once.
- [Sync simplification](workspace-sync-simplification-plan.md) and
  [sync authority](sync-authority-plan.md) record prior measurements and race guarantees. Do not reuse
  their historical line counts as measurements of this assessment's current source.

Do not schedule these completed extractions again. Current findings explicitly retire the original
missing save consequences and duplicated origin/placement implementations.

## Execution rules

1. Work in an owned task worktree on a task branch. This assessment worktree is
   `artifacts/worktrees/domain-assessment`, branch `docs/domain-assessment`; future fixes use their own.
2. Read this file, the relevant assessment, accepted ADRs, and the current source diff first.
3. Choose one coherent unchecked slice below. Do not mass-move files or wrap every helper in a class.
4. Record its semantic definition, invariants, observed entry paths and production-valid states before editing.
5. Fix confirmed behavior with state/output regressions; preserve valuable contracts. For each affected
   test record keep/move/rewrite/consolidate/remove/add and the guarantee behind the decision.
6. Update source, caller paths, types, fakes, relevant docs and architecture guidance together. Remove the
   displaced implementation. Do not leave a compatibility wrapper unless a real consumer requires it.
7. Run appropriate gates, publish one coherent PR and track required checks. Record the PR and evidence.
   Do not mark blocked work complete. Do not mark investigation as a shipped fix.
8. Update the workflow and concept ledgers incrementally so another session can continue without this chat.

Prepend `/home/chidi/.nvm/versions/node/v22.22.0/bin` to PATH for pnpm. Link/copy the local environment
into a fresh worktree without committing secrets. Follow project fakes/one-expect conventions and use
the drafting-prs skill. Visible changes need actual matched before/after evidence.

## Prioritized implementation slices

Order reflects risk and independence, not a requirement to finish all structural design before fixing
clear bugs. Each slice's detailed evidence and test cases are in the referenced finding.

| ID  | Coherent work and concrete result                                                                              | Findings / workflows                           | Verification and dependencies                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P01 | Make targeted replacements literal in every matching branch; preserve untouched source endings                 | C01–C02; W05.01–W05.12                         | `note-patch.spec.ts`, document/tool preview tests; no new architecture required                                  |
| P02 | Return accepted task proposals as accepted, with the persisted effect identity                                 | A02; W09.14, W10.08                            | `controllers/todos/extract-promises.spec.ts`; return-state regression; preserve PR #50 types                     |
| P03 | Start controller boundary instrumentation before public capability execution                                   | S06; W25.05–W25.07                             | Instrumentation ordering, child parentage, sync-helper and throw tests                                           |
| P04 | Make event consumption and persisted resume cursors agree                                                      | A07, A12; W17.06–W17.08, W16.17                | Server unreadable-tail termination; storage numeric cursor and replay-after-failure tests                        |
| P05 | Two independent PRs: vision preparation lifetime; explicit search-intent generation failure                    | A11, A13; W18.11, W19.03, W20.01               | Narrow provider fakes/local transport; blank/missing/cancelled output; no live LLM required                      |
| P06 | Establish one authenticated-session owner and replace existence-only tests                                     | S01; W01.02–W01.06                             | Session creation/expiry/renewal/logout/failed storage; preserve API-token tests                                  |
| P07 | Persist proposal application effects and refuse stale/legacy reversal                                          | A01, A10; W10.08–W10.15, W11.04–W11.06         | Extend composition stage 5; schema migration, transactional stale multi-effect and lineage tests                 |
| P08 | Narrow memory changes by operation/scope and enforce target agreement                                          | A05; W11                                       | Boundary schemas and direct/proposed edit contracts; coordinate with P07                                         |
| P09 | Persist full task edits once; separate PR for atomic task batches with stable request ID and persisted outcome | A03–A04; W09.01–W09.06                         | Later-field/batch failure, lost-response duplicate delivery, responsibility consistency; controller coverage map |
| P10 | Preserve complete requested folder context and explicit exclusions                                             | A06; W16.04–W16.07                             | Complete/partial trees, more than 25 descendants, duplicate-title identity and UI counts                         |
| P11 | Share durable selection-action settlement with chat where guarantees match                                     | A08; W17                                       | Extend composition stage 6; transaction, cancellation/completion and reconstructible-input tests                 |
| P12 | Bind reviewed note/skill changes to an explicit approval contract                                              | C03; W05, W12.10–W12.11                        | Decision D01 first; preview/approval/execution races, repeated delivery, agent/UI parity                         |
| P13 | Consolidate content-change consequences and settle skill identity/lifecycle                                    | C04–C05; W04, W07, W12                         | D02/D03 first for policy; preserve PR #48 regressions, trash/pins/built-in/history cases                         |
| P14 | Recover queued attachment processing with claims and index accepted tail content                               | C06, S05; W14, W20.06                          | Extend composition stage 7; crash/claim/idempotency tests and >50-chunk tail retrieval                           |
| P15 | Separate PRs for template readiness, export preparation, and regeneration assets/atomicity                     | C09–C10; W15                                   | Extend composition stage 8; generated output, missing template and provenance rollback                           |
| P16 | Resolve archive links by explicit identity and report folder failures                                          | C11; W04.17–W04.18                             | Duplicate/qualified links, failed folders, independent successes; preserve partial import policy                 |
| P17 | Make diagram writes and deletion consequences explicit                                                         | C07; W13.14–W13.23                             | Reproduce before changes; D04 for references; draft index failure and stale publication                          |
| P18 | Make clipboard portability/degradation explicit                                                                | C08; W06.12–W06.19                             | Actual browser copy/paste, unavailable media and measured limits; preserve activation timing                     |
| P19 | Separate PRs for Today/attention projections and workbench account ownership                                   | S02, S04; W02.07–W02.08, W23                   | Projection parity; D05 for stored layout; account transitions and navigation races                               |
| P20 | Reconcile effective trust settings with advertised behavior                                                    | A09; W18.12–W18.17                             | D06; each visible policy changes the stated operation, or is explicitly retired                                  |
| P21 | Establish maintenance fairness and correct stale operational contracts                                         | S07–S08; W25–W26                               | Poison-source progress test, feedback failure, current ADR evidence                                              |
| P22 | Review remaining concept ownership and remove obsolete scaffolding                                             | S03 and safeguards; all remaining workflow IDs | D07; complete per-object optionality review and per-test disposition; no blanket syntax rule                     |
| P23 | Define and report cross-note replacement batch outcomes                                                        | C12; W07.06                                    | D09 first; fail second save, inspect all saved notes and returned partial/failure evidence                       |

Implementation status for P01–P23: **not started by this documentation task**. The code findings above
are a plan for reviewable changes, not authorization to infer unanswered product choices.

## Decisions to settle before dependent changes

| ID  | Question                                                                                     | Recommended direction and why                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | What does note-edit approval authorize after the note changes?                               | Reviewed base + prepared result; stale approval needs review, preserving what the user saw                                                     |
| D02 | Is a skill display name distinct from its note title?                                        | One authority if one product fact; otherwise explicit names and independently producible states                                                |
| D03 | Does skill restoration intentionally create history that ordinary note restoration does not? | Preserve current behavior until publication/history intent is confirmed; do not erase a tested distinction by refactor                         |
| D04 | What happens to note references when a diagram is deleted?                                   | Explicit referenced-resource policy; UI counts alone do not decide saved-document semantics                                                    |
| D05 | Does persisted working-set layout belong to an account or a device?                          | Account-specific tabs by default; migration must preserve or explicitly retire existing layouts                                                |
| D06 | Which trust settings actually control proposal acceptance versus tool-call approval?         | Expose only effective choices; preserve explicit reference review unless intentionally superseded                                              |
| D07 | Where should behavior owned by named concepts live?                                          | Runtime-neutral semantic owners for shared rules, models for valid values; decide object/service representation from real concepts, not syntax |
| D08 | When may provider email identity link to an existing account?                                | Confirm provider trust/verified-email/uniqueness policy before altering authentication                                                         |
| D09 | Is cross-note replacement atomic or explicitly partial?                                      | Expose the user-perceived batch outcome; never throw a bare failure that conceals earlier commits                                              |

These are genuine product/architecture decisions. The recommendations are not recorded as accepted.
Independent fixes P01–P06 can proceed while they are discussed. Existing composition policy already
requires stale/legacy reversal refusal; P07 should build on that rather than reopen the same decision.

## How to finish each remaining assessment item

For each workflow ID, append a record containing: entry paths; concepts; current valid states;
invariants from accepted intent; caller-owned decisions; persistence/transaction outcome; returned and
displayed result; tests/dispositions; confirmed gaps; necessary complexity; exact next change or retain
decision. Use source symbols and current test names, not only directory labels.

For each of the 31 model namespaces, review every exported declaration from `source-inventory.json`:
classify entity/value/proposal/state/request/schema/presentation/infrastructure; identify its semantic
owner; apply the optional-pair and boolean-plus-payload producibility tests; resolve redundant copies
and parsing ownership. Re-exports and copied aggregates need actual consumer checks.

Mark a workflow assessed only when this record exists. Record a policy question as pending decision,
not as missing implementation. Keep no-change findings: local proofreading, source-origin validation,
SQL publication order, operation proof/cancellation, editor lifetimes and format-specific export layout
already have meaningful guarantees. They must not disappear merely to lower file counts.

## Verification and completion

For code slices run focused behavior tests, then `pnpm lint`, `pnpm check`, `pnpm test:architecture`,
`pnpm test:unit`, and `pnpm docs:check`. Storage/transaction changes also require `pnpm test:contracts`;
offline/editor changes require relevant browser and production PWA tests. Reproduce visible changes and
capture evidence before editing. Tests using local HTTP servers/browser processes need appropriate sandbox
permissions; do not mistake listen errors for domain failures.

The global work is complete when every entry point and domain declaration has a disposition; every
workflow has a reviewed concept/guarantee/test mapping; every confirmed defect is fixed or explicitly
deferred by the user; displaced implementations are removed; relevant gates pass; and the remaining
docs describe the final model. A zero unclassified-path count or a passing architecture suite alone
does not meet that standard.

## Resume prompt

> Read `docs/plans/domain-assessment-plan.md` and its linked assessment/validation files. Compare the
> current source with snapshot `74215c9a` and retire findings already fixed by merged work. Continue
> the first unblocked implementation slice in its own worktree, updating workflow and test dispositions
> as you go. Preserve semantic ownership and invariants; do not mechanically convert functions to classes.
> Keep unresolved product decisions explicit and continue independent work while they are pending.
