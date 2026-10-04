# Database tests

**What:** Writes, rollback, migrations, and queries with filters, joins, or required ordering.
**When:** A defect could lose, corrupt, expose, or omit stored records.
**Type:** Integration against the production database engine. A fake cannot establish SQL or rollback.

## A transfer commits both changes, or neither

### Good — Python

```python
# file: test_database_good.py
from db_fixture import database, transfer, committed_balances
import pytest

def test_transfer_commits_both_balances(database: tuple[str, str]) -> None:
    dsn, table = database
    transfer(dsn, table, "A", "B", 10)
    assert committed_balances(dsn, table) == [("A", 20), ("B", 15)]

def test_failure_rolls_back_the_debit(database: tuple[str, str]) -> None:
    dsn, table = database
    with pytest.raises(ValueError, match="^recipient missing$"):
        transfer(dsn, table, "A", "missing", 10)
    assert committed_balances(dsn, table) == [("A", 30), ("B", 5)]
```

### Bad — Python

```python
# file: test_database_bad.py
from db_fixture import database, transfer
import pytest

def test_transfer(database: tuple[str, str]) -> None:
    dsn, table = database
    assert transfer(dsn, table, "A", "B", 10) is None

def test_failure(database: tuple[str, str]) -> None:
    dsn, table = database
    with pytest.raises(ValueError, match="^recipient missing$"):
        transfer(dsn, table, "A", "missing", 10)
```

Returning normally does not prove a write. An exception does not prove rollback.

### Good — TypeScript

```typescript
// file: database.good.test.ts
import { expect } from 'vitest';
import { test, transfer, committedBalances } from './db_fixture';

test('transfer commits both balances', async ({ database: { sql, table } }) => {
	await transfer(sql, table, 'A', 'B', 10);
	expect(await committedBalances(table)).toEqual([
		{ id: 'A', balance: 20 },
		{ id: 'B', balance: 15 }
	]);
});

test('failure rolls back the debit', async ({ database: { sql, table } }) => {
	await expect(transfer(sql, table, 'A', 'missing', 10)).rejects.toThrow('recipient missing');
	expect(await committedBalances(table)).toEqual([
		{ id: 'A', balance: 30 },
		{ id: 'B', balance: 5 }
	]);
});
```

### Bad — TypeScript

```typescript
// file: database.bad.test.ts
import { expect } from 'vitest';
import { test, transfer } from './db_fixture';

test('transfer completes', async ({ database: { sql, table } }) => {
	await expect(transfer(sql, table, 'A', 'B', 10)).resolves.toBeUndefined();
});

test('failure rejects', async ({ database: { sql, table } }) => {
	await expect(transfer(sql, table, 'A', 'missing', 10)).rejects.toThrow('recipient missing');
});
```

The good tests read through new connections and catch partial commits. The bad tests pass even
if the debit remains after failure. For queries, seed matching and nonmatching rows and check
the complete expected records; see [missing-result examples](test-design.md).

## Runnable setup

Requires PostgreSQL, Psycopg 3 + pytest, or Postgres.js + Vitest. Set `QA_TEST_DATABASE_URL` to
an explicit disposable database. Each fixture owns one unique table and cleans it up.
In an application, create the schema with production migrations and import the real operation.
Keep setup, operation, and assertion connections separate; do not hide commits inside a test-wide
rollback transaction. Serialize tests sharing data; parallelize only with isolated data and cleanup.

```python
# file: db_fixture.py
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
```

```typescript
// file: db_fixture.ts
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { test as base } from 'vitest';

type Database = { sql: Sql; table: string };

export const test = base.extend<{ database: Database }>({
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

export async function transfer(
	sql: Sql,
	table: string,
	source: string,
	target: string,
	amount: number
) {
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

export async function committedBalances(table: string) {
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
```

These examples cover atomicity, not overdraft or concurrency rules. Preserve required reference
data during cleanup. Protect complex reads with focused tests; avoid duplicating simple repository
checks already exercised by a workflow. Test ORM reconstruction through its actual database contract.
[Psycopg](https://www.psycopg.org/psycopg3/docs/basic/usage.html#connection-context),
[Postgres.js](https://github.com/porsager/postgres#transactions).
