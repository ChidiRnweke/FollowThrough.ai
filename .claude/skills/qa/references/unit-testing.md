# Unit tests

**What:** Calculations, permissions, deadlines, and algorithms.
**When:** A rule changes, a boundary changes the answer, or a bug needs a regression test.
**Type:** Unit. Call the real functions/classes; keep their helper code real.

## An invitation expires at its deadline

An invitation expiring at 100 is valid at 99, but invalid at 100 and 101.
Use those known answers as expected values. Asking the same function for both the actual
and expected answer cannot detect an incorrect deadline rule.

### Bad — derives the expected answer from the implementation

```python
# file: test_unit_bad.py
import pytest
from invitation_subject import can_accept

@pytest.mark.parametrize("now", [99, 100, 101])
def test_invitation_acceptance(now: int) -> None:
    actual = can_accept(100, now)
    expected = can_accept(100, now)
    assert actual == expected
```

Changing `<` to `<=` makes acceptance at 100 wrong, but both sides still return `True`.

### Solution — explicit boundary cases

```python
# file: test_unit_good.py
import pytest
from invitation_subject import can_accept

@pytest.mark.parametrize(
    ("now", "expected"), [(99, True), (100, False), (101, False)],
    ids=["before-expiry", "at-expiry", "after-expiry"],
)
def test_invitation_acceptance(now: int, expected: bool) -> None:
    assert can_accept(expires_at=100, now=now) is expected
```

The deadline row expects `False`, so that change fails. Use explicit rows when setup and
assertions are the same; give different stories separate tests. Simple getters need no
separate test unless they implement a rule people depend on.

## Runnable setup

Use pytest. Copy the labelled files into one folder. In an application, import its actual rule.

```python
# file: invitation_subject.py
def can_accept(expires_at: int, now: int) -> bool:
    return now < expires_at
```
