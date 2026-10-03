# Integration testing

Write an integration test when the defect depends on real parts working together, such as
wiring, mapping, persistence, serialization, or dependency failure handling. State the actual
boundary exercised; directory names and class counts do not establish integration evidence.

## Pick the integration scenario

| Risk                                    | Exercise                                                             | Assert                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Parts are wired to the wrong dependency | Normal application construction and a meaningful workflow            | The required result through those real parts                           |
| Values are lost in mapping              | Real adapter with discriminating input values                        | Independently specified mapped result                                  |
| Outbound translation is wrong           | Workflow plus real translation/serialization up to an owned recorder | Exact required payload and contractual cardinality                     |
| Provider contract has drifted           | Real adapter against an appropriate provider test environment        | Provider-accepted behavior; disclose delivery limits                   |
| A dependency failure is misreported     | A valid reproducible failure at the relevant boundary                | Specified failure/recovery and consistent state; no prohibited effects |

## Build the scenario

1. Name the integration risk that a unit test cannot catch.
2. Choose the application workflow that reaches that boundary. Keep participating decisions,
   adapters, and translations real.
3. Classify the dependency surfaces below. Use the real managed dependency; record unmanaged
   outgoing effects at the last owned seam.
4. Establish isolated, production-producible data. Invoke the normal workflow once.
5. Verify managed state with an independent read. Verify the complete relevant external effects
   against independent contract values.
6. Report which dependencies were real and which were substituted.

| Surface   | How to recognize it                                                                  | Evidence                                      |
| --------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Managed   | The application owns state; other systems do not depend directly on its interactions | Real dependency and resulting state           |
| Unmanaged | Another system or person depends on the emitted interaction                          | Owned recorder and required external contract |

A private application database is normally managed; outbound mail is normally unmanaged. A
shared database can expose both kinds of surface. Out-of-process alone does not determine the
assertion style.

## Example: changing a contact address

```text
arrange:
  persist account-7 with old@example.test in the real test database
  create a fresh recorder at the owned outbound transport seam
act:
  change account-7's address to new@example.test through the application workflow
assert:
  a fresh database read returns new@example.test
  the recorder contains exactly the independently specified change message
```

This protects persistence and outbound translation. Replacing the serializer or checking only
an internal dispatcher call would omit part of that protection. Connecting to a real provider
is a separate compatibility test when provider acceptance is the missing evidence.

## Select more cases by the boundary risk

Start with a successful path that crosses the participating boundaries. Add another path when
it exercises a different integration assumption: constraints, mapping, transaction failure,
read filtering, or recovery. Keep most business-rule combinations in unit tests.

For failure cases, assert the required failure result and consistent remaining state, plus
absence of effects the failed operation must not emit. A happy path cannot establish rollback.
See [Database testing](database-testing.md).

Do not duplicate every unit scenario through expensive setup or impose a one-happy-path quota.
A failure may need no extra integration test when it is immediate, obvious on normal execution,
already protected at an adequate level, and cannot silently corrupt data. Recoverable, delayed,
and persistence-integrity failures need their own assessment.

## If the environment is unavailable

Run useful narrower tests and report the missing evidence. A fake-backed workflow can verify
application decisions, but does not replace the real integration. Do not manufacture a passing
default or claim persistence compatibility from a fake. Avoid building elaborate private-store
mocks to conceal unavailable infrastructure.

Follow the project's accepted architecture and interfaces. Favor explicit dependencies and
limited indirection; an interface does not eliminate a runtime cycle. Do not force a particular
layer count or remove established repository contracts to match these examples.
