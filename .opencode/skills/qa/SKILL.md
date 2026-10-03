---
name: qa
description: Write, improve, and review automated tests. Use when adding tests, fixing a regression, choosing unit/integration/end-to-end coverage, reviewing test quality, or checking requirement and architecture compliance. Guides agents from a behavioral contract to independently asserted outcomes. Applies across languages and repositories; uses typed, hand-written doubles rather than mocking libraries.
---

# QA

Write tests that catch important wrong behavior and survive changes to internal implementation.
Use the steps below to produce tests, not just a testing recommendation. Keep project-specific
commands, paths, architecture, and enforcement rules in the active project's instructions.

## What counts as a good test

A good test must satisfy all of these:

- **Detect a meaningful defect:** name the required behavior and a wrong outcome that makes
  the test fail. Execution without a discriminating assertion is insufficient.
- **Permit equivalent implementations:** assert the production client's result, usable state,
  or external contract. Internal wiring can change without changing expectations.
- **Use independent expectations:** derive expected values from the contract or confirmed
  examples, not the implementation's algorithm, serializer, or ambient inputs.
- **Run reliably:** use valid fixtures, isolated mutable state, controlled volatile inputs,
  and a faithful real dependency where integration semantics matter.
- **Earn its cost:** protect an important fact, make the scenario and failure understandable,
  and use the least expensive boundary that can establish that fact.

| Bad test                                             | Why it is bad                                                | Good replacement                                         |
| ---------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Calls the operation and checks that nothing threw    | Wrong or missing results can pass                            | Assert the specified result and relevant consequences    |
| Checks an input repository was called once           | Constrains internal coordination without proving correctness | Check the returned decision or resulting state           |
| Uses the production formatter to build expected text | Repeats the same possible mistake                            | Compare with independently specified contract text       |
| Checks all returned rows match a predicate           | Empty/missing results can pass                               | Assert the complete expected relevant records            |
| Uses a fake to claim transaction coverage            | Never exercises the actual commit/rollback semantics         | Run against the real test store and read committed state |
| Passes only after another test seeds data            | Depends on execution order                                   | Arrange fresh owned state in this scenario               |

See [Test design](references/test-design.md) for good and bad code examples.

## Start from a concrete example

Open the scenario reference before implementing the test. Each example includes code, setup,
action, assertions, the defect caught, and adaptation instructions. Import the actual production
unit in your test; the small implementations in the examples only make them self-contained.

| Write this test                                                             | Start here                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Python decision/boundary cases with pytest                                  | [Unit testing](references/unit-testing.md)               |
| TypeScript returned values or state with Vitest                             | [Test design](references/test-design.md)                 |
| Python/TypeScript real file adapter and outbound contract                   | [Integration testing](references/integration-testing.md) |
| Python/TypeScript PostgreSQL commits and rollback                           | [Database testing](references/database-testing.md)       |
| TypeScript Svelte pending/failure states; Python browser interaction/layout | [Frontend testing](references/frontend-testing.md)       |
| TypeScript public HTTP write/read workflow                                  | [End-to-end testing](references/end-to-end-testing.md)   |

Use existing project dependencies where possible. The examples name optional library setups;
they do not require replacing a project's runner or installing every demonstrated framework.

## 1. Define what must be true

Read the requested change, applicable project instructions, and the affected production code.
Inspect relevant existing tests when the task permits it. Find the expected behavior in a
requirement, accepted decision, acceptance criterion, or independently confirmed regression.

Before writing a test, state:

```text
Given: the smallest valid starting state, including the decisive boundary value
When: one action through an entry point used by production
Then: the required result, observable state, and external effects
Defect caught: a specific wrong outcome these assertions must reject
```

For several scenarios, use a small case table. Select success, meaningful boundary values,
rejection, unchanged/no-op behavior, and dependency failure where they pose distinct risks.
Do not mechanically generate every category or one test per method. Label characterization
of existing behavior when an independent specification is unavailable. Clarify ambiguous intent
only when it changes the expected result.

## 2. Choose the boundary that can catch the defect

