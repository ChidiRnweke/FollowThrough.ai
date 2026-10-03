# Database testing

Use this reference for tests whose protection depends on real persistence behavior. Read
[Integration testing](integration-testing.md) for scenario selection. Citations refer to the
[book](sources.md).

## Use a faithful managed dependency

For an application-private database, verify resulting persisted state through the real
database, not repository call expectations. A database consumed directly by other systems can
also expose an unmanaged contract; classify that surface separately. (Ch. 8, §8.2,
pp. 190–193.)

Use the production database system when testing its queries, constraints, mappings, and
transaction behavior. Replacing it with a different engine can both reject valid behavior and
miss production defects. The book recommends the same DBMS vendor, allowing some version or
edition differences. Assess those differences against the capabilities the scenario relies on;
vendor identity alone does not prove fidelity. (Ch. 10, §10.3.3, p. 246.)

The durable concern is behavioral fidelity, not whether storage is described as “in memory.”
An in-memory fake or a different engine cannot establish production persistence semantics.
If a test uses an embedded implementation, identify which production capabilities it actually
exercises and which still need real-system evidence. This qualification applies the book's
production-consistency rationale; it does not endorse a particular substitute.

## Make schema and required data reproducible

- Keep schema evolution in source control with the application. A separately maintained model
  database creates a competing source of truth and makes historical defects hard to reproduce.
- Version required reference data with the schema. Reference data must exist and is not
  modified by normal application operations; ordinary user data is different. A table can hold
  both if their ownership is explicit.
- Give each developer or independent test environment its own database instance. Do not let
  one person's schema or data changes affect another person's test results.
- Apply migrations to build the test database. Preserve required reference data during scenario
  cleanup. Do not manually patch a test database and assume the resulting suite validates the
  committed schema.

(Ch. 10, §§10.1.1–10.1.3, pp. 230–232.)

Migration-based delivery records transitions; state-based delivery records a target schema and
uses comparison tooling to derive changes. The book favors explicit migrations once production
data requires domain-specific transformations. Disposable pre-release data can change that
tradeoff. Add corrective migrations for already-delivered history rather than rewriting it.
The book notes a data-loss exception, but it is not permission to rewrite migrations already
applied elsewhere: investigate their delivery state and the project's recovery process first.
(Ch. 10, §10.1.4, pp. 232–234.)

## Reproduce the operation's transaction boundary

Correlated writes must commit together or leave the state unchanged when the operation cannot
complete. A test using one transaction per repository call can miss that business guarantee.
Keep data access distinct from the decision to commit the operation. Use the project's
transaction or unit-of-work abstraction rather than prescribing a specific ORM or runtime.
(Ch. 10, §10.2.1, pp. 235–241.)

Where persistence tracks changes, a unit of work can collect them and apply them atomically at
the end of the operation. It can shorten a database transaction and reduce contention, but
does not remove the need for atomicity. Test the production consistency guarantee, not the
existence of a particular abstraction.

Use separate persistence contexts for arrange, act, and assert:

```text
arrange: persist valid starting records, then close the setup context
act: invoke the workflow with its normal operation context and commit boundary
assert: open a fresh read context and inspect the committed result
```

Do not reuse tracked entities or an ORM identity cache as proof of persisted state. Do not wrap
the entire test in an uncommitted outer transaction when that changes the operation's normal
commit visibility. The book recommends at least three contexts or units of work, one per AAA
section. That protects independent observation; it does not require exactly three connections
or simultaneous physical database transactions in every persistence API.
(Ch. 10, §10.2.2, pp. 242–243.)

For a failed operation, independently inspect the state that must remain consistent. Successful
writes alone do not establish rollback behavior. This is an application of the chapter's
atomicity requirement, not an additional fixed quota of failure tests.

Non-relational stores have different atomicity boundaries. The book discusses document stores
with single-document atomicity and aggregates. Derive the test from the actual store's
guarantees; do not generalize that example into a ban on all multi-record workflows.
(Ch. 10, §10.2.1, pp. 241–242.)

## Establish clean state before each scenario

Each test establishes what it needs, independent of earlier tests or interrupted runs. The book
prefers deleting regular test data at the start of each scenario:

| Strategy                                        | Risk or cost                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Restore a database backup each time             | Can add substantial setup time                                      |
| Clean only after the test                       | Interruption can leave data for the next run                        |
| Roll back one transaction around the whole test | Can change production transaction semantics                         |
| Clean at the start, then seed the scenario      | Tolerates interrupted previous runs while preserving normal commits |

(Ch. 10, §10.3.2, pp. 244–245.)

Scope deletion to the disposable test environment and its scenario data. Preserve migrations
and required reference rows. Respect foreign-key order and leave constraints enabled. The
book suggests explicit deletion SQL as a simple default; a base class is its C# example, not
the only valid lifecycle mechanism. A fresh isolated database is another way to establish
state, with a different setup cost.

## Choose concurrency after isolation

When tests share mutable database state, sequential execution is the book's practical default.
Parallel tests need independent state, constraints, cleanup ownership, and enough database
capacity. Unique record identifiers alone may not isolate queries or global state. The book
allows per-test containers when their speed benefit justifies image, scheduling, and lifecycle
cost; it does not reject hosting a shared test instance in a container.
(Ch. 10, §10.3.1, pp. 243–244.)

Do not invent a requirement that every test start a container or that every integration suite
run sequentially. Establish isolation first, measure the relevant runtime cost, and choose the
simplest lifecycle that preserves the tested guarantees.

## Keep scenarios readable

Extract connection mechanics, context disposal, fixture insertion, and query helpers when they
obscure the business scenario. Keep defining facts and expected results visible. Prefer small
factory functions before elaborate builders. Keep helpers local until meaningful reuse
justifies sharing; shared lifecycle code should not accumulate unrelated scenario factories.
(Ch. 10, §10.4, pp. 246–252.)

An act helper can create the normal operation context and invoke a supplied workflow. An assert
helper can perform an independent read. Neither should share the production algorithm that
calculates the expected result. Extra short-lived contexts can be worth their runtime cost when
they improve independence and clarity; count actual costs before optimizing them away.

## Choose persistence coverage by consequence

Writes have a low threshold for testing because defects can corrupt durable state. Test reads
selectively when their complexity or importance provides useful protection; do not interpret
that prioritization as “never test reads.” Important filtering, mapping, and ownership behavior
can be visible only through a real query. (Ch. 10, §10.5.1, pp. 252–253.)

Prefer broader workflow integration tests when they already exercise the repositories and
mappings. The book discourages a separate suite for simple repositories because it duplicates
cost and protection. Assess marginal value rather than enforcing a universal prohibition:
complex query behavior or a distinct persistence contract can justify focused integration
coverage. That last qualification is a risk-based application of the book's value criteria.
Pure complex mapping algorithms can be tested independently; ORM behavior usually still needs
real database evidence. (Ch. 10, §10.5.2, pp. 253–254; ch. 4, pp. 68–86.)

Behavior-focused integration tests can protect large refactors such as replacing an ORM. Their
value depends on independent resulting-state assertions, not snapshots of generated SQL.
(Ch. 10, §10.6, pp. 254–255; ch. 4, §4.4.4, pp. 83–84.)
