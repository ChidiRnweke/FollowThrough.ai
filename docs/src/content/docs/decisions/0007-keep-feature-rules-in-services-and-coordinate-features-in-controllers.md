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
Svelte files, component-adjacent TypeScript files and indirect imports through re-exports.

| Layer       | Responsibility and boundary                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Models      | Describe data with types, values and schemas. They contain no business rules.                                                          |
| Services    | Implement a cohesive domain capability as a stateless class with a narrow public interface. They do not call or import other services. |
| Controllers | Expose complete application operations. They own sequencing, coordination and transaction boundaries.                                  |
| Stores      | Own application state and controlled state updates. They contain no business rules, transport calls or workflow orchestration.         |
| Components  | Render and handle UI interaction. They call controllers for application behavior and observe readonly application state.               |
| Factories   | Assemble concrete implementations and expose their narrow interfaces. They contain no business rules.                                  |

A service may hold readonly references to injected collaborators and immutable configuration.
Inputs, intermediate calculations and results remain local to each operation. Mutable state that
survives an operation belongs in a store, not in a service. Persisted domain records remain behind
repositories; this decision does not replace database persistence with application stores.

Public service APIs are class interfaces, not exported collections of helper functions. A public
method represents a capability a caller needs. Internal methods and helper functions remain
private to the implementation. A test does not justify making a helper public. Small helpers do
not need separate classes or interfaces of their own.

Controllers expose operations such as uploading an attachment or previewing an export, rather
than the steps callers would need to assemble those operations. Their public interfaces do not
expose services, transports, queues or mutable workflow internals. State that must survive a
controller call belongs in a store. A controller owns the transaction when results must commit
together; it also owns the sequence and failure handling when an operation crosses a network.

Components use controllers for both local and remote application operations. They do not import
services, repositories or remote transport functions. Rendering, focus, DOM interaction and local
form state remain component concerns. Readonly application state and model types may be exposed to
components without exposing the mechanisms that change that state.

[ADR 0041](../0041-share-domain-decisions-between-browser-and-server/) explains why browser and
server edits use the same domain rules. Those shared rules follow the service boundary above.
This revision governs layer boundaries where older examples, including widget examples in
ADR 0043, imply direct component-to-service access or public service functions. Their product
behavior remains unchanged by this decision.

We will keep these boundaries while controllers are the application's operation entry points.
A change to public service form, state ownership or component access requires an explicit revision
of this decision rather than a feature-specific exception.

## Consequences

- Domain capabilities have explicit names and contracts. Callers depend on the behavior they need.
- Workflows and transaction boundaries are visible in controllers and can be tested without a UI.
- Services can be reused without hidden state from earlier calls. Stores make state ownership explicit.
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
