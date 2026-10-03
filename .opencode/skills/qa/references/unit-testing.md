# Unit testing

Use this reference to choose a unit boundary and assertions. For structure and fixtures, read
[Test design](test-design.md). For substitutes, read [Test doubles](test-doubles.md).
Source citations refer to the printed pages of the [book](sources.md).

## A unit is behavior

A useful unit test checks one meaningful behavior, runs quickly enough for frequent feedback,
and is isolated from other tests. The behavior may span several classes or functions. Keeping
each class isolated is the London school's definition; the book favors the classical school's
isolation between tests. Do not call a test an integration test merely because it uses several
real in-memory collaborators. (Ch. 2, §§2.1–2.3, pp. 21–37.)

Identify the client and its goal. An operation or state is observable when it helps that client
achieve the goal. Public access alone does not make a method behavior worth testing. An internal
step can be public and still be an implementation detail. The client can be a user, another
system, or a higher-level application component. (Ch. 5, §§5.2–5.3, pp. 99–114.)

A failed test should describe a changed fact about that goal. Prefer checking that a purchase
reduces available inventory to verifying that an internal `removeInventory` method was called.
The same inventory abstraction can participate in many scenarios without requiring a separate
test for every method on its interface.

## Isolation and repeatability

| Dependency property | Meaning                                                              | Testing consequence                                             |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Shared              | Tests can change state that affects one another                      | Establish isolation; do not depend on order or leftovers        |
| Private             | A test has its own instance or cannot affect another test through it | Usually keep an inexpensive in-memory collaborator real         |
| Out of process      | Access leaves the application process                                | Account for execution cost, availability, and the real boundary |
| Volatile            | Needs special setup or can behave nondeterministically               | Make the relevant input or control explicit                     |

These properties overlap but are not synonyms. Mutable static state can be shared without
being out of process. A read-only external source can be private in the isolation sense while
still being slow or unavailable. A production singleton can have a fresh instance in each
test. Randomness can be private yet nondeterministic. (Ch. 2, §§2.1.2–2.2.1, pp. 27–34.)

- Give tests independent mutable state. A reusable factory should create fresh instances.
- Replace shared or volatile dependencies when needed for a fast, repeatable test. Classify the
  double's role; replacing a dependency does not make interaction assertions appropriate.
- Make time and similar hidden inputs explicit. Prefer a fixed value; read an injected clock
  at the operation boundary when a value cannot be supplied directly.
- If a real external dependency is sufficiently fast and stable, the book allows keeping it.
  Classify and describe the actual scope rather than forcing a label.

The time guidance comes from ch. 11, §11.6, pp. 271–273. Shared state and dependency decisions
come from ch. 2, pp. 27–34.

## Choose assertions by the outcome

**Output-based tests** check a returned decision or value. They work best when all inputs are
explicit and the operation has no hidden effects. They tend to need little setup and expose a
small API surface to assertions. **State-based tests** check observable state after an action,
including state on a real collaborator. Both are valuable. One test can use both styles when
they describe outcomes of one behavior. (Ch. 6, §§6.1–6.2, pp. 120–128.)

For a reservation, the returned confirmation and remaining capacity can be related outcomes.
Checking both in one test is valid. It does not follow that every resulting internal field
should be asserted. Choose the state that production clients depend on. (Ch. 3, §3.1.5, p. 47;
ch. 11, §11.2, pp. 263–264.)

State assertions may need more setup than output assertions. Shorten them with a meaningful
expected value or a reusable assertion helper when that preserves the scenario. Do not add
production equality behavior solely to shorten a test. Equality belongs on types that are
inherently values. (Ch. 6, §6.2.3, pp. 125–127.)

Communication assertions require a different justification: the effect must be externally
observable. They are not a substitute for checking internal results. See
[Test doubles](test-doubles.md). The book's later preference for boundary mocks in integration
tests assumes that business decisions and external orchestration have been separated; it is
not a naming rule for every test framework. (Ch. 5, pp. 110–116; ch. 9, §9.2.1, p. 225.)

## Spend effort where it protects behavior

Prioritize domain significance, decision complexity, and plausible regressions. Simple code
can be important: a short pricing rule may deserve more attention than a large mechanical
adapter. Complex utility algorithms can also be valuable targets. Avoid tests that merely
confirm assignments, trivial constructors, or getters unless they protect a meaningful
contract. (Ch. 1, §1.4.2, pp. 16–17; ch. 7, §§7.1–7.3, pp. 152–169.)

Test business preconditions such as rejecting negative stock. An internal safeguard with no
domain meaning does not automatically deserve its own test. Consider whether its failure
would be immediately obvious and whether a broader test already protects it. (Ch. 7, §7.3.3,
p. 169; ch. 8, §8.1.3, pp. 188–190.)

Use implementation knowledge to find overlooked cases, then assert their specified behavior.
Coverage can reveal an untested branch; it does not tell you whether the branch has a useful
assertion or justify a test of the branch's exact implementation. (Ch. 4, §4.5.2, pp. 89–90.)

## Investigate difficult setup

A large graph of collaborators or a complex chain of substitutes can signal mixed
responsibilities. Do not hide that signal by replacing every collaborator. Inspect whether
important decisions can be tested through a simpler boundary. Easy testability does not prove
good design, and hard setup does not itself authorize an architecture rewrite.
[Testability](testability.md) describes the available tradeoffs. (Ch. 1, §1.2, pp. 5–6;
ch. 2, §2.3.2, p. 35; ch. 7, §§7.1–7.2, pp. 152–167.)

Several classical tests can fail because one real collaborator has a defect. That cascade does
not imply several defects or justify mocking away all collaboration. Use the changed code and
the scenarios to locate the common cause. Frequent execution reduces the diagnostic search.
(Ch. 2, §2.3.3, p. 36.)