| Defect to detect                                                   | Write                                                 | Keep real                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Wrong calculation, eligibility rule, or in-memory state transition | [Unit test](references/unit-testing.md)               | The decision and useful private in-memory collaborators            |
| Incorrect wiring, mapping, query, constraint, or transaction       | [Integration test](references/integration-testing.md) | The participating application code and relevant managed dependency |
| Persistence or rollback differs from production                    | [Database test](references/database-testing.md)       | The production-compatible store, schema, and commit boundary       |
| A rendered interaction, async state, or layout breaks              | [Frontend test](references/frontend-testing.md)       | The component or public UI needed to observe that behavior         |
| A critical goal fails through the public application               | [End-to-end test](references/end-to-end-testing.md)   | The public entry point and dependencies needed for that evidence   |

Choose the narrowest boundary that provides the missing evidence. Several real classes can
form one unit. A workflow backed only by fakes does not establish real database or provider
compatibility. Add a wider test only for protection the narrower tests cannot supply.

## Language-specific implementation rules

- **Python:** use ordinary `assert` with explicit values; `pytest.raises` must match the expected
  failure type/message, not any exception. Use function-scoped fixtures and `tmp_path` for owned
  resources. Parametrize explicit inputs/outputs only when the scenario is the same. Implement
  consumed `Protocol` contracts with ordinary classes; avoid `unittest.mock` and monkeypatching
  internal functions. For async APIs, await the action in the project's configured async runner.
- **TypeScript:** await actions, `.rejects`, and retrying DOM assertions. Missing `await` can end
  the test before the failure occurs. Implement interfaces with typed classes/closures; do not
  use `vi.fn`, `vi.mock`, or casts to disguise incomplete dependencies. Register resource cleanup
  immediately after acquisition, and type fixtures so setup cannot silently omit collaborators.

## 3. Arrange valid state and explicit inputs

- Use fresh mutable state per test. Supply fixed time, randomness, and identifiers when relevant.
- Keep scenario-defining values visible. Extract repetitive mechanics into small factories;
  leave expected results independent of production calculations.
- Keep cheap private collaborators real. Replace only dependencies that need control or
  isolation. Use existing typed doubles or write a small one against the consumed contract.
- For incoming data, use a stub or fake and assert the resulting behavior. For outgoing external
  effects, use a typed recorder at the last owned boundary. See [Test doubles](references/test-doubles.md).
- Do not use mocking libraries, cast partial objects into dependencies, or arrange states that
  production cannot produce. Do not supply success defaults for missing setup.

## 4. Write the test and, when required, the production change

1. Name the test as a domain fact: `an expired invitation cannot be accepted`.
2. Arrange the scenario, act on one behavior, then assert all its meaningful outcomes.
   Related assertions belong together; assertion count does not define focus.
3. Use explicit known expectations. Do not call the production formatter or copy its algorithm
   to derive them. Assert the complete relevant result so missing records, duplicates, or extra
   effects cannot pass unnoticed. See [Test design](references/test-design.md) for examples.
4. For a regression, run the new test against the defect when feasible and confirm it fails for
   the intended reason. If a code fix is requested, make the smallest change that restores the
   contract, then rerun. If it passes before the fix, investigate before changing expectations.
5. If setup requires overriding internals, make the smallest in-scope boundary improvement:
   explicit inputs, a returned decision, or an owned I/O seam. Keep decisions together and
   effects at the edge. Do not expose private state or add production test switches.
   Use [Testability](references/testability.md) for concrete remedies.

Follow active project enforcement. If an assertion-count rule conflicts with a cohesive test,
report the conflict; do not hide assertions in helpers or weaken audits to evade it.

## 5. Check the test before calling it done

- **Wrong behavior:** would it fail for the concrete defect stated in step 1? Check missing,
  wrong, duplicated, and prohibited outcomes that matter to this scenario.
- **Equivalent implementation:** would it still pass after inlining a helper, changing an
  internal call sequence, or replacing an ORM while preserving the contract?
- **Independence:** does it pass without another test's data, order, or ambient clock? For
  persistence, does a fresh read establish the result rather than an input object or cache?
- **Added value:** does it protect an important fact at reasonable setup and execution cost?
  Coverage highlights omissions; it does not prove assertions are useful.

Run the targeted test and relevant project checks. Report observed results and any unavailable
or substituted boundary. Use [Validation](references/validation.md) for a review or coverage
audit. Distinguish application defects, test defects, and missing evidence.

[Source and scope](references/sources.md) records attribution and the skill's tooling policy.
