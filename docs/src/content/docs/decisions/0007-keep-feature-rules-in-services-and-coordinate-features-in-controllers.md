---
title: 'ADR 0007: Use stateless service classes and thin controller interfaces'
description: Give domain capabilities explicit names and keep application workflows behind narrow controller interfaces.
---

## Status

Accepted.

## Context

A domain capability needs a name, an owner and a clear contract. A collection of exported functions
can leave callers to decide which functions belong together and in which order to call them.
That spreads the meaning of an operation across its consumers. A class helps make that meaning
explicit only when its public interface is small and its implementation details are private.

Some user actions need several capabilities. Saving a note can repair anchors, update links and
refresh search. Uploading an attachment needs an upload reservation, a byte transfer and completion.
If a component assembles those steps, the workflow depends on that component. If a service calls
other services, the coordination is hidden inside a feature rule.

Mutable state creates another dependency: the result can depend on an earlier call. Giving that
state an explicit store makes its ownership visible. We chose classes to name domain capabilities
and control their public interfaces, not to hold mutable service state.

## Decision

We chose the following boundaries for the entire browser and server application. They apply to
Svelte files, component-adjacent TypeScript files and indirect imports through re-exports. The
list is closed: code belongs to one of these layers or to an entry point, and no other layer may
be introduced.

| Layer        | Responsibility and boundary                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models       | Describe data with types, values and schemas. They contain no business rules.                                                                                                   |
| Services     | Implement a cohesive domain capability as a stateless class with a narrow public interface, including any external provider it uses. They do not call or import other services. |
| Repositories | Persist and read domain records in local storage: the database on the server, IndexedDB in the browser. They take domain types in and return domain types.                      |
| Controllers  | Expose complete application operations. They own sequencing, coordination and transaction boundaries over services.                                                             |
| Factories    | Assemble concrete implementations and expose their narrow interfaces. They contain no business rules.                                                                           |
| Stores       | Browser only. Own reactive application state and controlled state updates, with no business rules, transport calls or orchestration.                                            |
| Components   | Browser only. Render and handle UI interaction. They call controllers and observe readonly application state.                                                                   |

Entry points call controllers: remote functions, API routes, form actions, server hooks, the
worker and agent tools. The entry point parses incoming data into a model before it calls a controller, and a
request that does not parse fails there; a user request receives a 422 response. An entry point
may call several controller operations in an order the request genuinely needs. It does not call
services, repositories or stores directly.

Controllers depend on services, never on repositories. A write always has business rules around
it, so the service that owns those rules owns the repository call. An external provider, such as an
embedding or language model, is not a repository: the service that owns the capability uses the
provider client the factory injects. Two bounded contexts keep separate services and repositories
even when their mechanism is the same, such as vector search over knowledge and over tools. If a service needs another
service, the capability boundary is wrong; the correction is a different cut, not an extra layer.

The server is stateless. A value that one service produces and another consumes stays local to
the operation that sequences them. Anything that must outlive an operation is a database record.
A cache that the client needs belongs to the client, through synchronization.

The agent is a harness. Its controller composes the agent runtime over an injected list of tools
and knows no specific tool; it applies approval, discovery, review and tool preferences from each
tool's metadata. A tool is an entry point, like a remote function. An agent tool factory turns one
public controller operation into a tool: the tool parses its arguments into a model, calls that
operation and converts the result into its output. It does not sequence operations or call
services, repositories or stores. When a tool needs an operation no controller offers, that
operation becomes an ordinary controller operation any entry point could call, not a tool-specific
one. Controllers and services do not know that a tool calls them. The harness holds no transaction
while a tool runs, so each tool's operation commits on its own. Factories, including tool factories,
only construct and connect; a tool's call runs in the harness.
`docs/architecture/agent-harness.md` describes how the harness, its services and the tool
factories connect.

The browser follows the same rules with fewer layers in use. A component is the browser's entry
point. A remote function is already the server controller behind boundary parsing and error
handling, so a component calls it directly for an operation that only the server performs, such as
moving a project entry or deleting a note permanently. A browser controller exists only where the
browser itself sequences work: the local-first workspace (its IndexedDB replica, durable outbox,
synchronization and conflict review, ADR 0040), and flows such as uploads, exports, agent chat and
editor sessions. A browser controller never wraps a remote function on its own and never calls
another controller; a component that needs both a server operation and the workspace calls each.
Browser services under `src/lib/client/services/` own the workspace's storage
(`src/lib/client/repositories/`, IndexedDB) and parse the server's answers to the workspace's
synchronization functions. The workspace is the only writer of the replica: every local edit goes
through its outbox, and a change made directly on the server is followed by a workspace refresh
before the caller continues.

