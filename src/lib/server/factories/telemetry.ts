import type {
	OperationObserver,
	WorkflowObserver,
	AgentTurnObserver,
	TraceContextReader,
	TelemetryLogging,
	TelemetryClock,
	BoundaryLogger,
	TelemetryEnvironment
} from '$lib/models/telemetry';
import { OpenTelemetryTracing } from '$lib/server/adapters/telemetry/tracing';
import {
	ProcessTelemetryEnvironment,
	TelemetryLogRendering
} from '$lib/server/adapters/telemetry/logging';
import { TelemetryLogPolicyService } from '$lib/server/services/telemetry/log-policy';
export interface TelemetryCapability {
	readonly operations: OperationObserver;
	readonly workflows: WorkflowObserver;
	readonly turns: AgentTurnObserver;
	readonly traceContext: TraceContextReader;
	readonly logging: TelemetryLogging;
	readonly clock: TelemetryClock;
	readonly logger: BoundaryLogger;
}
export const createTelemetryCapability = (
	dependencies: {
		readonly environment?: TelemetryEnvironment;
		readonly clock?: TelemetryClock;
		readonly logger?: BoundaryLogger;
	} = {}
): TelemetryCapability => {
	const clock = dependencies.clock ?? performance;
	const logger = dependencies.logger ?? console;
	const logging = new TelemetryLogRendering(
		new TelemetryLogPolicyService(),
		dependencies.environment ?? new ProcessTelemetryEnvironment()
	);
	const tracing = new OpenTelemetryTracing(logging, clock, logger);
	return {
		operations: { run: tracing.traceOperation.bind(tracing) },
		workflows: { run: tracing.traceWorkflow.bind(tracing) },
		turns: { run: tracing.traceAgentTurn.bind(tracing) },
		traceContext: tracing,
		logging,
		clock,
		logger
	};
};
