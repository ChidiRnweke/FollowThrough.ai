# Semantic architecture enforcement

ADR 0007 defines the boundary. Chisel's `architecture:*` rules check project symbols across
TypeScript and Svelte script blocks, alongside its import-boundary, source, test and design-system
rules. A passing import check alone does not establish compliance.

The analyzer resolves project aliases with the TypeScript compiler and preserves Svelte source
locations. Its diagnostics contain the rule, file, line and resolved provenance. Use
`pnpm exec chisel-js check . --json` for machine-readable results. The CLI exits with status 1 for
violations. A missing local module or a syntax error is a failure, not an empty result. No baseline
or migration allowance hides findings. The agent tools folder and the worker entry points come from
`chisel.config.json` (`agent.tools`, `entryPoints`).

ADR 0007 closes the layer list: models, services, repositories, controllers and factories, plus
browser stores and components, called from entry points. There is no adapters layer and no server
store. Chisel rejects code under `src/lib/server/adapters/` or `src/lib/server/stores/` with
`structure:unknown-server-folder`.

## Rules and corrections

| Rule                                    | Rejects                                                                                                                                                                                              | Correction                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `architecture:indirect-dependency`      | Prohibited behavior reached through aliases, barrels, namespace imports, wrappers or statically connected function ports; entry points and remote functions calling services, repositories or stores | Put application operations in controllers; inject the narrow capability there                                        |
| `architecture:public-service-helper`    | Exported service functions, callable objects and public members outside an implemented contract                                                                                                      | Expose a cohesive class capability; keep implementation helpers private                                              |
| `architecture:service-interface`        | Public service classes without explicit interface contracts, including alias and default exports                                                                                                     | Declare and implement the capability callers need                                                                    |
| `architecture:concrete-dependency`      | Concrete implementations used as dependency types, including aliases, utility types and inferred factory results                                                                                     | Use declared contracts at injection and public composition boundaries                                                |
| `architecture:controller-orchestration` | Controllers invoking other controllers through interfaces, aliases, getters or callbacks                                                                                                             | Coordinate the underlying service capabilities in the owning controller                                              |
| `architecture:controller-repository`    | A controller calling a repository, directly or through an injected port typed as one                                                                                                                 | Put a service between the controller and the repository; the service owns the reads and writes                       |
| `architecture:controller-collaborator`  | Controller results exposing services, transports, repositories or writable store APIs                                                                                                                | Return operation results or readonly state views                                                                     |
| `architecture:retained-service-state`   | Mutable service fields, module state and captured state that survive an operation                                                                                                                    | Move state to a store with an explicit lifetime                                                                      |
| `architecture:store-workflow`           | Stores invoking capabilities or transport, directly or through traced callbacks                                                                                                                      | Let a controller coordinate work and write the resulting state                                                       |
| `architecture:factory-workflow`         | Factories executing capabilities, including operations inside returned callbacks                                                                                                                     | Construct and connect dependencies; put execution in a controller                                                    |
| `architecture:tool-operation`           | An agent tool factory (`src/lib/server/factories/agent/tools/`) calling a service, repository or store instead of a controller operation                                                             | Wrap the public controller operation the tool stands for; give the controller an ordinary operation when none exists |
| `architecture:unresolved-source`        | Source or local modules the analyzer cannot inspect                                                                                                                                                  | Repair the source or resolution; do not treat an incomplete scan as success                                          |

A type-only import does not turn a concrete class into an interface. `Pick<ConcreteService, ...>`
and an interface extending a concrete implementation still couple the caller to that implementation.
Factories must annotate their public results with interfaces; `satisfies` alone preserves an
inferred concrete type. Factories may expose interface-typed bundles for composition, but controller
operations may not return those collaborators to components. A controller interface is not a
permitted controller dependency. Private calls within the same controller implementation remain
valid. Chisel also rejects type-only controller-to-controller imports.

A controller's dependencies are services. The audit follows a controller's calls through private
helpers and injected callbacks, and stops at a service: what a service calls is that service's own
concern. A provider client is not a repository; it lives in the service that owns it (ADR 0007),
so a controller reaches object storage through its service like any other.

## Valid ownership

Services may retain readonly references to injected collaborators and immutable configuration.
Local arrays, maps and private evaluators created for one operation remain local. A lookup table
initialized from fixed data and never mutated is configuration. A cache that changes across calls
is state even if the field reference is readonly. Stateless arrow methods and bound operation
objects are behavior, not mutable state.

Stores may expose controlled writes, readonly views and observer notifications. They must not
start provider calls, retries or application operations. Controllers can hold the explicit store
that owns their state. A component observes a readonly view rather than a concrete writable store.

The composition root (`src/lib/server/application.ts`) is a factory: it constructs and connects,
and it never executes an operation. Process and request entry points form the `entry` layer:
`src/hooks.server.ts`, `src/worker.ts` and server route handlers (`+server.ts`, `*.server.ts`).
Remote functions follow the same rule. An entry point is the outermost caller. It may call several
controller operations in an order the request genuinely needs, such as startup recovery. It must
not call services, repositories or stores directly; `indirect-dependency` reports such a call, and
the correction is a controller operation that owns it.

Factories may construct implementations, call construction factories and connect interfaces.
Constructing a service whose deferred operation performs I/O is valid. Executing that operation
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

The application has no recorded findings: every rule passes at zero. Run all remaining architecture
stages separately when the chained command stops at a failure.
