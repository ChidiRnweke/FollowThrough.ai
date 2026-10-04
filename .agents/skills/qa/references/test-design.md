# Test design

**What:** All required results of one action, including unchanged data on rejection.
**When:** A test checks only success, truthiness, or part of the returned result.
**Type:** Apply to every test type. Keep setup, action, and assertions visibly separate.

## Reserving two places consumes two places

### Good — TypeScript

```typescript
// file: capacity.good.test.ts
import { expect, test } from 'vitest';
import { Capacity } from './capacity_subject';

test('reservation consumes the requested places', () => {
	const capacity = new Capacity(5);
	const result = capacity.reserve(2);
	expect(result).toBe('accepted');
	expect(capacity.available).toBe(3);
});

test('rejection leaves available places unchanged', () => {
	const capacity = new Capacity(1);
	const result = capacity.reserve(2);
	expect(result).toBe('insufficient');
	expect(capacity.available).toBe(1);
});
```

### Bad — TypeScript

```typescript
// file: capacity.bad.test.ts
import { expect, test } from 'vitest';
import { Capacity } from './capacity_subject';

test('reservation consumes the requested places', () => {
	const capacity = new Capacity(5);
	expect(capacity.reserve(2)).toBe('accepted');
});

test('rejection leaves available places unchanged', () => {
	const capacity = new Capacity(1);
	expect(capacity.reserve(2)).toBe('insufficient');
});
```

As the sole checks for these scenarios, the bad tests miss incorrect remaining capacity.
Several assertions can describe one action.
Do not expose private fields solely for tests; `available` is a value the example's callers use.

## A result contains every required record

See the paired [review examples](validation.md): checking that every returned row belongs to
Alice passes for an empty result; checking the expected IDs does not.

## Runnable setup

Use Vitest. These examples accept valid positive requests. Import the production operation in
an application rather than copying this demonstration class.

```typescript
// file: capacity_subject.ts
export class Capacity {
	constructor(public available: number) {}

	reserve(places: number): 'accepted' | 'insufficient' {
		if (places > this.available) return 'insufficient';
		this.available -= places;
		return 'accepted';
	}
}
```

Keep important fixture values visible. Factories may default irrelevant valid fields, not hide
missing setup or create impossible data. Give tests fresh objects. Name the fact being checked.
Avoid conditional assertions and unrelated actions in one test. Characterization of legacy
behavior is useful for refactoring; label it instead of calling it a confirmed requirement.
