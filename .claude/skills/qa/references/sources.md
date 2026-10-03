# Sources and coverage

Primary source: Vladimir Khorikov, _Unit Testing: Principles, Practices, and Patterns_,
Manning, 2020. Citations in this skill use printed page numbers, not PDF viewer indexes.

The source contains 11 chapters across four parts. Each chapter was read in full by a separate
reader using only that chapter's text. The synthesis groups practices by testing decision
rather than reproducing the book's order, prose, code, or framework tutorial.

The references are self-contained. Using or copying this skill does not require the original
PDF, an extraction cache, a particular repository, or access to a testing framework used in
the book.

## How to interpret the guidance

- **Book principles:** citations identify the supporting chapter, section, or printed pages.
  Preserve the author's conditions and exceptions; do not turn a heuristic into a universal law.
- **Skill policy:** use typed, hand-written doubles rather than mocking libraries. The book
  supports both library mocks and handwritten spies; it does not establish the tooling ban.
- **Applications of principles:** references label qualifications that apply the rationale to
  situations outside the concrete examples, such as persistence fidelity beyond vendor names.
- **Project rules:** obtain them from the active project's instructions and accepted decisions.
  The skill deliberately contains no repository-specific architecture, commands, or paths.

## Chapter-to-reference coverage

Each chapter's introduction, examples, conclusion, and summary were included in extraction.
The rows below account for its substantive sections. Framework trivia and illustrative history
are listed separately when they provide context rather than a portable testing instruction.

