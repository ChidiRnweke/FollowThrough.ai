---
name: qa
description: Choose what to test, when to add a test, and which test type to use. Write and review tests using concrete good and bad Python and TypeScript examples. Use for test requests, regressions, coverage reviews, and architecture checks. Uses typed handwritten fakes and recorders, not mocking libraries.
---

# QA

A good test fails when the answer is wrong and keeps passing when helper methods change.
A bad test can pass with wrong results, or fail because internal code was rearranged.

## What to test, when, and which kind

- **Calculations, business rules, and algorithms — unit tests.** When adding or changing prices,
  permissions, deadlines, or limits, test inputs that produce different answers. See
  [good and bad unit tests](references/unit-testing.md).
- **Saving and retrieving data — integration tests.** Test writes, rollback, and queries whose
  filters, joins, or ordering change the returned records. See [database examples](references/database-testing.md).
- **Files, messages, and external services — integration tests.** When connecting these to a
  workflow, check its results, required messages, and failures. See [integration examples](references/integration-testing.md)
  and [fakes and recorders](references/test-doubles.md).
- **Screen interactions — component tests.** When changing what happens after typing, clicking,
  loading, or an error, check what the user sees. See [frontend examples](references/frontend-testing.md).
- **Critical user journeys — end-to-end tests.** When a failure would prevent an important task,
  test that task through the application. See [end-to-end examples](references/end-to-end-testing.md).

Skip separate tests for simple getters, library behavior, and cases already protected against
the same bug. Do not chase coverage percentages or create a test for every method.

## Good tests

- Get expected answers from requirements or confirmed examples. Do not calculate them with the
  code being tested.
- Test one action and all its required results together. Several assertions are allowed.
- Use real helper functions and classes. Use typed handwritten fakes or recorders for dependencies
  that need substitution. No mocking libraries or casts that hide incomplete objects.
- Start with fresh, valid data. Use fixed time when testing deadlines.
- Use real database tests for SQL and rollback; fakes cannot prove them.
- Prefer fast, readable tests. Add slower tests for bugs the fast tests cannot catch.

[Test design](references/test-design.md) shows missing-result mistakes.
[Testability](references/testability.md) shows test-only shortcuts to avoid.
[Review examples](references/validation.md) show how to judge existing tests.

Follow project instructions and run its relevant checks. Report conflicts and unavailable
infrastructure; do not weaken checks or claim untested results passed.

[Source](references/sources.md).