The actor is part of the request, not of an operation. The entry point builds the controller
factory for the actor it authenticated, and that factory binds the actor into every controller,
service and repository it constructs. No interface or method takes an actor. A caller without a
request builds the factory for the user it acts for, such as a run's owner or a token's user.
Work across all users, such as recovering interrupted runs, uses a separate system composition
that enumerates users and builds each one's factory; there is no optional or default actor.

A service may hold readonly references to injected collaborators and immutable configuration.
Inputs, intermediate calculations and results remain local to each operation. Mutable state that
survives an operation is a database record on the server and belongs in a store in the browser.

Public service APIs are class interfaces, not exported collections of helper functions. A public
method represents a capability a caller needs. Internal methods and helper functions remain
private to the implementation. A test does not justify making a helper public. Small helpers do
not need separate classes or interfaces of their own.

Controllers coordinate service capabilities, not other controllers. This includes controller
operations supplied through type-only interfaces, getters, bound methods and injected callbacks.
Private methods within one controller implementation may share orchestration. Shared data types
belong in models; changing a contract's name or location does not change its implementation's owner.

Controllers expose operations such as uploading an attachment or previewing an export, rather
than the steps callers would need to assemble those operations. Their public interfaces do not
expose services, transports, queues or mutable workflow internals. A controller owns the transaction when results must commit
together; it also owns the sequence and failure handling when an operation crosses a network.

Components call browser controllers for local operations and remote functions for server-only
operations. They do not import services or repositories, and they do not wrap a remote function in a
controller of their own. Rendering, focus, DOM interaction and local
form state remain component concerns. Readonly application state and model types may be exposed to
components without exposing the mechanisms that change that state.

[ADR 0041](../0041-share-domain-decisions-between-browser-and-server/) explains why browser and
server edits use the same domain rules. Those shared rules follow the service boundary above.
This revision governs layer boundaries where older examples, including widget examples in
ADR 0043, imply direct component-to-service access or public service functions. Their product
behavior remains unchanged by this decision.

We will keep these boundaries while controllers are the application's operation entry points.
A change to the layer list, public service form, state ownership or component access requires an
explicit revision of this decision rather than a feature-specific exception.

## Consequences

- Domain capabilities have explicit names and contracts. Callers depend on the behavior they need.
- Workflows and transaction boundaries are visible in controllers and can be tested without a UI.
- Services can be reused without hidden state from earlier calls. The server can run as several
  processes, because no operation depends on memory another operation left behind.
- Tools add no vocabulary to services or controllers. Adding a tool changes one agent tool factory.
- Classes, interfaces and dependency construction require more wiring than exported functions.
- A class with many unrelated public methods still violates the boundary. Naming alone is not enough.
- Existing public helpers and broad store APIs need migration. Tests must exercise public behavior
  rather than preserve internal exports for convenience.

## Evidence

- `src/lib/server/controllers/notes/controller.ts` and
  `src/lib/server/controllers/suggestions/controller.ts` coordinate cross-feature writes.
  Their tests exercise transactions and failure outcomes.
- Known violation: `src/lib/services/widgets/edits.ts` exposes domain rules as functions, and
  `src/lib/components/widgets/widget-json-editor.svelte` assembles parsing, change calculation and
  preview application. Those operations need service and controller interfaces.
- Known violation: `src/lib/components/attachments/attachment-list.svelte` sequences reservation,
  HTTP upload, completion and synchronization. `src/lib/components/notes/export/export-dialog.svelte`
  sequences rendering and remote export operations.
- Known violation: `WorkspaceSession` exposes the concrete `WorkspaceResources` class from
  `src/lib/stores/workspace/`. Its public surface includes internal observation callbacks and
  preparation methods. `src/lib/stores/agent/chat.svelte.ts` exposes writable workflow state.
- Enforcement gap: `patches/@chidirnweke__chisel-js@0.2.1.patch` explicitly permits components and
  stores to import shared services. The installed service-interface check examines only classes
  whose names end in `Service`; it does not reject exported service functions.

These observations identify gaps against the accepted decision. Passing the current checks does
not establish compliance. Migration progress and enforcement work belong in the implementation
plan, not in this ADR's acceptance status.
