# Database tests

**What:** Writes, rollback, migrations, and queries with filters, joins, or required ordering.
**When:** A defect could lose, corrupt, expose, or omit stored records.
**Type:** Integration against the production database engine. A fake cannot prove SQL or rollback.

## A transfer commits both changes, or neither

A starts with 30 and B with 5. Transferring 10 must commit balances of 20 and 15.
If the recipient is missing, A must still have 30. Read the balances through a new connection
after the operation; a successful return or an exception says nothing about committed data.

### Bad — checks completion without checking stored balances

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

The first test passes if no money moves. The second passes if A loses 10 before the missing
recipient causes an exception. Neither test reads the result that matters.

### Solution — read committed balances after success and failure

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

The success assertion catches missing writes. The failure assertion catches a debit left committed.
For queries, seed matching and nonmatching rows and compare the complete expected records;
see [missing-result examples](validation.md).

## Runnable setup

Use PostgreSQL, Psycopg 3, and pytest. Set `QA_TEST_DATABASE_URL` to an explicit disposable
database. Each fixture owns one unique table and cleans it up. In an application, create the
schema with production migrations and import its real operation.

Keep setup, operation, and assertion connections separate. A test-wide rollback transaction can
hide missing commits. Serialize tests sharing data; parallelize only with isolated data and cleanup.

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

These examples cover atomicity, not overdraft or concurrency rules. Preserve required reference
data during cleanup. Protect complex reads with focused tests; avoid duplicating simple repository
checks already exercised by a workflow. Test ORM reconstruction through its actual database contract.
[Psycopg connection contexts](https://www.psycopg.org/psycopg3/docs/basic/usage.html#connection-context).
