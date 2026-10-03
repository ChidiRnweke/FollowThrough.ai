# Database testing

Use this recipe when a defect depends on queries, constraints, mapping, migrations, transactions,
or committed state. Use the production-compatible database system. A different engine or an
in-memory fake cannot prove those semantics; vendor identity alone also does not prove fidelity.
Check relevant version, extension, and configuration differences.

## Pick the database scenario

| Risk                                       | Arrange and act                                                                                     | Independently assert                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Insert/update loses data                   | Seed required relations; run the normal write workflow                                              | A fresh read has every required committed value                            |
| Query leaks or omits rows                  | Seed matching rows plus realistic nonmatching owners/states; run the real query                     | Exactly the required records, with contractual ordering only               |
| Constraint is absent or mapped incorrectly | Create a valid conflict at the real boundary; perform the write                                     | Specified rejection and unchanged relevant committed state                 |
| Correlated writes partially commit         | Seed valid initial balances/relations; exercise success and a reproducible failure                  | All required writes commit, or none do, according to the contract          |
| Migration loses existing data              | Start at the supported prior schema with representative valid data; apply the migration             | The new schema supports required reads/writes and preserves specified data |
| Concurrent operations violate an invariant | When this is a real risk, start competing operations with controlled overlap against the real store | The final state and outcomes satisfy the declared consistency guarantee    |

## Prepare reproducible state

1. Use an isolated disposable test environment. Build its schema from committed migrations and
   required reference data, rather than a manually patched model database.
2. Start each scenario with clean owned test data or fresh storage. Cleanup only at the end can
   leave leftovers after interruption. Preserve required reference rows and migration history;
   respect foreign keys and keep constraints enabled.
3. Seed valid starting records with visible scenario-defining values.
4. Close the setup persistence context before invoking the operation.

Schema and required reference data belong in source control. Ordinary user data is scenario
setup. For migration defects, exercise the relevant historical schema/data transition. Follow
the project's delivery process; do not rewrite already-applied migrations as a testing shortcut.

## Keep arrange, act, and assert independent

```text
arrange: write starting records and close the setup context
act: invoke the real application operation with its normal transaction/commit boundary
assert: open a fresh context and read committed facts
```

Never treat the arranged object, ORM identity cache, or uncommitted writes as proof of durable
state. Separate contexts protect independent observation; they do not require exactly three
physical connections. Do not wrap the whole test in an outer rollback transaction when that
changes production commit visibility or transaction behavior.

## Test the consistency guarantee

For a transfer that must atomically move 10 units from A to B:

```text
success:
  arrange A=30, B=5
  act transfer 10
  independently read A=20, B=15
failure:
  arrange A=30, B=5 and a valid reproducible failure before the operation completes
  act transfer 10
  assert the specified failure and independently read A=30, B=5
```

Choose a failure the real boundary can produce; do not patch a private method to simulate a
rollback. Exercise the operation's correlated writes and normal commit owner. One transaction
per repository call can miss atomicity across the operation. Assert resulting consistency,
not whether a particular unit-of-work class or SQL sequence was used. Derive the guarantee
from the actual store: document stores and relational stores can have different atomicity scopes.

## Choose isolation before concurrency

Run sequentially when tests share mutable database state. Parallel execution requires isolated
queries, constraints, cleanup ownership, and enough database capacity. Unique IDs alone may not
isolate global queries. Per-test databases, schemas, or containers can help; choose the simplest
faithful lifecycle whose measured cost is justified. A container per test is not required.

Extract connection, disposal, and insertion mechanics when they obscure the scenario. Keep
business facts and independently expected results visible. Helpers may open fresh contexts;
do not optimize those reads away without checking the resulting loss of independence.

## Prioritize valuable persistence cases

- Cover writes that could corrupt durable state.
- Cover consequential reads: filtering, ownership, joins, ordering when contractual, and complex
  mapping. Assert complete relevant results so empty or missing records cannot pass unnoticed.
- Use workflow integration coverage when it already protects a simple repository. Add focused
  repository tests for distinct query or persistence risks, not to repeat the same evidence.
- Test pure complex mapping separately where useful; test ORM/database behavior against the
  real store. Avoid snapshots of generated SQL when committed behavior is the actual contract.

These choices let behavior-focused tests protect changes such as replacing an ORM without
fixing the suite to its internal implementation.
