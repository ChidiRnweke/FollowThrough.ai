# Controller tracing and scheduled task startup

This assesses W25.05 and W26.04 under ADRs 0029 and 0032. Provider/tool tracing, trace inspection,
configuration loading and shutdown of independent background agent runs retain their separate IDs.

## Controller boundary ownership

ProductionControllerFactory constructs each public controller behind instrumentedController.
controllerSurfaces explicitly classifies every declared capability; its type rejects a true entry
for a synchronous method. The proxy binds calls to the original instance and caches wrapped public
methods. Internal calls keep their original behavior and do not add another boundary span.

The facade starts the domain.method operation before invoking the method. Work before its first await
therefore inherits the controller span. It emits an info entry and a debug completion/duration under
the configured log level. DomainError failures are warnings; unexpected failures are errors. Both
are rethrown to the caller. A declared asynchronous capability that throws synchronously is still
inside the boundary. Synchronous helpers remain synchronous and are not experimentally invoked to
find out their type.

Controller spans use kind:null. They remain in the OpenTelemetry trace stream but carry no
OpenInference span kind, so the collector does not present them as separate Phoenix workflows.
Ordinary operations continue to carry their configured kind or CHAIN. Telemetry formatting marks
unserializable or shortened values explicitly; it does not claim complete payload capture.

## Incorrect cancellation classification

The shared span recorder treated any Error whose message contained "aborted" as expected cancellation.
A PostgreSQL-style "current transaction is aborted" failure was consequently recorded with OK status
and cancelled output. It was still rethrown, but the trace mislabeled the operation.

Classify cancellation from AbortError identity or the actual OpenAI APIUserAbortError class instead
of arbitrary message text. The provider SDK's abort class does not set Error.name to its class name,
so a name-only replacement would lose valid provider cancellation. Four tests run real NodeSDK spans
through an in-memory exporter: operation and workflow transaction failures retain ERROR status,
while native and provider aborts retain cancelled output. Both transaction-error tests fail before
the correction. No live provider or collector request is needed.

## Scheduled task startup ownership

Application.backgroundTasks assembles indexing maintenance, expired-upload reclamation and attachment
processing. The worker hydrates configuration, creates the production application and starts the
scheduler with runOnStart:true. The web entry creates no scheduler. Each task has its own timer; the
next interval starts after the current tick settles, not while it is running. Failure records an
error span and log, then permits the next tick. A slow or failed task does not block other tasks.

The scheduler owns timer cancellation and its in-flight set. stop prevents future scheduling, clears
pending timers and awaits active ticks. Worker shutdown then flushes telemetry through the shared
coordinator reviewed in [process shutdown ordering](process-telemetry-shutdown.md). These are process
execution contracts; each task remains responsible for durable discovery, claims and per-item retry.
Starting two worker processes is not made safe merely by non-overlap within one scheduler.

## Test dispositions and limits

Retain the controller tests for entry ordering, constructor binding, internal calls, synchronous
helpers, domain/unexpected failures and parentage before the first await. Retain ordinary-operation
span kind and controller-kind exclusion. Add the four cancellation-classification regressions.
Retain all nine scheduler cases for initial delay/eager start, ticking, rescheduling, non-overlap,
failure continuation, independent tasks, cancelled timers and drain. Existing telemetry tests keep
log-level policy, formatting and workflow-context behavior. Observed gate results are recorded in the PR.

This assessment establishes local instrumentation and scheduling behavior. It does not claim that a
live collector received the records, that Phoenix displays them correctly, or that external provider
requests succeeded. Those delivery and operational checks remain W25.06–W25.09 and the relevant
background-task workflows. No additional controller/service abstraction is needed.
