# Code that is hard to test

**What:** Real calculations and rules, without shortcuts enabled only during tests.
**When:** Setup tempts you to add an `isTest` switch, override a private method, or expose private data.
**Type:** Unit for the rule; integration for its database/file/network work.

## A test must execute the actual pricing rule

### Good — Python

```python
# file: test_shortcut_good.py
from shortcut_subject import price

def test_discounted_price() -> None:
    assert price(100) == 90
```

### Bad — Python

```python
# file: test_shortcut_bad.py
from shortcut_subject import price

def test_discounted_price() -> None:
    assert price(100, is_test=True) == 90
```

### Good — TypeScript

```typescript
// file: shortcut.good.test.ts
import { expect, test } from 'vitest';
import { price } from './shortcut_subject';

test('discounted price', () => {
	expect(price(100)).toBe(90);
});
```

### Bad — TypeScript

```typescript
// file: shortcut.bad.test.ts
import { expect, test } from 'vitest';
import { price } from './shortcut_subject';

test('discounted price', () => {
	expect(price(100, true)).toBe(90);
});
```

The bad tests pass if the real discount is broken: their test-only branch returns a canned value.
Pass facts such as the current time into a rule instead of changing production behavior for tests.

## Demonstration setup — an intentionally bad production pattern

The flag below exists only to demonstrate the mistake. Do not add one to an application.
Remove test-only branches; keep related rules together and perform I/O outside the calculation
when that fits the project. Do not force a new architecture or fetch unnecessary data for purity.

```python
# file: shortcut_subject.py
def price(subtotal: int, is_test: bool = False) -> int:
    if is_test:
        return 90
    return subtotal * 9 // 10
```

```typescript
// file: shortcut_subject.ts
export function price(subtotal: number, isTest = false): number {
	if (isTest) return 90;
	return Math.floor(subtotal * 0.9);
}
```
