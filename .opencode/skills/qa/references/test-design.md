# Test design

Use arrange, act, assert. Keep one behavior and all its relevant outcomes in one scenario.
The examples below use TypeScript and a Jest-style assertion API; adapt syntax to the project's
runner. These are independent examples, not repository requirements.

## A complete output test

Production contract: an invitation expires at its deadline, including equality.

```typescript
import { expect, it } from 'vitest';

function canAcceptInvitation(expiresAt: number, now: number): boolean {
	return now < expiresAt;
}

it('an invitation cannot be accepted at its expiry instant', () => {
	const expiresAt = 100;
	const now = 100;

	const accepted = canAcceptInvitation(expiresAt, now);

	expect(accepted).toBe(false);
});
```

The independent expected value detects an accidental `<=`. Add a just-before case if acceptance
before expiry is also the risk being covered. Do not compute the expectation with the same
comparison as production.

## One action with related outcomes

Contract: accepting a reservation consumes exactly the requested capacity; insufficient
capacity rejects the request without changing available capacity.

```typescript
import { expect, it } from 'vitest';

class Capacity {
	constructor(public available: number) {}

	reserve(places: number): 'accepted' | 'insufficient' {
		if (places > this.available) return 'insufficient';
		this.available -= places;
		return 'accepted';
	}
}

it('a confirmed reservation consumes the requested capacity', () => {
	const capacity = new Capacity(5);

	const result = capacity.reserve(2);

	expect(result).toBe('accepted');
	expect(capacity.available).toBe(3);
});

it('insufficient capacity leaves the available places unchanged', () => {
	const capacity = new Capacity(1);

	const result = capacity.reserve(2);

	expect(result).toBe('insufficient');
	expect(capacity.available).toBe(1);
});
```

These fixtures use valid positive counts. Other input validation belongs to the declared public
contract; the example is not a complete reservation API. `available` represents state a
production client uses, not a field exposed solely for assertions.

## Replace weak assertions

Suppose the contract requires a query to return exactly the current user's two active records.
These fragments follow the same arrange and act:

```typescript
// Bad: [] passes; so does an incomplete list containing only one matching record.
expect(records.every((record) => record.ownerId === 'user-7')).toBe(true);

// Good: independently specified values reject missing, extra, and wrong records.
expect(records).toEqual([
	{ id: 'item-2', ownerId: 'user-7', status: 'active' },
	{ id: 'item-4', ownerId: 'user-7', status: 'active' }
]);
```

Here order is contractual. When it is not, normalize copies by a stable key before comparison;
do not add an order requirement merely because an array assertion is convenient.

| Weak pattern                                 | Why it passes for a defect     | Write instead                                                         |
| -------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Every returned item belongs to the user      | An empty result passes         | Compare the complete expected relevant IDs or values                  |
| Result is truthy                             | The wrong object can be truthy | Check the required decision and payload                               |
| At least one expected message exists         | Duplicates and extras pass     | Compare the complete relevant effects when cardinality is contractual |
| A helper was called                          | The result can still be wrong  | Assert the resulting value or observable state                        |
| Expected value uses production serialization | Both sides share the error     | Use an independently specified wire payload                           |

Exact output text is useful for a stable external contract. Exact developer diagnostic text is
usually an implementation detail. Choose precision from what the consumer depends on.

## Keep setup and execution readable

- Put decisive values in the test body. A factory may default irrelevant valid details, but must
  not conceal missing setup, successful lookups, or impossible production states.
- Extract connection mechanics and repeated construction before introducing elaborate builders.
  Start helpers locally; share them when actual reuse pays for the indirection.
- Use common hooks for resource lifecycle, not hidden scenario-defining mutable fields. Each
  test needs fresh state. Unit tests usually require no external teardown.
- Separate AAA with blank lines. Add comments only when the sections are otherwise unclear.
- Do not branch on runtime output to decide what to assert. Separate cases or use explicit rows.
- Prefer one act in unit tests. Infrastructure protocols can need several operations. Multiple
  AAA cycles usually belong in separate tests; a naturally sequential integration workflow can
  justify them when splitting incurs exceptional real dependency cost. Document that reason.

## Parameterize only the same story

Use a case table when only the decisive inputs and independently known outputs vary. Give rows
meaningful names, such as `before expiry` and `at expiry`. Separate cases with different setup,
assertion shape, or business meaning instead of adding mode flags to one generic test.

Name tests as facts in the client's vocabulary. Utility algorithm names can be that vocabulary.
Avoid naming private methods or enforcing a rigid method/scenario/result template.

If no independent specification exists during a legacy refactor, captured behavior can serve
as a characterization baseline. Label it as such; it is not proof the behavior is correct.
