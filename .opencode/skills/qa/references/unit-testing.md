# Unit tests

**What:** Calculations, permissions, deadlines, and algorithms.
**When:** A rule changes, a boundary can change the answer, or a bug needs a regression test.
**Type:** Unit. Call the real functions/classes; keep their helper code real.

## An invitation expires at its deadline

### Good — Python

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

### Bad — Python

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

The good test catches `<` becoming `<=`. The bad test calculates both sides with the same code.

### Good — TypeScript

```typescript
// file: unit.good.test.ts
import { expect, test } from 'vitest';
import { canAcceptInvitation } from './invitation_subject';

test.each([
	{ now: 99, accepted: true },
	{ now: 100, accepted: false },
	{ now: 101, accepted: false }
])('acceptance at $now is $accepted', ({ now, accepted }) => {
	expect(canAcceptInvitation(100, now)).toBe(accepted);
});
```

### Bad — TypeScript

```typescript
// file: unit.bad.test.ts
import { expect, test } from 'vitest';
import { canAcceptInvitation } from './invitation_subject';

test.each([99, 100, 101])('acceptance at %i', (now) => {
	expect(canAcceptInvitation(100, now)).toBe(canAcceptInvitation(100, now));
});
```

Use explicit rows when setup and assertions are the same. Give different stories separate tests.
Simple getters need no separate test unless they implement a rule people depend on.

## Runnable setup

Use pytest or Vitest. Copy the labelled files into one folder. In an application, import the
actual rule instead of this example implementation.

```python
# file: invitation_subject.py
def can_accept(expires_at: int, now: int) -> bool:
    return now < expires_at
```

```typescript
// file: invitation_subject.ts
export function canAcceptInvitation(expiresAt: number, now: number): boolean {
	return now < expiresAt;
}
```
