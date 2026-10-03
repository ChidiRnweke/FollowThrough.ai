# Unit testing

Use this recipe for a decision or state transition that can run quickly with isolated state.
A unit is one meaningful behavior, even when several real functions or objects implement it.

## Write it

1. Identify the production client and its goal. Choose the entry point that delivers that goal,
   not an internal helper merely because it is public.
2. List the facts needed for the decision. Supply them directly where possible; give each test
   fresh mutable collaborators. Keep cheap, private in-memory collaborators real.
3. Select cases with different outcomes or important boundaries. Start with the risk, not a list
   of methods: expiry just before/at the deadline, capacity sufficient/insufficient, or a no-op
   when the requested value already matches.
4. Act once. Assert the returned decision and the observable state relevant to that behavior.
5. Check that an equivalent internal implementation would pass. Remove assertions about internal
   calls, private fields, or incidental object structure.

Use [Test design](test-design.md) for executable examples and fixture rules.

## Python: test a deadline with pytest

Save as `test_invitation.py`. Run `python -m pytest test_invitation.py` in an environment with
pytest. In a project, import `can_accept` from production rather than redefining it in the spec.

```python
import pytest


def can_accept(expires_at: int, now: int) -> bool:
    return now < expires_at


@pytest.mark.parametrize(
    ("now", "expected"),
    [(99, True), (100, False), (101, False)],
    ids=["before-expiry", "at-expiry", "after-expiry"],
)
def test_invitation_acceptance_respects_expiry(now: int, expected: bool) -> None:
    expires_at = 100

    accepted = can_accept(expires_at, now)

    assert accepted is expected
```

**Catches:** changing `<` to `<=` fails `at-expiry`. Always returning `False` fails
`before-expiry`. **Bad replacement:** `assert accepted == (now < expires_at)` copies the rule;
it can repeat the same mistaken boundary. Keep the explicit case values.

**Adapt:** substitute the actual production input type and deadline contract. Use parametrization
only for cases sharing setup/action/assertion shape. For a rejection that preserves state,
assert both the failure and unchanged state, as in the TypeScript reservation example in
[Test design](test-design.md). The syntax above follows [pytest parametrization](https://docs.pytest.org/en/stable/how-to/parametrize.html).

## Choose the observation

| Behavior                 | Assert                                             | Avoid                                          |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| Calculates a price       | Independently known final amount                   | Recomputing the production formula in the test |
| Reserves capacity        | Acceptance and remaining usable capacity           | A call to an internal inventory helper         |
| Rejects a request        | Specified failure and unchanged relevant state     | Merely that some exception occurred            |
| Leaves a value unchanged | Unchanged result and no prohibited external effect | How often the input was queried                |

Several assertions may describe one action. Assert complete domain values when helpful; do not
inspect every field of the object graph. Add production equality only when the type is genuinely
a value, rather than to shorten tests.

## Control the right dependencies

- **Shared mutable state:** replace it or establish per-test isolation. A static in-process
  singleton can cause the same coupling as an external store.
- **Private in-memory state:** usually use a fresh real instance, not another double.
- **Volatile input:** supply a fixed instant, random value, or typed input source. Capture time
  once at the operation boundary and pass it inward.
- **Out-of-process dependency:** assess speed, availability, and isolation. A stable real
  dependency can be useful, but state which boundary was exercised. A fake cannot prove its
  integration semantics.

These properties overlap. Out-of-process does not mean shared, and shared does not mean external.
Replacing a dependency does not justify asserting how the substitute was queried.

## Spend effort where a failure matters

Prioritize significant business rules and complex algorithms, including short rules with large
consequences. Skip assignment/getter/constructor tests that add no meaningful protection. Test
business preconditions; do not add a standalone test for every defensive internal check when
normal execution already makes its failure immediate and obvious.

Use code and coverage to discover cases, then assert independently specified outcomes. Several
failing tests can share one faulty real collaborator; investigate their common cause before
replacing that collaborator with doubles. Expensive setup is a reason to inspect the decision
boundary, not to mock every participant. See [Testability](testability.md).