| Chapter and sections                                                  | Decisions captured                                                                                      | Maintained reference                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1: The goal of unit testing; §1.2, pp. 5–8                            | Sustainable change, one-way testability signal, test benefit and maintenance cost                       | [Validation](validation.md), [Testability](testability.md)                                 |
| 1: §1.3.1–§1.3.4, pp. 8–15                                            | Line/branch coverage, unverified outcomes, external paths, percentage targets                           | [Validation](validation.md), [Test design](test-design.md)                                 |
| 1: §1.4.1–§1.4.3, pp. 15–17                                           | Development feedback, important code, value, incremental human evaluation                               | [Validation](validation.md), [Unit testing](unit-testing.md)                               |
| 2: What is a unit test?; §2.1.1–§2.1.2, pp. 21–30                     | London versus classical isolation; test doubles; test independence                                      | [Unit testing](unit-testing.md), [Test doubles](test-doubles.md)                           |
| 2: §2.2.1, pp. 30–34; dependency definitions, pp. 28–29               | Shared/private, mutable/immutable, out-of-process and volatile dependencies                             | [Unit testing](unit-testing.md)                                                            |
| 2: §2.3.1–§2.3.4, pp. 34–37                                           | Behavior units, setup burden, failure cascades, TDD direction and overspecification                     | [Unit testing](unit-testing.md), [Testability](testability.md)                             |
| 2: §2.4–§2.4.1, pp. 37–40                                             | Integration definitions, E2E scope, controlled substitutes and execution cost                           | [Integration testing](integration-testing.md), [End-to-end testing](end-to-end-testing.md) |
| 3: The anatomy of a unit test; §3.1.1–§3.1.4, pp. 42–47               | AAA, single behavior/act, branching, section size and encapsulation                                     | [Test design](test-design.md)                                                              |
| 3: §3.1.5–§3.1.8, pp. 47–49                                           | Multiple related assertions, teardown, SUT identification and section clarity                           | [Test design](test-design.md), [Unit testing](unit-testing.md)                             |
| 3: §3.3.1–§3.3.3, pp. 50–54                                           | Independent fixtures, hidden setup, factories and common-resource exception                             | [Test design](test-design.md)                                                              |
| 3: §3.4.1–§3.4.2, pp. 54–58                                           | Domain facts, readable names and utility-code naming exception                                          | [Test design](test-design.md)                                                              |
| 3: §3.5–§3.6, pp. 58–63                                               | Case clarity, positive/negative grouping, runtime data and optional fluent assertions                   | [Test design](test-design.md)                                                              |
| 4: The four pillars of a good unit test; §4.1.1–§4.1.4, pp. 68–76     | Regression protection, refactoring resistance, client outcomes and compile-error nuance                 | [Validation](validation.md), [Unit testing](unit-testing.md)                               |
| 4: §4.2.1–§4.2.2, pp. 76–79                                           | False positives/negatives, signal/noise and trust over project lifetime                                 | [Validation](validation.md)                                                                |
| 4: §4.3–§4.4.5, pp. 79–86                                             | Fast feedback, reading/operational cost, tradeoffs, trivial/brittle/E2E extremes                        | [Validation](validation.md), [End-to-end testing](end-to-end-testing.md)                   |
| 4: §4.5.1–§4.5.2, pp. 87–90                                           | Pyramid exceptions, black-box assertions and white-box gap investigation                                | [Validation](validation.md), [End-to-end testing](end-to-end-testing.md)                   |
| 5: Mocks and test fragility; §5.1.1–§5.1.5, pp. 93–98                 | Double taxonomy, tool versus role, stub interactions, mixed roles and CQS limits                        | [Test doubles](test-doubles.md)                                                            |
| 5: §5.2.1–§5.2.4, pp. 99–105                                          | Client goals versus public API, leaked operations/state, encapsulation                                  | [Unit testing](unit-testing.md), [Testability](testability.md)                             |
| 5: §5.3.1–§5.3.3, pp. 106–114                                         | Domain/orchestration boundaries, per-layer observability and internal/external effects                  | [Testability](testability.md), [Test doubles](test-doubles.md)                             |
| 5: §5.4.1–§5.4.2, pp. 114–116                                         | Classical/London limits, private databases and observable boundary effects                              | [Integration testing](integration-testing.md), [Test doubles](test-doubles.md)             |
| 6: Styles of unit testing; §6.1.1–§6.2.4, pp. 120–128                 | Output/state/communication styles, combining styles and quality/cost comparison                         | [Unit testing](unit-testing.md), [Test doubles](test-doubles.md)                           |
| 6: §6.3.1–§6.3.3, pp. 128–134                                         | Purity, hidden inputs/outputs, referential transparency, immutability and shell/core                    | [Testability](testability.md)                                                              |
| 6: §6.4.1–§6.4.4, pp. 135–146                                         | Filesystem example, external-visible effects, returned update decisions and explicit errors             | [Testability](testability.md), [Test doubles](test-doubles.md)                             |
| 6: §6.5.1–§6.5.3, pp. 147–149                                         | Conditional lookup, performance, added code and strategic adoption                                      | [Testability](testability.md)                                                              |
| 7: Refactoring toward valuable unit tests; §7.1.1–§7.1.2, pp. 152–158 | Code quadrants, collaborator cost, significance/complexity and Humble Object                            | [Testability](testability.md), [Unit testing](unit-testing.md)                             |
| 7: §7.2.1–§7.2.5, pp. 158–167                                         | Explicit dependencies, application orchestration, reconstruction and coherent rule ownership            | [Testability](testability.md)                                                              |
| 7: §7.3.1–§7.3.3, pp. 167–169                                         | Domain/utility value, trivial code and meaningful preconditions                                         | [Unit testing](unit-testing.md)                                                            |
| 7: §7.4.1–§7.5, pp. 169–180                                           | Testability/performance/simplicity, staged decisions, eligibility, events and unavoidable fragmentation | [Testability](testability.md), [Test doubles](test-doubles.md)                             |
| 8: Why integration testing?; §8.1.1–§8.1.3, pp. 186–190               | Actual integration evidence, scenario selection, pyramid and Fail Fast conditions                       | [Integration testing](integration-testing.md)                                              |
| 8: §8.2.1–§8.2.3, pp. 190–193                                         | Managed/unmanaged surfaces, mixed databases and unavailable real infrastructure                         | [Integration testing](integration-testing.md), [Database testing](database-testing.md)     |
| 8: §8.3.1–§8.3.4, pp. 193–197                                         | Successful path scope, independent persisted reads and E2E observation                                  | [Integration testing](integration-testing.md), [End-to-end testing](end-to-end-testing.md) |
| 8: §8.4.1–§8.4.3, pp. 197–200                                         | Interface purpose, speculative abstractions, managed/internal dependency caveats                        | [Integration testing](integration-testing.md), [Testability](testability.md)               |
| 8: §8.5.1–§8.5.4, pp. 200–205                                         | Explicit boundaries, indirection, runtime cycles and multiple-act exception                             | [Testability](testability.md), [Test design](test-design.md)                               |
| 8: §8.6.1–§8.6.4, pp. 205–213                                         | Support/diagnostic logging, domain facts/events, structured content and explicit dependencies           | [Integration testing](integration-testing.md), [Test doubles](test-doubles.md)             |
| 9: Mocking best practices; §9.1.1–§9.1.3, pp. 219–225                 | Outermost owned edge, handwritten spies, independent contracts and logging exception                    | [Test doubles](test-doubles.md)                                                            |
| 9: §9.2.1–§9.2.4, pp. 225–227                                         | Architecture-dependent mock placement, multiple recorders, exact effects and owned adapters             | [Test doubles](test-doubles.md)                                                            |
| 10: Testing the database; §10.1.1–§10.1.4, pp. 230–234                | Source-controlled schema/reference data, developer isolation and schema delivery                        | [Database testing](database-testing.md)                                                    |
| 10: §10.2.1–§10.2.2, pp. 234–243                                      | Atomic operations, units of work, separate AAA contexts and document-store limits                       | [Database testing](database-testing.md)                                                    |
| 10: §10.3.1–§10.3.3, pp. 243–246                                      | Parallelism costs, cleanup alternatives, reference-data preservation and DB fidelity                    | [Database testing](database-testing.md)                                                    |
| 10: §10.4.1–§10.4.4, pp. 246–252                                      | Technical helpers, local reuse, visible scenario data and context cost                                  | [Database testing](database-testing.md), [Test design](test-design.md)                     |
| 10: §10.5.1–§10.6, pp. 252–255                                        | Write/read priorities, repository marginal value, pure mappings and large refactors                     | [Database testing](database-testing.md), [Validation](validation.md)                       |
| 11: Unit testing anti-patterns; §11.1.1–§11.2, pp. 260–264            | Private methods, missing abstractions/dead code, real private contracts and state exposure              | [Testability](testability.md), [Validation](validation.md)                                 |
| 11: §11.3, pp. 264–266                                                | Independent expected results, experts and legacy characterization                                       | [Test design](test-design.md)                                                              |
| 11: §11.4–§11.5, pp. 266–271                                          | Runtime test switches, lesser seam tradeoffs and concrete partial mocks                                 | [Testability](testability.md), [Test doubles](test-doubles.md)                             |
| 11: §11.6.1–§11.6.2, pp. 271–273                                      | Ambient shared time, explicit clock/value and capture-at-boundary preference                            | [Testability](testability.md), [Unit testing](unit-testing.md)                             |

