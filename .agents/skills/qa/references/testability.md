# Testability

Use these remedies when valuable behavior needs excessive setup or internal overrides. Keep
production changes within the requested scope and the project's accepted architecture.

## Diagnose before adding abstractions

| Symptom                                              | First action                                                                        | Avoid                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| The decision reads ambient time or randomness        | Pass a fixed value; capture it once at the operation boundary                       | Shared static test clocks                       |
| Business rules mix with database/network work        | Gather facts, compute a decision, then apply effects                                | A double for every internal object              |
| Tests inspect private fields or invoke private logic | Assert the production-visible consequence; examine missing abstraction or dead code | Exposing internals solely for tests             |
| Setup needs a partial override of a concrete class   | Identify an owned effect seam or extract the decision                               | Production `isTest` switches                    |
| Interfaces/callbacks form a cycle                    | Return a decision to the caller where practical                                     | Assuming an interface removes a runtime cycle   |
| Every trivial class has a dedicated spec             | Find the important behavior already protected                                       | Adding tests to meet a count or coverage target |

Important decisions with few collaborators are good unit targets. Simple orchestration with
many collaborators benefits from focused integration tests. Important decisions mixed with
expensive collaborators merit a simpler boundary. Ease of testing does not itself prove a
good design.

## Refactor one decision boundary

Before:

```text
change contact address:
  read account from storage
  read current time internally
  decide whether the change is allowed
  mutate account and send a message from inside the decision code
```

After, when this separation fits the project:

```text
shell: load account and capture now
core: decideContactChange(account, requestedAddress, now)
      -> rejected(reason) | unchanged | changed(newAccount, contactChangedFact)
shell: persist an accepted change and translate its fact into an outbound message
```

Make the core's inputs explicit and return enough information that the shell applies the result
without inventing business rules. Keep related rules under one owner. Test the core's decisions
with output assertions and the shell's real persistence/translation with integration evidence.
An immutable change fact can describe a completed domain event; no event framework or new layer
is required. State-based domain logic is also valid—purity is a tool, not a condition of good code.

An eligibility query must not let execution bypass the rule: enforce the same precondition when
the operation runs. A private method that participates in a real production contract, such as
ORM reconstruction, still needs protection through that contract. Do not expose arbitrary
private state under that exception.

## Preserve runtime behavior and cost

| Option for conditionally needed external data           | Tradeoff                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Gather all facts before deciding                        | Simpler pure decision; potentially unnecessary I/O             |
| Query while deciding                                    | Less orchestration; harder isolation and broader test boundary |
| Return an intermediate decision and let the shell fetch | Explicit stages; more orchestration code                       |

Choose from actual performance and maintenance needs. Do not add a speculative layer, force
functional purity, or change a project's error contract just to simplify a test. A returned
failure or an exception must remain explicit and consistent with the accepted contract.

Use owned interfaces for useful boundaries, not imagined implementations or internal call
verification. Preserve project-accepted repository contracts and parsing ownership. A thin
wrapper around difficult framework/I/O work can leave decisions easy to test without importing
a particular directory layout, domain-object model, or prescribed TDD order.
