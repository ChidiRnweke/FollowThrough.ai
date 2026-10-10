import type { Attributes } from '@opentelemetry/api';
import type { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import type { AgentPayloadObject } from '$lib/models/agent/payload';

/** Data attached to a traced workflow or operation. */
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
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEnvironment {
	readonly LOG_LEVEL: string | undefined;
	readonly NODE_ENV: string | undefined;
}
