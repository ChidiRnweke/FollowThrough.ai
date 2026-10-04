# Reviewing tests

**What:** Whether a test detects the bug it claims to protect against.
**When:** Reviewing tests, investigating coverage gaps, or removing duplicate checks.
**Type:** Review the existing test's unit/integration/component/end-to-end claims.

## The query must return Alice's two records

### Good — Python

```python
# file: test_review_good.py
from lookup_subject import Item, owned_items

def test_alice_receives_her_records() -> None:
    items = [Item("one", "alice"), Item("two", "alice"), Item("three", "bob")]
    result = owned_items(items, "alice")
    assert sorted(item.id for item in result) == ["one", "two"]
```

### Bad — Python

```python
# file: test_review_bad.py
from lookup_subject import Item, owned_items

def test_alice_receives_her_records() -> None:
    items = [Item("one", "alice"), Item("two", "alice"), Item("three", "bob")]
    result = owned_items(items, "alice")
    assert all(item.owner == "alice" for item in result)
```

### Good — TypeScript

```typescript
// file: review.good.test.ts
import { expect, test } from 'vitest';
import { ownedItems } from './lookup_subject';

test('Alice receives her records', () => {
	const items = [
		{ id: 'one', owner: 'alice' },
		{ id: 'two', owner: 'alice' },
		{ id: 'three', owner: 'bob' }
	];
	const result = ownedItems(items, 'alice');
	expect(result.map((item) => item.id).sort()).toEqual(['one', 'two']);
});
```

### Bad — TypeScript

```typescript
// file: review.bad.test.ts
import { expect, test } from 'vitest';
import { ownedItems } from './lookup_subject';

test('Alice receives her records', () => {
	const items = [
		{ id: 'one', owner: 'alice' },
		{ id: 'two', owner: 'alice' },
		{ id: 'three', owner: 'bob' }
	];
	const result = ownedItems(items, 'alice');
	expect(result.every((item) => item.owner === 'alice')).toBe(true);
});
```

The bad tests pass for no records. The good tests reject missing, extra, and wrong IDs while
allowing order to change. If order is required, compare the original sequence instead.

## Runnable setup

Use pytest/Vitest. This example tests a collection rule, not SQL. Use real database integration
tests when filtering is implemented in a query.

```python
# file: lookup_subject.py
from dataclasses import dataclass

@dataclass(frozen=True)
class Item:
    id: str
    owner: str

def owned_items(items: list[Item], owner: str) -> list[Item]:
    return [item for item in items if item.owner == owner]
```

```typescript
// file: lookup_subject.ts
type Item = { id: string; owner: string };
export function ownedItems(items: Item[], owner: string): Item[] {
	return items.filter((item) => item.owner === owner);
}
```

For each finding, name the missed bug or harmless rewrite the test rejects, then show a correction.
Check fresh data, fixed time, and independent expected values. Coverage finds unexamined code;
it does not prove assertions work. Report requirements with missing tests separately from missing
implementation. Respect type/schema guarantees. Use project architecture audits and report conflicts.
