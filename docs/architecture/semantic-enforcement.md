# Semantic architecture enforcement

ADR 0007 defines the boundary. `pnpm test:architecture:semantic` checks project symbols across
TypeScript and Svelte script blocks. It supplements Chisel, topology, source, test-quality and UI
checks. A passing import check alone does not establish compliance.

The analyzer resolves project aliases with the TypeScript compiler and preserves Svelte source
locations. Its diagnostics contain the rule, file, line, column and resolved provenance. Use
`node --experimental-strip-types scripts/audit-architecture.ts --json` for machine-readable results.
The CLI exits with status 1 for violations. A missing local module or a syntax error is a failure,
not an empty result. No baseline, suppression comment or migration allowance hides findings.

## Rules and corrections

| Rule                      | Rejects                                                                                                                  | Correction                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `indirect-dependency`     | Prohibited behavior reached through aliases, barrels, namespace imports, wrappers or statically connected function ports | Put application operations in controllers; inject the narrow capability there |
| `public-service-helper`   | Exported service functions, callable objects and public members outside an implemented contract                          | Expose a cohesive class capability; keep implementation helpers private       |
| `service-interface`       | Public service classes without explicit interface contracts, including alias and default exports                         | Declare and implement the capability callers need                             |
| `concrete-dependency`     | Concrete implementations used as dependency types, including aliases, utility types and inferred factory results         | Use declared contracts at injection and public composition boundaries         |
| `controller-collaborator` | Controller results exposing services, transports, repositories or writable store APIs                                    | Return operation results or readonly state views                              |
| `retained-service-state`  | Mutable service fields, module state and captured state that survive an operation                                        | Move state to a store with an explicit lifetime                               |
| `store-workflow`          | Stores invoking capabilities or transport, directly or through traced callbacks                                          | Let a controller coordinate work and write the resulting state                |
| `factory-workflow`        | Factories executing capabilities, including operations inside returned callbacks                                         | Construct and connect dependencies; put execution in a controller             |
| `unresolved-source`       | Source or local modules the analyzer cannot inspect                                                                      | Repair the source or resolution; do not treat an incomplete scan as success   |

A type-only import does not turn a concrete class into an interface. `Pick<ConcreteService, ...>`
and an interface extending a concrete implementation still couple the caller to that implementation.
Factories must annotate their public results with interfaces; `satisfies` alone preserves an
inferred concrete type. Factories may expose interface-typed bundles for composition, but controller
operations may not return those collaborators to components.

## Valid ownership

Services may retain readonly references to injected collaborators and immutable configuration.
Local arrays, maps and private evaluators created for one operation remain local. A lookup table
initialized from fixed data and never mutated is configuration. A cache that changes across calls
is state even if the field reference is readonly. Stateless arrow methods and bound operation
objects are behavior, not mutable state.

Stores may expose controlled writes, readonly views and observer notifications. They must not
start provider calls, retries or application operations. Controllers can hold the explicit store
that owns their state. A component observes a readonly view rather than a concrete writable store.

Factories may construct implementations, call construction factories and connect interfaces.
Constructing an adapter whose deferred operation performs I/O is valid. Executing that operation
from the factory, or writing the workflow in a factory callback, is not.

## Static coverage and review

The analyzer follows resolved declarations and explicit constructor/function arguments, including
object-literal callback ports. It uses cycle guards, not a traversal depth cap. Controller operations
are deliberate component boundaries: the analyzer does not label a component's controller call as
service access merely because the controller uses services internally.

This is a deterministic check of supported source patterns, not a proof of all runtime behavior.
Reflection, computed runtime property names, arbitrary reassignment, external library internals,
and callbacks assembled dynamically still need review. Svelte scripts and their imports are
inspected; template-only expressions are not compiled into a complete Svelte type model. Type
checking remains a separate gate. Cohesive capabilities and whether a local calculation is a
business decision also need review; method names, line counts and branches do not prove ownership.

Add a rejecting fixture and a nearby valid fixture when extending a rule. Test renaming and
indirection, source locations, provenance and CLI status. Keep expected results independent of the
analyzer. Never fix a checker failure by moving a workflow into a wrapper or adding an allowance.

Existing application findings are recorded with the ADR 0007 refactor plan. That inventory is
evidence for migration, not input to the checker. Run all remaining architecture stages separately
when the chained command stops at a failure.
