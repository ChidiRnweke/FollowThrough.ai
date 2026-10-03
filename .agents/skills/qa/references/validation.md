# Validation

Review by behavior and evidence. Read the applicable project requirements, accepted architecture,
and actual dependency rules. Use deterministic project audits for mechanical constraints.

## Review each valuable scenario

1. Identify its client, starting state, action, expected fact, and requirement source.
2. Name a concrete wrong outcome that must fail. Inspect whether the actual assertions reject
   it, including relevant omissions, empty results, duplicates, and prohibited effects.
3. Name a behavior-preserving rewrite that must pass. Flag internal call counts, private
   structure, generated SQL, and copied algorithms that unnecessarily reject it.
4. Check independence: fresh mutable state, controlled inputs, production-valid fixtures, and
   no reliance on execution order. Require fresh persisted-state reads for database evidence.
5. Assess added protection against setup, reading, execution, and environment-maintenance cost.
   Do not assign numeric quality scores.

This balances regression protection, refactoring resistance, fast feedback, and maintainability.
A trivial green test can miss every important defect; a brittle test can raise false alarms on
equivalent implementations. An intended contract change should change expectations. Ordinary
compile errors from API changes are distinct from ambiguous runtime false alarms.

## Make findings concrete

Write findings as:

```text
Location: the affected test or behavior
Problem: what the test misses or unnecessarily constrains
Consequence: a specific defect it permits or valid refactor it rejects
Fix: the smallest useful assertion, fixture, boundary, or coverage change
```

For example: `the result.every(...) assertion also passes for []; compare the independently
expected records so a missing required result fails`. Distinguish application defects, test
defects, missing integration evidence, and local policy conflicts. Prioritize consequence and
confidence rather than style-rule counts. State inspected scope; a sample is not a whole-suite
audit.

## Check coverage against requirements

For each important rule in scope, find its enforcement and an assertion that would catch a
violation. Record one of:

| Status             | Needed evidence                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| Protected          | Enforcing implementation and an adequate independent test                  |
| Test gap           | Enforcement exists; useful protection was not found in the inspected scope |
| Weak test          | A test exists but its fixture/oracle/assertion cannot catch the violation  |
| Implementation gap | Confirmed requirement has no enforcing mechanism found                     |
| Other guarantee    | Type, schema, or constraint; state what it proves and its limits           |
| Unresolved         | Intent or evidence is missing                                              |

A compile-time guarantee may need a type check rather than a redundant runtime test. A database
constraint may need real integration evidence. Do not require an invariants file or a formal
invariant tag on every test.

Use line/branch coverage to locate unexamined paths, then derive behavior cases with independent
expectations. Execution is not assertion quality; external-library paths can remain unverified.
Do not impose universal percentages, pyramid ratios, or one-test-per-method rules.

## Apply the same judgment consistently

| Scenario                                                   | Decision                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| One reservation checks confirmation and remaining capacity | Keep related outcomes together                                 |
| A stub's query count is asserted                           | Replace with the resulting behavior                            |
| The expected outbound message appears twice                | Reject duplicates when the contract requires one               |
| A fake-backed persistence workflow passes                  | Report simulated behavior; real persistence remains unverified |
| Assertion reads the arranged tracked object                | Read committed state independently                             |
| Act and assert each read the current clock                 | Supply fixed time or capture it at the boundary                |
| A getter test only raises coverage                         | Question its added protection                                  |
| A short pricing rule has major consequences                | Retain focused protection                                      |
| A private constructor supports ORM reconstruction          | Test the real production contract                              |
| Exact developer diagnostic text is asserted                | Remove incidental coupling; distinguish support obligations    |

For architecture reviews, trace actual ownership and runtime collaboration as well as imports.
Do not force a universal layer diagram, ban all orchestration branches, or silence one audit to
satisfy another. Report policy conflicts and their practical effects without hiding assertions
or adding suppressions. Report only observed runs as passing; disclose replaced and unavailable
boundaries.
