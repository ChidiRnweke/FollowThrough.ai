---
name: qa
description: Design, write, and review automated tests; choose unit, integration, or end-to-end coverage; assess test doubles, testability, requirement coverage, and test quality. Use for testing requests and architecture compliance reviews. Applies across languages and projects. Uses typed, hand-written test doubles rather than mocking libraries.
---

# QA

Build a test suite that supports sustainable changes. Prefer tests that detect important
regressions, survive behavior-preserving refactors, give timely feedback, and remain easy to
understand and operate. Test count and coverage percentages do not establish quality.

The references synthesize Vladimir Khorikov's _Unit Testing: Principles, Practices, and
Patterns_ (2020). [Sources](references/sources.md) records the chapter coverage and limits of
the synthesis. The preference for typed, hand-written doubles is this skill's tooling policy;
the book also discusses mocking frameworks.

## Shared decisions

- A unit is a meaningful behavior, not a class. Isolate tests from each other; keep useful
  private, in-memory collaborators real.
- Verify the behavior's meaningful outputs, state changes, and external effects. One behavior
  can require several assertions. Do not split its outcomes just to count assertions.
- Prefer output-based tests when behavior can be expressed as explicit inputs and results.
  State-based tests remain appropriate for observable state transitions.
- Do not verify input-stub calls or internal collaboration. Verify externally observable
  effects at an appropriate owned boundary, including duplicates or unexpected effects when
  those would violate the contract.
- Use typed fakes, stubs, or recorders when a double is needed. Do not use mocking libraries,
  monkeypatch internal methods, or disguise partial objects with casts.
- Integration evidence requires exercising the relevant real integration. A fake cannot prove
  database behavior or compatibility with a real external service.
- Establish expected results independently of the implementation. Avoid copying its algorithm
  into assertions or exposing internals solely for tests.
- Prioritize important behavior and meaningful complexity. Investigate uncovered paths and
  expensive setup; do not mandate a universal coverage percentage or architecture refactor.

## Read only the relevant references

| Task or decision                                            | Reference                                                |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| Unit boundaries, isolation, outputs and state               | [Unit testing](references/unit-testing.md)               |
| Workflow coverage and real dependency integration           | [Integration testing](references/integration-testing.md) |
| User-facing workflows and deployed-system checks            | [End-to-end testing](references/end-to-end-testing.md)   |
| Persistence, transactions, migrations, cleanup              | [Database testing](references/database-testing.md)       |
| Stubs, fakes, recorders, external contracts                 | [Test doubles](references/test-doubles.md)               |
| AAA, assertions, fixtures, names, parameterization, oracles | [Test design](references/test-design.md)                 |
| Difficult setup, hidden inputs, mixed responsibilities      | [Testability](references/testability.md)                 |
| Test review, requirement coverage, architecture compliance  | [Validation](references/validation.md)                   |
| Provenance, chapter coverage, contextual recommendations    | [Sources](references/sources.md)                         |

## Write or improve tests

1. Establish the behavior and the source of its expected result. Use requirements, acceptance
   criteria, domain rules, accepted decisions, or an independently confirmed regression. No
   particular invariants filename is required. Ask about missing intent only when it matters;
   label characterization of existing behavior when no independent specification exists.
2. Read the applicable project instructions and identify the behavior's boundary, important
   failure risks, and dependency ownership. Directory names do not determine test type.
3. Choose the lowest-cost test that can detect the relevant defect. Cover pure decisions with
   unit tests, real integration assumptions with integration tests, and critical user workflows
   with end-to-end tests where the wider boundary adds value.
4. Arrange production-producible state. Reuse real collaborators and existing typed doubles;
   create only the substitutes needed. Keep scenario-defining facts visible.
5. Act on one behavior and verify its meaningful outcomes with independent expectations.
   Treat one-act guidance as a unit-test default; use the narrow integration exceptions in the
   references rather than combining unrelated operations for convenience.
6. Run the relevant project checks. Report what passed, what failed, and any boundary that was
   replaced or unavailable. Do not claim integration evidence from a simulated dependency.

## Review or validate

Use [Validation](references/validation.md) to assess behavior coverage, independent assertions,
refactoring resistance, isolation, and marginal value. Report specific findings and justified
coverage gaps. Distinguish a defect in the application from a defect in its tests.

For architecture compliance, read the project's accepted architecture and inspect its actual
dependency rules. Use its available audits. Do not impose a universal layer diagram, place
business logic in a particular directory, or weaken a checker to satisfy this skill. If a
local check conflicts with the testing guidance, report the conflict and its effect explicitly.
