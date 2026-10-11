# Application layers

Read the accepted ADRs before changing a capability. ADR 0007 defines the public service form,
state ownership and controller boundary. ADRs 0037 and 0041 define parsing and shared rules.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `models/<domain>/` | Data types, schemas, values and value constructors | Business rules or mutable runtime state |
| `services/<domain>/` | Shared pure rules in stateless classes with explicit interfaces | I/O, other services, workflows or retained mutable state |
| `server/services/<domain>/` | Server domain capabilities against narrow repository contracts, including the external providers they own | Other services, application orchestration or retained mutable state |
| `server/repositories/<domain>/` | Database persistence; domain types in and out, parsing the rows they read | Business rules, provider calls or orchestration |
| `client/services/<area>/` (browser) | Browser capabilities over IndexedDB repositories and stores, including the remote functions they own | Other services, orchestration or retained mutable state |
| `client/repositories/<area>/` (browser) | IndexedDB persistence; domain types in and out | Business rules, remote calls or orchestration |
| `controllers/<domain>/` | Complete browser operations and sequencing over browser services | Parsing external data, repository access, calling other controllers or exposing mutable collaborators |
| `server/controllers/<domain>/` | Complete server operations, transactions and sequencing over services | Parsing external data, repository access or leaking services through the public API |
| `stores/<domain>/` (browser only) | Reactive state with an explicit lifetime and controlled updates | Transport, retries, business decisions or workflows |
| `factories/`, `server/factories/` | Construction and dependency wiring with interface-typed results | Running application operations |
| Entry points: remote functions, API routes, form actions, hooks, the worker | Parsing incoming data into models and calling controller operations | Service, repository or store access |
| Components and adjacent TypeScript | Rendering, focus, DOM interaction and local form state | Service/remote/repository access or application workflows |

The browser and server share one architecture. The server is the browser's provider: the browser
service that owns an interaction calls the remote function and parses its result. The actor is
bound when the request's factory is built (`AppFactory.forActor`); no method takes an actor.

Browser components may obtain interface-typed capabilities from browser factories. Server factories
remain server-only. Controllers receive service capabilities through factory injection. They must not import or call
other controller operations, including through type-only contracts, getters, bound methods or
injected callbacks. Shared data contracts belong in models. Same-implementation private methods
may share orchestration; forwarding classes and renamed ports do not establish a new boundary.
The layer list is closed. Do not add a layer to satisfy a checker: if a service needs another
service, cut the capability differently.

Components invoke controllers for local and remote behavior and observe readonly application state.
An upload operation includes reservation, transfer and completion. Do not make a component assemble
those steps. Presentation controllers should return useful feature results; do not make one
controller per formatter.

A service names a cohesive capability. It explicitly implements the interface production callers
need. Private helpers may remain ordinary functions. Do not publish a helper for its test, create a
class per helper, or expose a broad implementation through `Pick<ConcreteClass, ...>`.

Readonly injected collaborators and immutable configuration are valid service fields. A readonly
Map is still mutable state if operations retain its contents. Temporary arrays, maps and evaluators
created and discarded within one operation are valid. The server is stateless: a value
one service produces for another stays local to the operation, and anything that outlives an
operation is a database record. Browser cross-call caches, subscriptions and generations belong in
a store scoped to their account or editor; caches the client needs from the server go through sync.

Services never call other services, including through injected function ports. A controller resolves
facts, calls shared decisions and coordinates consequences. Factories expose collaborator interfaces
needed by composition; they do not hand components raw resources, queues or transports.

Parse external values at a named boundary: the caller of a controller (remote function, API
route, form action, hook, worker), an agent tool for model-sent arguments, a repository for the rows it
reads, the service that owns a provider for that provider's responses, or browser event/storage readers. Schemas live in models. Services and controllers
receive narrow values and do not invoke Zod, except a service parsing its own provider's responses.

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

Entry points parse input and call controller operations; they may sequence several when the
request needs that order. The agent controller is a harness over an injected tool list and knows
no specific tool. A tool is an entry point: an agent tool factory turns one public controller
operation into a tool that parses its arguments, calls the operation and converts the result. It
never sequences operations or calls services; controllers and services do not know they back a tool.

Run `pnpm test:architecture:semantic` as well as Chisel. It follows symbol aliases, re-exports,
callable objects and statically connected callback ports. A service calling another service
through an injected function still violates ADR 0007. A factory callback that calls a controller
still owns a workflow. Construct the controller and expose its operation interface instead.

Readonly state views are valid operation results. Service instances, transports, queues and mutable
store APIs are collaborators, not results. An interface or utility type based on a concrete class
does not repair a dependency boundary. Declare the actual contract and annotate factory results.

Private evaluators created inside one operation and immutable configuration are valid. Retained
mutable fields, module caches and captured cross-call state are not allowed on the server. Test both sides of
each distinction. See `docs/architecture/semantic-enforcement.md` for analysis limits; do not infer
whole-application compliance from a passing check. Record unresolved findings without suppressions.
