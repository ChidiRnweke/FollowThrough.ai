import { APIUserAbortError } from 'openai';
import {
	context,
	createContextKey,
	ROOT_CONTEXT,
	SpanStatusCode,
	trace,
	TraceFlags,
	type Attributes,
	type Context,
	type Span
} from '@opentelemetry/api';
import {
	getInputAttributes,
	getOutputAttributes,
	setMetadata,
	setSession,
	setTags,
	setUser
} from '@arizeai/openinference-core';
import {
	MimeType,
	OpenInferenceSpanKind,
	SemanticConventions
} from '@arizeai/openinference-semantic-conventions';
import type { WorkflowTraceContext } from '$lib/models/telemetry';
import type { TraceContextReader } from '$lib/server/controllers/agent/controller';
import type {
	AgentTurnObserver,
	AgentTurnObservation
} from '$lib/server/controllers/agent/execution';
import type { TelemetryLogging, TelemetryClock, BoundaryLogger } from './logging';
/**
 * Infrastructure observation of one operation.
 *
 * `describeOutput` and `describeAttributes` turn a caller's result
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

interface TelemetryTracing extends TraceContextReader {
	traceOperation: OperationObserver['run'];
	traceWorkflow: WorkflowObserver['run'];
	traceAgentTurn: AgentTurnObserver['run'];
}

const TRACER_NAME = 'followthrough';
const WORKFLOW_CONTEXT_KEY = createContextKey('followthrough.workflow');
const INVALID_TRACE_ID = '00000000000000000000000000000000';
const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const isExpectedCancellation = (error: unknown): boolean =>
	error instanceof Error && (error.name === 'AbortError' || error instanceof APIUserAbortError);

const recordError = (span: Span, error: unknown): void => {
	if (isExpectedCancellation(error)) {
		span.setAttribute(SemanticConventions.OUTPUT_VALUE, 'cancelled');
		span.setAttribute(SemanticConventions.OUTPUT_MIME_TYPE, MimeType.TEXT);
		span.setStatus({ code: SpanStatusCode.OK });
		return;
	}
	span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) });
	if (error instanceof Error) span.recordException(error);
};

const spanAttributes = (params: WorkflowTraceContext): Attributes => ({
	...(params.kind === null
		? {}
		: {
				[SemanticConventions.OPENINFERENCE_SPAN_KIND]: params.kind ?? OpenInferenceSpanKind.CHAIN
			}),
	...getInputAttributes(
		params.input === undefined
			? undefined
			: { value: params.input, mimeType: params.inputMimeType ?? MimeType.TEXT }
	),
	...(params.sessionId ? { [SemanticConventions.SESSION_ID]: params.sessionId } : {}),
	...(params.userId ? { [SemanticConventions.USER_ID]: params.userId } : {}),
	...(params.metadata ? { [SemanticConventions.METADATA]: JSON.stringify(params.metadata) } : {}),
	...(params.tags ? { [SemanticConventions.TAG_TAGS]: [...params.tags] } : {}),
	...params.attributes
});

const workflowContext = (span: Span, params: WorkflowTraceContext): Context => {
	let active = trace.setSpan(ROOT_CONTEXT, span);
	if (params.sessionId) active = setSession(active, { sessionId: params.sessionId });
	if (params.userId) active = setUser(active, { userId: params.userId });
	if (params.metadata) active = setMetadata(active, params.metadata);
	if (params.tags) active = setTags(active, [...params.tags]);
	return active.setValue(WORKFLOW_CONTEXT_KEY, true);
};

const TRACE_FLAG_SAMPLED = '01';

/** Serializes a span's context as a W3C `traceparent`. */
const toTraceparent = (span: Span): string => {
	const { traceId, spanId } = span.spanContext();
	return `00-${traceId}-${spanId}-${TRACE_FLAG_SAMPLED}`;
};

/**
 * Rebuilds a parent context from a stored `traceparent`. Returns `ROOT_CONTEXT`
 * for anything malformed, so a corrupted value costs the link, never the trace.
 */
const fromTraceparent = (traceparent: string): Context => {
	const [version, traceId, spanId, flags] = traceparent.split('-');
	if (version !== '00' || !/^[0-9a-f]{32}$/.test(traceId ?? '')) return ROOT_CONTEXT;
	if (!/^[0-9a-f]{16}$/.test(spanId ?? '')) return ROOT_CONTEXT;
	return trace.setSpanContext(ROOT_CONTEXT, {
		traceId: traceId as string,
		spanId: spanId as string,
		traceFlags: flags === TRACE_FLAG_SAMPLED ? TraceFlags.SAMPLED : TraceFlags.NONE,
		isRemote: true
	});
};

export class OpenTelemetryTracing implements TelemetryTracing {
	constructor(
		private readonly logging: TelemetryLogging,
		private readonly clock: TelemetryClock,
		private readonly logger: BoundaryLogger
	) {}
	activeTraceparent(): string | undefined {
		const span = trace.getSpan(context.active());
		if (!span) return undefined;
		const { traceId } = span.spanContext();
		if (traceId === INVALID_TRACE_ID) return undefined;
		return toTraceparent(span);
	}

