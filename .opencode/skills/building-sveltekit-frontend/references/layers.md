# Application layers

Read the accepted ADRs before changing a capability. ADR 0007 defines the public service form,
state ownership and controller boundary. ADRs 0037 and 0041 define parsing and shared rules.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `models/<domain>/` | Data types, schemas, values and value constructors | Business rules or mutable runtime state |
| `services/<domain>/` | Shared pure rules in stateless classes with explicit interfaces | I/O, other services, workflows or retained mutable state |
| `server/services/<domain>/` | Server domain rules against narrow repository/provider contracts | Other services, application orchestration or retained mutable state |
| `controllers/<domain>/` | Complete browser operations and coordination | Parsing external data or exposing mutable collaborators |
| `server/controllers/<domain>/` | Complete server operations, transactions and sequencing | Parsing external data or leaking services through the public API |
| `stores/<domain>/`, `server/stores/<domain>/` | State with an explicit lifetime and controlled updates | Transport, retries, business decisions or workflows |
| `factories/`, `server/factories/` | Construction and dependency wiring with interface-typed results | Running application operations |
| Components and adjacent TypeScript | Rendering, focus, DOM interaction and local form state | Service/remote/repository access or application workflows |

Browser components may obtain interface-typed capabilities from browser factories. Server factories
remain server-only. Controllers receive service capabilities through factory injection. They must not import or call
other controller operations, including through type-only contracts, getters, bound methods or
injected callbacks. Shared data contracts belong in models. Same-implementation private methods
may share orchestration; forwarding classes and renamed ports do not establish a new boundary. Boundary adapters
may implement controller-owned storage or transport contracts. This does not permit adapters or
stores to initiate application workflows. Shared write-input readers live under `adapters/`.

Components invoke controllers for local and remote behavior and observe readonly application state.
An upload operation includes reservation, transfer and completion. Do not make a component assemble
those steps. Presentation controllers should return useful feature results; do not make one
controller per formatter.

A service names a cohesive capability. It explicitly implements the interface production callers
need. Private helpers may remain ordinary functions. Do not publish a helper for its test, create a
class per helper, or expose a broad implementation through `Pick<ConcreteClass, ...>`.

Readonly injected collaborators and immutable configuration are valid service fields. A readonly
Map is still mutable state if operations retain its contents. Temporary arrays, maps and evaluators
created and discarded within one operation are valid. Put cross-call caches, promises, retry state,
subscriptions and generations in a store scoped to their account, editor, execution or process.

Services never call other services, including through injected function ports. A controller resolves
facts, calls shared decisions and coordinates consequences. Factories expose collaborator interfaces
needed by composition; they do not hand components raw resources, queues or transports.

Parse external values at a named boundary: remote inputs, database reads, provider/event adapters,
or browser event/storage readers. Schemas live in models. Services and controllers receive narrow
values and do not invoke Zod. A patch produces candidate JSON; a write-input reader validates its
shape before the controller invokes semantic rules.

For IndexedDB operations, preserve transaction-local read → controller decision → write. Moving the
decision outside the transaction loses cross-tab ordering. Keep record/outbox/receipt settlement
atomic. An account stop must prevent late results from repopulating its stores.

SvelteKit hooks and transports authenticate, validate at the boundary and invoke controllers.
Workspace routes use the browser shell and remote commands. Do not introduce a parallel loader or
REST contract for an operation already exposed through the controller/remote boundary.

Use colocated specs, shared `InMemory*` fakes and one expect per test. Run the type checker, lint,
architecture audits and relevant behavior tests. Current checker permissions are not an exception
to an accepted ADR; record unresolved violations and correct the implementation and checker.

## Checking indirect dependencies

Adapters may parse input, delegate one complete controller operation and serialize its result.
Independent protocol handlers can target different controllers. A single handler must not assemble
a workflow from controller operations, and moving a coordinator into an adapter does not fix it.

Run `pnpm test:architecture:semantic` as well as Chisel. It follows symbol aliases, re-exports,
callable objects and statically connected callback ports. A service calling another service
through an injected function still violates ADR 0007. A factory callback that calls a controller
still owns a workflow. Construct the controller and expose its operation interface instead.

Readonly state views are valid operation results. Service instances, transports, queues and mutable
store APIs are collaborators, not results. An interface or utility type based on a concrete class
does not repair a dependency boundary. Declare the actual contract and annotate factory results.

Private evaluators created inside one operation and immutable configuration are valid. Retained
mutable fields, module caches and captured cross-call state need a store owner. Test both sides of
each distinction. See `docs/architecture/semantic-enforcement.md` for analysis limits; do not infer
whole-application compliance from a passing check. Record unresolved findings without suppressions.