## Context that does not become a universal rule

- Chapter 1 §1.1 describes adoption; §1.5 gives the roadmap. The goal applies beyond the book's
  enterprise-application focus, but its cost assumptions need to match the project.
- Chapter 3 §3.2 explains xUnit and its “Fact” terminology. Tests stating domain facts is useful;
  a framework choice, .NET attribute syntax, and a test-class constructor are not requirements.
- Chapter 4's value product and CAP analogy communicate tradeoffs. They are not measured laws
  or an automated scoring formula.
- Chapters 5–8 use object-oriented domain models, functional and hexagonal designs, and a
  customer-management example. Preserve the separation rationale without imposing their
  classes, parsing locations, or number of layers.
- Chapter 6's filesystem update shapes and extensions illustrate explicit decisions and
  effects. A particular file format, error representation, or migration sequence is optional.
- Chapter 7's event infrastructure and eligibility API are options, not required frameworks.
- Chapter 8's single-implementation interface critique does not supersede a project's accepted
  architectural contracts. Its diagnostic-logging preference is not a blanket instrumentation ban.
- Chapter 9's “integration only” mock placement assumes that external effects live in
  orchestration. Exactly-once counts and exact text checks depend on the external contract.
- Chapter 10's .NET transaction APIs, base test class, manual cleanup SQL, and helper style are
  examples. Sequential shared-database execution is a practical default, not a ban on isolated
  parallel tests or containers. Its preference against separate repository suites is about
  overlapping cost and protection, not a ban on important persistence-contract coverage.
- Chapter 11's private-constructor exception concerns a real production contract. It does not
  justify exposing arbitrary internals or adding runtime test modes.

## Maintaining the synthesis

Keep a principle in its primary topic reference and link across topics when necessary. Preserve
the cited condition when changing wording. Add a source or label an inference when extending
beyond the book. Do not claim that these references contain a new framework API tutorial or
empirically verified performance advice; consult the active project's evidence for those tasks.