	async traceWorkflow<T>(
		name: string,
		params: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T> {
		const active = context.active();
		const parent = active.getValue(WORKFLOW_CONTEXT_KEY) ? active : ROOT_CONTEXT;
		const span = trace
			.getTracer(TRACER_NAME)
			.startSpan(name, { attributes: spanAttributes(params) }, parent);
		const debug = this.logging.enabled('debug');
		const startedAt = this.clock.now();
		if (debug) this.logger.debug('[operation] started:', name);
		try {
			const result = await context.with(workflowContext(span, params), body);
			const output = describeOutput?.(result);
			if (output !== undefined) {
				span.setAttributes(
					getOutputAttributes({
						value: output,
						mimeType: params.outputMimeType ?? MimeType.TEXT
					})
				);
			}
			span.setStatus({ code: SpanStatusCode.OK });
			if (debug)
				this.logger.debug(
					`[operation] completed: ${name} in ${Math.round(this.clock.now() - startedAt)}ms`
				);
			return result;
		} catch (error) {
			recordError(span, error);
			throw error;
		} finally {
			span.end();
		}
	}

	/**
	 * Creates an operation under the active workflow. If called outside a workflow,
	 * it becomes a safe root rather than retaining a filtered HTTP parent. The
	 * operation marks its own context as a workflow context, so observers nested
	 * beneath it (including controller calls made by agent tools) compose into the
	 * same trace instead of forking detached roots.
	 */
	async traceOperation<T>(
		name: string,
		params: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string,
		describeAttributes?: (result: T) => Attributes
	): Promise<T> {
		const activeContext = context.active();
		const isWithinWorkflow = Boolean(activeContext.getValue(WORKFLOW_CONTEXT_KEY));
		if (!isWithinWorkflow && params.onlyWithinWorkflow) return body();
		const parent = isWithinWorkflow ? activeContext : ROOT_CONTEXT;
		const span = trace
			.getTracer(TRACER_NAME)
			.startSpan(name, { attributes: spanAttributes(params) }, parent);
		const operationContext = trace.setSpan(parent, span).setValue(WORKFLOW_CONTEXT_KEY, true);
		const debug = this.logging.enabled('debug');
		const startedAt = this.clock.now();
		if (debug) this.logger.debug('[operation] started:', name);
		try {
			const result = await context.with(operationContext, body);
			const output = describeOutput?.(result);
			if (output !== undefined) {
				span.setAttributes(
					getOutputAttributes({
						value: output,
						mimeType: params.outputMimeType ?? MimeType.TEXT
					})
				);
			}
			const attributes = describeAttributes?.(result);
			if (attributes) span.setAttributes(attributes);
			span.setStatus({ code: SpanStatusCode.OK });
			if (debug)
				this.logger.debug(
					`[operation] completed: ${name} in ${Math.round(this.clock.now() - startedAt)}ms`
				);
			return result;
		} catch (error) {
			recordError(span, error);
			throw error;
		} finally {
			span.end();
		}
	}

	async *traceAgentTurn<T>(
		params: AgentTurnObservation,
		body: () => AsyncIterable<T>,
		getOutput: () => string
	): AsyncGenerator<T> {
		const workflowParams: WorkflowTraceContext = {
			input: params.input,
			kind: OpenInferenceSpanKind.CHAIN,
			sessionId: params.sessionId,
			...(params.userId ? { userId: params.userId } : {}),
			metadata: {
				model: params.model,
				...(params.runId ? { runId: params.runId } : {})
			},
			tags: ['agent', 'turn']
		};
		const active = context.active();
		const parent = params.parentTraceparent
			? fromTraceparent(params.parentTraceparent)
			: active.getValue(WORKFLOW_CONTEXT_KEY)
				? active
				: ROOT_CONTEXT;
		const span = trace
			.getTracer(TRACER_NAME)
			.startSpan('agent.turn', { attributes: spanAttributes(workflowParams) }, parent);
		params.onRoot?.(toTraceparent(span));
		const turnContext = workflowContext(span, workflowParams);
		let errored = false;
		try {
			const iterator = body()[Symbol.asyncIterator]();
			for (;;) {
				const result = await context.with(turnContext, () => iterator.next());
				if (result.done) break;
				yield result.value;
			}
		} catch (error) {
			errored = true;
			recordError(span, error);
			throw error;
		} finally {
			if (!errored) {
				const output = getOutput();
				if (output) {
					span.setAttribute(SemanticConventions.OUTPUT_VALUE, output);
					span.setAttribute(SemanticConventions.OUTPUT_MIME_TYPE, MimeType.TEXT);
				}
				span.setStatus({ code: SpanStatusCode.OK });
			}
			span.end();
		}
	}
}
