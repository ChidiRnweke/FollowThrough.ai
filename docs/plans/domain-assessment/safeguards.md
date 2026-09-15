# What the checks prove, and what they do not

Snapshot: `74215c9a`. Workflow family 27 and cross-cutting assessment rules.

## Observed baseline

The architecture suite passed on the assessment snapshot:

- Topology: 1,578 source files.
- Source restrictions: zero violations across 1,227 files.
- Test-quality audit: 395 files and 3,736 recognized declarations; zero migration exceptions.
- Chisel: 1,662 files; zero violations.
- UI audit: zero violations across 1,230 files.

These successes coexist with the reproduced literal-replacement and line-ending defects and the
source-confirmed parser/consumer and lifecycle mismatches. Passing checks does not establish that the
domain is coherent. It also does not prove that the checks caused the defects.

The discovery inventory contains 1,653 tracked TS/JS/MJS/Svelte files under `src`, `tests`, and
`scripts`; 53 non-spec model files in 31 namespaces export 824 declarations. It finds 3,939 literal
test titles, **not executed cases**. This differs from the audit's AST matching and the runner's
parameterized case expansion. Never use these numbers interchangeably.

The inventory's 1,250 non-test-file paths total 130,620 lines, and its 403 test-file paths total
52,936 lines. These are rough footprint categories including comments, blank lines, vendor UI,
testing helpers, evaluation code and scripts. They are not production-only counts or a time-series
growth measurement. No percentage of accidental complexity can be inferred from them.

## Structural incentives and gaps

`scripts/audit-topology.ts` enforces capability placement, deep-import restrictions, editor product
boundaries, application construction restrictions, nonempty test globs and mapper/parser-name coverage.
It cannot establish that a capability owns a semantic responsibility or a parser is tested with the
right producer behavior. Its corpus-name check should be accompanied by the existing real corpus tests.

`scripts/audit-tests.ts` counts `expect` calls and rejects named mocking APIs, certain dependency casts,
interaction assertions and untyped fake classes. Some restrictions apply only under controllers/services
or only to specific names. A recording closure outside those patterns can still be an implementation test.
One `expect` can express a good invariant or a meaningless class-existence check.

Eleven inspected specs contain the exact title “is available as a domain service”:

- Agent conversation buffer and search-query summary.
- Agent base context, events, ledger and tool retrieval.
- Attachment image description and diagram review.
- Identity sessions and sign-in.
- Expiring suggestion listing.

Some files also contain good behavioral tests. Remove the existence assertion when reviewing that
concern; do not delete the entire spec. Replace only real missing contracts, such as expiry or unusable
provider results, rather than generating another test per method.

The controller instrumentation test promising logging before body execution never records body entry.
The patch tests independently promise byte preservation and whole-document normalization. The folder
mention test preserves a cap rather than verifying the user's complete selection. These are concrete
cases where names, fixtures and expectations need independent domain reasoning.

## Test disposition protocol

Every reviewed test receives one disposition in its concept's implementation record:

| Disposition | Required reason                                                                            |
| ----------- | ------------------------------------------------------------------------------------------ |
| Keep        | An independently stated guarantee and the real failure it catches                          |
| Move        | Same guarantee, new semantic owner; no duplicated suite left behind                        |
| Rewrite     | Useful intent, but fixture/assertion currently proves mechanics or a weaker claim          |
| Consolidate | Another test proves the same guarantee on the same boundary and meaningful inputs          |
| Remove      | Existence-only, obsolete behavior, impossible fixture or unjustified implementation detail |
| Add         | A confirmed guarantee has no direct behavioral evidence                                    |

A repeated scenario with different assertions can legitimately express distinct guarantees under the
one-assertion rule. A fake with a stateful repository contract is useful. A fake that stores only the last
argument is often a recording mock despite its name. Keep integration tests that prove rollback, ownership,
ordering and actual output formats. Preserve corpus inputs from real producers.

## Evaluations are part of the model

`src/evals` separates case inputs, intent/effect/stopping assertions, model judging, caches and result
reporting. Existing ADR 0023 makes saved effects and actions primary evidence. The fresh-context executor
must preserve this distinction: a plausible final response does not prove a task was saved, nor does a
tool count prove intent was fulfilled.

Review each evaluator for its accepted concept and evidence source. Pin the input/settings/provider
identity used by cached results; distinguish replayed evidence from live generation. Test judges and
aggregation with deterministic cases. Do not make live model calls merely to substantiate this static
assessment. Exact per-evaluation-case disposition remains a ledger task, not a completed claim.

## Governing instructions also need reconciliation

Accepted ADRs 0006/0007 explain capability grouping and controller orchestration. ADR 0041 explicitly
chooses shared pure functions, and ADR 0037 places schemas at the boundary. These are current accepted
constraints, not mistakes proven by function syntax.

The user's desired direction is semantic ownership: name product concepts, state invariants, and let
tests mirror them. Before a global representation change, update the corresponding ADR/guidance and
skills together. Do not impose a top-level-function ban or require an interface/class per function.
Model construction can remain types/schemas/smart constructors. Behavior needs a semantic owner and a
runtime-neutral home when shared. The representation decision is still open; no repository-wide move
is authorized merely by this assessment's candidate names.

The installed SvelteKit skill also describes generic BFF conventions that differ from this repository's
remote-function/outbox architecture. Follow current project instructions and accepted decisions where
they conflict; keep all three project skill copies synchronized when those instructions are revised.

## Review completion criteria

A concept is complete only when its definition, valid states, lifecycle, owned decisions, dependency
facts, all entry paths and test dispositions are recorded. Each optional-field pair must have either a
real independently producible state or a containing optional/discriminated union. A workflow is complete
only when upstream decisions, persistence, returned outcomes and downstream client handling agree.

Track net application/test/doc change per coherent refactor, with the exact counted paths. Count removed
independent implementations and invalid states, not just lines. Retain necessary runtime boundaries.
Failing a checker is not a reason to split a responsibility into unrelated abstractions or silence a rule.
