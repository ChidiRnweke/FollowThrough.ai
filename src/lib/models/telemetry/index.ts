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
