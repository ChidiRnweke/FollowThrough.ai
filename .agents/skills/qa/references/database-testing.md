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

## Python: real PostgreSQL commit and rollback

Save as `test_transfer.py`. Requires pytest, Psycopg 3, and a disposable PostgreSQL database.
Set `QA_TEST_DATABASE_URL` explicitly; run `python -m pytest test_transfer.py`. There is no
fallback to a fake or production URL. Each test owns a uniquely named table.

```python
import os
from collections.abc import Iterator
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest


@pytest.fixture
def database() -> Iterator[tuple[str, str]]:
    dsn = os.environ["QA_TEST_DATABASE_URL"]
    table = "balances_" + uuid4().hex
    name = sql.Identifier(table)
    try:
        with psycopg.connect(dsn) as conn:
            conn.execute(sql.SQL(
                "CREATE TABLE {} (id text PRIMARY KEY, balance integer NOT NULL)"
            ).format(name))
            conn.execute(sql.SQL(
                "INSERT INTO {} VALUES ('A', 30), ('B', 5)"
            ).format(name))
        yield dsn, table
    finally:
        with psycopg.connect(dsn) as conn:
            conn.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(name))


def transfer(dsn: str, table: str, source: str, target: str, amount: int) -> None:
    name = sql.Identifier(table)
    with psycopg.connect(dsn) as conn:
        debit = conn.execute(sql.SQL(
            "UPDATE {} SET balance = balance - %s WHERE id = %s RETURNING id"
        ).format(name), (amount, source))
        if debit.fetchone() is None:
            raise ValueError("source missing")
        credit = conn.execute(sql.SQL(
            "UPDATE {} SET balance = balance + %s WHERE id = %s RETURNING id"
        ).format(name), (amount, target))
        if credit.fetchone() is None:
            raise ValueError("recipient missing")


def committed_balances(dsn: str, table: str) -> list[tuple[str, int]]:
    with psycopg.connect(dsn) as conn:
        return conn.execute(sql.SQL(
            "SELECT id, balance FROM {} ORDER BY id"
        ).format(sql.Identifier(table))).fetchall()


def test_transfer_commits_both_balances(database: tuple[str, str]) -> None:
    dsn, table = database

    transfer(dsn, table, "A", "B", 10)

    assert committed_balances(dsn, table) == [("A", 20), ("B", 15)]


def test_missing_recipient_rolls_back_the_debit(database: tuple[str, str]) -> None:
    dsn, table = database

    with pytest.raises(ValueError, match="^recipient missing$"):
        transfer(dsn, table, "A", "missing", 10)

    assert committed_balances(dsn, table) == [("A", 30), ("B", 5)]
```

The connection context commits on normal exit and rolls back on exception, then closes the
connection. The assertion opens a new connection, so it cannot observe uncommitted writes or
an ORM cache. See [Psycopg connection behavior](https://www.psycopg.org/psycopg3/docs/basic/usage.html#connection-context).

## TypeScript: real PostgreSQL with Vitest and Postgres.js

Save as `transfer.test.ts`. Requires `vitest` and `postgres`, plus the same explicit test URL.
The fixture owns setup and teardown; the operation owns its transaction. `sql.begin` supplies
a connection-scoped transaction and rolls back when the callback throws.
[Postgres.js transaction documentation](https://github.com/porsager/postgres#transactions).

```typescript
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { expect, test as base } from 'vitest';

type Database = { sql: Sql; table: string };

const test = base.extend<{ database: Database }>({
	database: async ({}, use) => {
		const url = process.env.QA_TEST_DATABASE_URL;
		if (!url) throw new Error('QA_TEST_DATABASE_URL is required');
		const sql = postgres(url, { max: 1 });
		const table = `balances_${randomUUID().replaceAll('-', '')}`;
		try {
			await sql`CREATE TABLE ${sql(table)} (id text PRIMARY KEY, balance integer NOT NULL)`;
			await sql`INSERT INTO ${sql(table)} VALUES ('A', 30), ('B', 5)`;
			await use({ sql, table });
		} finally {
			try {
				await sql`DROP TABLE IF EXISTS ${sql(table)}`;
			} finally {
				await sql.end();
			}
		}
	}
});

async function transfer(sql: Sql, table: string, source: string, target: string, amount: number) {
	await sql.begin(async (transaction) => {
		const debited = await transaction`
      UPDATE ${transaction(table)} SET balance = balance - ${amount}
      WHERE id = ${source} RETURNING id`;
		if (debited.length !== 1) throw new Error('source missing');
		const credited = await transaction`
      UPDATE ${transaction(table)} SET balance = balance + ${amount}
      WHERE id = ${target} RETURNING id`;
		if (credited.length !== 1) throw new Error('recipient missing');
	});
}

async function committedBalances(table: string) {
	const url = process.env.QA_TEST_DATABASE_URL;
	if (!url) throw new Error('QA_TEST_DATABASE_URL is required');
	const reader = postgres(url, { max: 1 });
	try {
		return Array.from(
			await reader<{ id: string; balance: number }[]>`
      SELECT id, balance FROM ${reader(table)} ORDER BY id`
		);
	} finally {
		await reader.end();
	}
}

test('transfer commits both balances', async ({ database: { sql, table } }) => {
	await transfer(sql, table, 'A', 'B', 10);

	expect(await committedBalances(table)).toEqual([
		{ id: 'A', balance: 20 },
		{ id: 'B', balance: 15 }
	]);
});

test('missing recipient rolls back the debit', async ({ database: { sql, table } }) => {
	await expect(transfer(sql, table, 'A', 'missing', 10)).rejects.toThrow('recipient missing');

	expect(await committedBalances(table)).toEqual([
		{ id: 'A', balance: 30 },
		{ id: 'B', balance: 5 }
	]);
});
```

**Catches:** forgetting to commit, updating only one balance, using the wrong amount, or
committing the debit before a later failure. **Bad replacement:** asserting two `UPDATE` calls
or inspecting the input account objects does not prove durable atomicity.

**Adapt:** import the real operation and create its schema with production migrations. These
examples include a minimal table and transfer function to make the tests executable; they do
not implement overdraft, currency, idempotency, or concurrent-transfer rules. For those contracts,
add representative setup and assertions, not extra private-method expectations. For ORM code,
close setup/session state and query through a fresh context after the real commit boundary.

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
