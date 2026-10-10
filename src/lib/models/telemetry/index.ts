import type { Attributes } from '@opentelemetry/api';
import type { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type { AgentPayloadObject } from '$lib/models/agent/payload';

/**
 * What a service says about an operation it is asking to have traced.
 *
 * It lives here rather than beside the tracer because a service may not import
 * another service, and nine of them need to name it. They each declared a
 * private observer port taking `unknown` instead, and the tracer then asserted
 * this exact type back out of it — one shape, ten declarations, none of them
 * checked against the others.
 *
 * Pure data: the vendor imports are type-only, so nothing here runs.
 */
export interface WorkflowTraceContext {
	readonly input?: string;
	readonly inputMimeType?: MimeType;
	readonly outputMimeType?: MimeType;
	/**
	 * OpenInference span kind. Omitted spans default to CHAIN and are routed to
	 * Phoenix by the collector; pass `null` to skip the kind entirely so the
	 * collector's `filter/openinference` drops the span from Phoenix while it
	 * still flows to the traces (Tempo) pipeline — used by controller-boundary
	 * instrumentation, whose spans exist to carry a trace id for the logs, not
	 * to show up in Phoenix.
	 */
	readonly kind?: OpenInferenceSpanKind | null;
	readonly sessionId?: string;
	readonly userId?: string;
	readonly metadata?: AgentPayloadObject;
	readonly tags?: readonly string[];
	readonly attributes?: Attributes;
	/** Do not emit an independent root when this operation is background work. */
	readonly onlyWithinWorkflow?: boolean;
}

/**
 * The seam a service uses to trace one operation.
 *
 * Declared once, next to the context it carries. `describeOutput` and
 * `describeAttributes` are the two hooks a caller uses to turn its own result
 * into span data, so the result type stays the caller's.
 */
export interface OperationObserver {
	run<T>(
		name: string,
		context: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string,
		describeAttributes?: (result: T) => Attributes
	): Promise<T>;
}

/**
 * The seam a controller uses to open a workflow root: a trace a user would
 * recognise as one request (an inline suggestion, a diagram generation).
 * Unlike `OperationObserver`, it always records, nesting under an active
 * workflow when there is one.
 */
export interface WorkflowObserver {
	run<T>(
		name: string,
		context: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T>;
}

/** Reads the W3C traceparent of the active operation, so a run can rejoin it later. */
export interface TraceContextReader {
	activeTraceparent(): string | undefined;
}

export interface AgentTurnContext {
	readonly input: string;
	readonly sessionId: string;
	readonly model: string;
	readonly userId?: string;
	readonly runId?: string;
	/**
	 * W3C traceparent of the operation that started this run. Seeded onto the run
	 * at submit time so the first turn joins the requesting trace, and carried
	 * across an approval park so the resumed turn hangs off the original root
	 * instead of opening a second trace for the same user request. When absent,
	 * the turn joins an active workflow context if there is one, else roots.
	 */
	readonly parentTraceparent?: string;
	/** Receives this turn's own traceparent, so the caller can persist it for a resume. */
	readonly onRoot?: (traceparent: string) => void;
}

export interface AgentTurnObserver {
	run<T>(
		params: AgentTurnContext,
		body: () => AsyncIterable<T>,
		output: () => string
	): AsyncIterable<T>;
}
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEnvironment {
	readonly LOG_LEVEL: string | undefined;
	readonly NODE_ENV: string | undefined;
}
export interface TelemetryEnvironment {
	read(): LogEnvironment;
}
export interface TelemetryClock {
	now(): number;
}
export type BoundaryLogger = Pick<Console, 'info' | 'debug' | 'warn' | 'error'>;
export interface TelemetryLogPolicy {
	enabled(level: LogLevel, environment: LogEnvironment): boolean;
	summarize(rendered: string, maxChars?: number): string;
}
export interface TelemetryLogging {
	enabled(level: LogLevel): boolean;
	summarize<T>(value: T, maxChars?: number): string;
}
export interface TelemetryTracing extends TraceContextReader {
	traceOperation: OperationObserver['run'];
	traceWorkflow: WorkflowObserver['run'];
	traceAgentTurn: AgentTurnObserver['run'];
}
