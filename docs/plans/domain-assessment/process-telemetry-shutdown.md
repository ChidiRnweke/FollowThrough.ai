# Application drain and telemetry shutdown

This continues W25.08 and W26.08 under ADRs 0029 and 0032. It does not establish live collector or
Phoenix delivery, or complete the shutdown policy for background agent runs.

## Observed failure

The Node preload registered a SIGTERM handler that immediately shut down the OpenTelemetry SDK.
The worker registered a second handler that stopped its scheduler, waited for the active tasks,
then slept for two seconds before exiting. The handlers run independently. Sleeping after draining
cannot restore a provider that was already shut down while the task was running.

A local reproduction with BasicTracerProvider and a recording exporter starts a worker span,
shuts down the provider, then ends the span. The delivered span list is empty. This confirms the
provider behavior behind the source-level ordering defect; it does not claim a measured incident
in live Phoenix data.

## Ownership and repair

The preload now owns one shared telemetry shutdown promise. The application can register its drain
before shutdown starts. Both signal handlers await that same process lifecycle: finish application
work, then close exporters. The worker's drain stops scheduler timers and waits for in-flight tasks;
its final worker log is emitted before exporter shutdown. The worker awaits the actual shutdown
completion instead of an estimated two-second delay. The existing 30-second forced-exit deadline
still bounds both task draining and exporter shutdown. SIGINT uses the worker handler and reaches
the same explicit flush.

The worker build retains a runtime import of the preload script. Bundling a second copy would create
a second module-local SDK and shutdown coordinator, breaking the shared lifecycle. The built artifact
was inspected to confirm that it imports ../scripts/otel-instrumentation.js. Docker already copies
the scripts directory beside build-worker. No environment flag or separate worker image is needed.
WORKER_TELEMETRY_FLUSH_MS is retired; shutdown now waits for the exporter instead of this delay.

The web process now starts through scripts/start-web.js. It registers a drain before loading the
built adapter-node entry point. The adapter emits sveltekit:shutdown after closing HTTP connections;
that event releases the drain and initiates shutdown for SIGINT or idle exit as well as SIGTERM.
Both pnpm start and the Docker default command use this launcher. The generic preload does not infer
a process role from its arguments or environment.

## Verification and dispositions

Three new tests use a real OpenTelemetry provider and batch span processor with a typed recording
exporter. They verify that a span ending during the registered drain is exported, that standalone
scripts still flush without a drain, and that completed spans flush even when draining fails. The
preload and application can both await shutdown without closing the exporter twice.

Retain scheduler coverage for non-overlapping ticks, retry after failure, independent tasks,
cancelled timers and waiting for in-flight work. Fourteen focused tests passed. A real local HTTP server test holds an active request open during
shutdown and verifies both the complete response and its exported final span. Another test covers
shutdown initiated by the adapter event without a preload signal. The worker build passed.
Built-worker SIGTERM and SIGINT smoke runs both exited with code zero after reporting a completed
drain and telemetry shutdown. Those processes ran from an empty temporary directory, used fake
credentials and localhost port 9 for database/provider backends, and had telemetry disabled. They
verify the built entry point and signal handling, not successful background processing or collector
delivery. Built-web SIGTERM and SIGINT smoke runs served offline-shell.html with HTTP 200 and exited
with code zero. NODE_ENV=test skipped database startup recovery; a real SDK pointed at an unavailable
local collector reported its expected export error. Both signal paths settled, but these runs do not
prove successful remote export. The full web and worker build passed. Full local and CI validation
results are recorded in the PR. No live LLM or telemetry service is
needed for these tests; live collector/Phoenix delivery remains unverified by this change.

## Remaining assessment

Agent-run shutdown policy, configuration validation for shutdown
settings and live delivery evidence remain separate work. W25.08 and W26.08 remain unchecked until
those process boundaries are reconciled.
