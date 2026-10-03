# Testability

Use this reference when valuable behavior is difficult to test, setup is excessive, or code
mixes decisions with effects. It supplies diagnostic options; it does not authorize a broad
production refactor. Citations refer to the [book](sources.md).

## Separate value from setup cost

Classify code using complexity or domain significance against collaborator cost:

| Code                                                         | Typical test decision                   |
| ------------------------------------------------------------ | --------------------------------------- |
| Important decisions or complex algorithms, few collaborators | Strong unit-test targets                |
| Trivial behavior, few collaborators                          | Usually little marginal value           |
| Simple orchestration, many collaborators                     | Focused workflow integration coverage   |
| Important decisions mixed with many collaborators            | Investigate a simpler decision boundary |

Complexity includes decision points and sometimes significant behavior delegated to libraries.
Domain significance is independent: a short monetary rule can be important. Mutable and
out-of-process collaborators increase setup cost; immutable values do not carry the same cost.
One or a few in-process collaborators do not automatically make code overcomplicated.
(Ch. 7, §§7.1, 7.5, pp. 152–158, 178–180.)

Difficulty testing can reveal coupling. Ease of testing is not proof of good design. Replacing
every collaborator may hide an expensive dependency graph without improving it.
(Ch. 1, §1.2, pp. 5–6; ch. 2, §2.3.2, p. 35.)

## Extract decisions from difficult effects

The Humble Object pattern puts meaningful decisions in a testable component and leaves a thin
wrapper to coordinate a difficult boundary such as a framework, UI, concurrency, or external
I/O. Keep complexity and a large collaborator graph out of the same component where practical.
(Ch. 7, §7.1.2, pp. 155–158.)

The book's refactoring sequence makes hidden dependencies explicit, moves external work into
application orchestration, removes reconstruction complexity from that orchestration, and gives
related business decisions a coherent owner. Do not stop at an interface over a database and
assume the design issue is solved. An interface still represents external data and still costs
effort to substitute correctly. (Ch. 7, §7.2, pp. 158–167.)

Apply this to the project's architecture. Some projects put behavior on domain objects; others
put pure rules in services and keep models as data. Preserve accepted ownership and parsing
boundaries. The goal is coherent decisions and observable effects, not importing the book's
directory names or adding another layer.

## Functional decisions with an imperative shell

A pure decision has explicit inputs and a returned result, with no mutable hidden input or
hidden side effect. A call can be replaced by its result without changing program behavior
(referential transparency). Reading ambient time, querying a database, mutating internal state,
or throwing along an undeclared path breaks the book's mathematical-function model.
(Ch. 6, §6.3.1, pp. 128–132.)

This mathematical model explains hidden execution paths; it does not ban exceptions or require
changing a project's error contract merely to call an operation pure.

Separate the phases:

1. The shell gathers the facts.
2. The core computes a decision.
3. The shell applies the decision's effects.

Return enough information that the shell need not invent another business decision. Use output
tests for the core and a smaller set of real integration checks for the shell. Immutable values
can protect validated state from later mutation. Hexagonal architecture also separates domain
and external work, but permits internal domain state changes; it need not make every operation
mathematically pure. (Ch. 6, §§6.3.2–6.3.3, pp. 132–134.)

The audit-file example moves file access out of the decision-maker and returns update
instructions. That illustrates the separation, not a requirement to first introduce mocks or
adopt its exact instruction type. Keep boundary transformations in the layer that owns them
under the project's rules. (Ch. 6, §6.4, pp. 135–146.)

## Balance simplicity, testability, and runtime cost

If a lookup is needed only after a decision, gathering all data upfront may waste external
calls. The book describes three strategies:

| Strategy                                             | Main cost                               |
| ---------------------------------------------------- | --------------------------------------- |
| Fetch all inputs before deciding                     | May perform unnecessary I/O             |
| Let decision logic query external dependencies       | Loses a pure, inexpensive test boundary |
| Split decisions into stages coordinated by the shell | More orchestration complexity           |

Choose from the actual performance and maintenance needs. A fully functional design adds code
and may not repay its cost for simple or low-significance behavior. Output and state tests can
coexist. Avoid purity at any price. (Ch. 6, §6.5, pp. 147–149;
ch. 7, §7.4, pp. 169–172.)

A `CanExecute`/`Execute` design can expose eligibility without moving the business rule into
the controller. Have execution enforce the same precondition so callers cannot bypass it.
Use a meaningful result type for the decision. This helps when facts are available in memory;
external uniqueness checks or failures may still need orchestration and integration coverage.
A branch that merely applies a resolved decision is different from one that invents the rule.
(Ch. 7, §§7.4.1, 7.5, pp. 172–174, 178–179.)

## Represent meaningful changes before dispatch

A domain event records a meaningful completed business fact. Make it immutable and name it as
a past event. Record it only when the change occurs; orchestration can translate it into an
external message. Test event creation as part of decision behavior and external dispatch at the
integration boundary. Avoid a message-bus dependency in the decision-maker solely to announce
the change. (Ch. 7, §7.4.2, pp. 175–178.)

Event base classes, dispatch frameworks, collections, and merging are optional implementation
choices. Their presence is not a prerequisite for testable code. Unconditional private
persistence can preserve behavior while repeated external notifications violate a contract;
consider persistence performance separately from externally visible correctness.

## Keep boundaries visible

Use a clear home for domain decisions, limit unnecessary indirection, and reduce runtime
cycles. Interfaces do not erase runtime callbacks or their cognitive cost. Returning a value
can let a caller continue without a reverse dependency. Avoid adding interfaces for imagined
future implementations or merely to verify internal calls. Respect interfaces with a real
project-level purpose. (Ch. 8, §§8.4–8.5, pp. 197–204.)

Inside-out TDD can build decisions before orchestration; outside-in TDD can specify a client's
needs before collaborators exist. The book associates those tendencies with classical and
London testing. They are choices, not compulsory development sequences, and neither excuses
brittle assertions about internal wiring. (Ch. 2, §2.3.4, pp. 36–37.)

## Hidden behavior and test-only production changes

- Exercise private implementation through its production-visible behavior. If important logic
  is hard to reach, investigate a missing abstraction. If it is unused, investigate dead code.
- A private member may implement a real production contract, such as ORM reconstruction. Test
  that contract and preserve its invariants; private access alone does not make it irrelevant.
  The book discusses exposing a valid constructor or using the ORM-like reflection path as
  narrow alternatives.
- Do not expose private state only for assertions. Verify its consequences through surfaces
  production actually uses.
- Avoid production `isTest` switches and partial overrides of concrete classes. A necessary
  behavior-free boundary interface is a tradeoff with less runtime risk than a test-only branch.

(Ch. 11, §§11.1–11.5, pp. 260–271.)

For time, prefer a supplied instant. If a clock service is needed, capture time at the business
operation boundary and pass the value inward. Shared static test clocks hide dependencies and
couple tests. This is a preference for explicit facts, not a ban on clock abstractions.
(Ch. 11, §11.6, pp. 271–273.)
