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

const TRACER_NAME = 'followthrough';
const WORKFLOW_CONTEXT_KEY = createContextKey('followthrough.workflow');

/**
 * Log verbosity is deployment policy, not configuration the secrets backend can
 * supply: LOG_LEVEL reaches the process like the OTEL_* platform keys. Unset
 * means debug in dev (you want the noise while iterating), info in prod (debug
 * records stay out of Loki until someone opts in) and error under vitest (the
 * suite would drown in operation chatter otherwise).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const resolveLogLevel = (
	env: Record<string, string | undefined> = process.env
): LogLevel => {
	const configured = env.LOG_LEVEL?.trim().toLowerCase();
	if (
		configured === 'debug' ||
		configured === 'info' ||
		configured === 'warn' ||
		configured === 'error'
	)
		return configured;
	if (env.NODE_ENV === 'production') return 'info';
	if (env.NODE_ENV === 'test') return 'error';
	return 'debug';
};

/** True when a record at `level` should be emitted under the resolved level. */
export const logLevelEnabled = (
	level: LogLevel,
	env: Record<string, string | undefined> = process.env
): boolean => LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[resolveLogLevel(env)];

/**
 * Attached images ride through controller arguments as base64 data URLs; logging
 * one verbatim would bury the record. Same treatment as the span exporter's
 * elision in scripts/otel-instrumentation.js — copied, not imported, because the
 * preload runs before the app and cannot share modules with src.
 */
const BASE64_DATA_URL = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const MAX_SUMMARY_CHARS = 500;

/**
 * One-line rendering of an argument or result for a log record: JSON, capped,
 * base64 elided. Summaries, never raw payloads — privacy and record size.
 */
export const summarize = (value: unknown, maxChars: number = MAX_SUMMARY_CHARS): string => {
	let rendered: string;
	if (value instanceof Error) rendered = `${value.name}: ${value.message}`;
	else {
		try {
			rendered = JSON.stringify(value) ?? String(value);
		} catch {
			rendered = '[unserializable]';
		}
	}
	rendered = rendered.replace(
		BASE64_DATA_URL,
		(match) => `${match.slice(0, 64)}…<base64 elided, ${match.length} chars>`
	);
	if (rendered.length > maxChars)
		return `${rendered.slice(0, maxChars)}…<truncated, ${rendered.length} chars>`;
	return rendered;
};

const INVALID_TRACE_ID = '00000000000000000000000000000000';

/**
 * W3C `traceparent` of the currently active span, or `undefined` when no valid
 * span is active (telemetry off, or outside any span). Used to carry the caller's
 * trace into work that outlives the active context — e.g. an agent run queued by
 * this request but executed after the transaction commits.
 */
export const activeTraceparent = (): string | undefined => {
	const span = trace.getSpan(context.active());
	if (!span) return undefined;
	const { traceId } = span.spanContext();
	if (traceId === INVALID_TRACE_ID) return undefined;
	return toTraceparent(span);
};

export interface WorkflowTraceContext {
	readonly input?: string;
	readonly inputMimeType?: MimeType;
	readonly outputMimeType?: MimeType;
	readonly kind?: OpenInferenceSpanKind;
	readonly sessionId?: string;
	readonly userId?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly tags?: readonly string[];
	readonly attributes?: Attributes;
	/** Do not emit an independent root when this operation is background work. */
	readonly onlyWithinWorkflow?: boolean;
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const isExpectedCancellation = (error: unknown): boolean =>
	error instanceof Error &&
	(error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

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
	[SemanticConventions.OPENINFERENCE_SPAN_KIND]: params.kind ?? OpenInferenceSpanKind.CHAIN,
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

/**
 * Creates the root span for a complete product workflow — or, when already
 * inside a workflow or operation, a child span, so the caller's trace stays
 * whole. It detaches only when the active context carries no workflow marker
 * (e.g. a bare auto-instrumented HTTP request): parenting to that filtered
 * span would show up in Phoenix as a broken root. All downstream operations
 * and auto-instrumented provider calls must execute inside `body` so Phoenix
 * receives one coherent trace.
 */
export async function traceWorkflow<T>(
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
	const debug = logLevelEnabled('debug');
	const startedAt = performance.now();
	if (debug) console.debug('[operation] started:', name);
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
			console.debug(
				`[operation] completed: ${name} in ${Math.round(performance.now() - startedAt)}ms`
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
export async function traceOperation<T>(
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
	const debug = logLevelEnabled('debug');
	const startedAt = performance.now();
	if (debug) console.debug('[operation] started:', name);
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
			console.debug(
				`[operation] completed: ${name} in ${Math.round(performance.now() - startedAt)}ms`
			);
		return result;
	} catch (error) {
		recordError(span, error);
		throw error;
	} finally {
		span.end();
	}
}

/** Adapter injected into services so observability does not become a service-to-service dependency. */
export const operationObserver = {
	run<T>(
		name: string,
		params: unknown,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string,
		describeAttributes?: (result: T) => Attributes
	): Promise<T> {
		return traceOperation(
			name,
			params as WorkflowTraceContext,
			body,
			describeOutput,
			describeAttributes
		);
	}
};

export interface AgentTurnSpanParams {
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

/**
 * Drives an async agent stream with the turn root active for every iterator
 * step. The OpenAI Agents SDK processor therefore emits its native
 * AGENT/LLM/TOOL hierarchy beneath this root and inherits the conversation
 * session.
 */
export async function* traceAgentTurn<T>(
	params: AgentTurnSpanParams,
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
