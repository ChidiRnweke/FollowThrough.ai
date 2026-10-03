# Test design

Use this reference for structure, fixtures, naming, parameterization, and independent expected
results. Citations refer to the [book](sources.md).

## One behavior, all meaningful outcomes

Use arrange, act, assert (AAA), or the equivalent given, when, then:

1. Arrange the scenario and the system under test (SUT).
2. Act on the behavior through its production-facing entry point.
3. Assert the meaningful outcomes against independently established expectations.

One behavior can produce several outcomes. The book explicitly rejects counting assertions
as a proxy for focus. Keep related outputs, state changes, and external effects together when
they describe the same action. Split tests that perform unrelated actions or tell separate
stories. (Ch. 3, §§3.1.1–3.1.5, pp. 42–47.)

Original language-neutral example:

```text
scenario: confirming a reservation uses its capacity
arrange: capacity = 5, requested places = 2
act: confirmation = reserve(requested places)
assert: confirmation is accepted
assert: remaining capacity is 3
```

Those assertions describe one successful reservation. Adding a cancellation and more
assertions would describe another action. An object comparison can make a cohesive result
easier to read, but do not pack unrelated claims together or hide assertions to evade a checker.

## Keep execution straightforward

- Avoid conditional branches in the test body. Separate alternative scenarios or use explicit
  parameter rows. A test should not choose which behavior it checks based on runtime output.
- Prefer one act for a unit test. A multi-call business operation may reveal that clients are
  responsible for maintaining an invariant the API should own. Examine the boundary; utility
  and infrastructure operations can legitimately need several steps.
- Several arrange/act/assert cycles usually indicate several behaviors. A narrow exception is
  an integration or end-to-end workflow where an unusually slow or rate-limited dependency
  makes splitting materially costly. Record that reason; convenience is insufficient.
- Distinguish the SUT from collaborators. `sut` is a useful name when the scenario has many
  participants; a clear domain name can also communicate its role.
- Separate sections with blank lines. Use AAA comments when larger sections make boundaries
  unclear; omit comments that merely repeat an obvious structure.

(Ch. 3, §§3.1.2–3.1.8, pp. 43–49; ch. 8, §8.5.4, pp. 204–205.)

In TDD, writing the expected assertion first can clarify intent. Otherwise, arranging the
scenario first is natural. The shape of the finished test matters more than authoring order.
(Ch. 3, §3.1.1, pp. 42–43.)

## Keep the expected result independent

Do not calculate the expectation by calling the SUT, using its formatter, or repeating the
algorithm being tested. A test and implementation with the same mistake can agree perfectly.
Use specific known examples, independently confirmed requirements, domain expertise, or a
separate trusted source. During a legacy refactor, captured legacy results can define a
characterization baseline; label that evidence rather than claiming a validated domain rule.
(Ch. 11, §11.3, pp. 264–266.)

For an external compatibility contract, independent literals are useful even when they
duplicate production constants. Sharing a serializer with the assertion would remove the
checkpoint that detects an unintended wire-format change. Share technical fixture mechanics,
not the computation that the test must verify. (Ch. 9, §9.1.2, pp. 222–224.)

Check complete relevant outcomes. Mere execution proves little. Avoid weak assertions such as
“every returned record belongs to the user” when an empty result would pass despite a required
record being missing. The assertion must reject the defect described by the scenario. This
empty-result example applies the book's warning about unverified outcomes. (Ch. 1, §1.3.3,
pp. 12–14.)

## Fixtures should reveal the scenario

Prefer small factory functions with explicit scenario-defining arguments. Reuse setup without
coupling tests through hidden mutable fields or shared defaults that affect unrelated cases.
Do not require readers to trace a constructor or a distant setup hook to discover important
facts. A compact direct setup needs no factory. (Ch. 3, §3.3, pp. 50–54.)

Extract technical details when arrange grows disproportionately large. Object Mother and Test
Data Builder are options, not requirements. A builder earns its cost only when its variation
and readability beat a simple factory. Start scenario helpers locally and share them when
there is meaningful reuse; do not insist that every helper live in a global fixtures directory.
(Ch. 3, §3.1.4, p. 45; ch. 10, §10.4.1, pp. 246–249.)

Fixture defaults may fill irrelevant valid details. Keep relevant facts visible and allow the
caller to specify them. A default must not conceal missing setup, invent a successful lookup,
or create state production cannot produce. That last constraint applies the book's
production-fidelity and scenario-readability principles. (Ch. 10, §§10.2.2, 10.4.1,
pp. 242–243, 246–249.)

Common resource lifecycle can live in a hook or shared fixture when every test needs it.
Database setup and cleanup are examples. Keep it distinct from scenario data. Unit tests
usually need no teardown because they leave no external resources; integration tests need an
explicit isolation strategy. (Ch. 3, §§3.1.6, 3.3, pp. 47, 50–54;
[Database testing](database-testing.md), ch. 10.)

## Names describe facts

Describe the behavior and condition in ordinary domain language:

```text
an expired invitation cannot be accepted
a confirmed reservation reduces available capacity
changing the contact address publishes the new address
```

Avoid rigid method/scenario/result templates when they expose implementation names or impair
reading. Utility code may reasonably use algorithm or method names because those names are
the client's vocabulary. Assert a fact rather than adding “should” everywhere. Adapt word
separators to the language and project; the book's underscore convention is not a universal
syntax requirement. (Ch. 3, §3.4, pp. 54–58.)

Group cases by the behavior they explain. A class-named group does not restrict the tested
behavior to that class. Multiple tests together describe a behavior's different scenarios.

## Parameterize when the cases remain clear

Use a case table for genuinely similar scenarios whose differing inputs and expected results
are self-explanatory. Each row remains a separate case. Do not hide different business stories
behind many flags or a generic test name. Give meaningful case labels where supported.
(Ch. 3, §3.5, pp. 58–62.)

Separate positive and negative cases when their meaning or assertion shape differs materially.
They can share a parameterized test when a reader can understand each row without deciphering
the implementation. Use a runtime data provider for values the framework cannot express as
inline data; that limitation is framework-dependent. Supply controlled time values rather than
introducing ambient current time through a data provider.

Fluent assertion libraries can improve readability, but an additional library is optional.
Prefer clear failure diagnostics and domain intent over a particular assertion syntax.
(Ch. 3, §3.6, pp. 62–63.)
