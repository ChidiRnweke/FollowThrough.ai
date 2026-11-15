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
import type {
	OperationObserver,
	TraceContextReader,
	WorkflowObserver,
	WorkflowTraceContext
} from '$lib/models/telemetry';
export type { WorkflowTraceContext } from '$lib/models/telemetry';

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
 * MCP authorization codes and tokens (`ftc_`, `fta_`, `ftr_`) are credentials. Controller
 * results carry them — an approval redirect holds a code, a token exchange holds both
 * tokens — and a log record must never hold one.
 */
const MCP_CREDENTIAL = /\b(ftc|fta|ftr)_[A-Za-z0-9_-]+/g;

/**
 * One-line rendering of a log record's context: JSON, capped, base64 elided, credentials
 * redacted. It renders whatever it is given, content included, so a line that must carry no
 * content passes it metadata only.
 */
export const summarize = (value: unknown, maxChars: number = MAX_SUMMARY_CHARS): string => {
	let rendered: string;
	if (value instanceof Error) rendered = `${value.name}: ${value.message}`;
	else {
		try {
			rendered = JSON.stringify(value) ?? String(value);
			// chisel-ignore fail-loudly:silent-catch -- telemetry formatting must not fail the operation; the explicit marker states that the value was lost.
		} catch {
			return '[unserializable]';
		}
	}
	rendered = rendered
		.replace(
			BASE64_DATA_URL,
			(match) => `${match.slice(0, 64)}…<base64 elided, ${match.length} chars>`
		)
		.replace(MCP_CREDENTIAL, '$1_<redacted>');
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
export const operationObserver: OperationObserver = {
	run<T>(
		name: string,
		params: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string,
		describeAttributes?: (result: T) => Attributes
	): Promise<T> {
		return traceOperation(name, params, body, describeOutput, describeAttributes);
	}
};

/** Adapter injected into controllers that open their own workflow root. */
export const workflowObserver: WorkflowObserver = {
	run<T>(
		name: string,
		params: WorkflowTraceContext,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T> {
		return traceWorkflow(name, params, body, describeOutput);
	}
};

/** Adapter injected into controllers that persist a trace link for later resumption. */
export const traceContextReader: TraceContextReader = {
	activeTraceparent: () => activeTraceparent()
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

const INPUT_LENGTH = 'followthrough.input.length';
const OUTPUT_LENGTH = 'followthrough.output.length';

/**
 * The agent turn observer under a deployment's content policy (`AGENT_TRACE_CONTENT`). When it
 * records content, the turn root carries the prompt and the answer for Phoenix. When it does not,
 * the root carries their lengths beside the session, user, run and model that place the turn.
 */
export const agentTurnTracer =
	(recordContent: boolean) =>
	<T>(
		params: AgentTurnSpanParams,
		body: () => AsyncIterable<T>,
		getOutput: () => string
	): AsyncGenerator<T> =>
		traceAgentTurn(params, body, getOutput, recordContent);

/**
 * Drives an async agent stream with the turn root active for every iterator
 * step. The OpenAI Agents SDK processor therefore emits its native
 * AGENT/LLM/TOOL hierarchy beneath this root and inherits the conversation
 * session.
 */
async function* traceAgentTurn<T>(
	params: AgentTurnSpanParams,
	body: () => AsyncIterable<T>,
	getOutput: () => string,
	recordContent: boolean
): AsyncGenerator<T> {
	const workflowParams: WorkflowTraceContext = {
		...(recordContent ? { input: params.input } : {}),
		attributes: { [INPUT_LENGTH]: params.input.length },
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
			span.setAttribute(OUTPUT_LENGTH, output.length);
			if (output && recordContent) {
				span.setAttribute(SemanticConventions.OUTPUT_VALUE, output);
				span.setAttribute(SemanticConventions.OUTPUT_MIME_TYPE, MimeType.TEXT);
			}
			span.setStatus({ code: SpanStatusCode.OK });
		}
		span.end();
	}
}

/**
 * One span around a service call, recorded under the operation or workflow that made it. Outside
 * a trace the call runs untouched, so background helpers open no detached roots. A synchronous
 * call stays synchronous; a promise ends its span when it settles. No arguments or results are
 * recorded: the controller boundary logs those, and a span only adds timing and failure.
 *
 * The span is a leaf: the body runs in the caller's context, not the span's. The collector drops
 * spans without an OpenInference kind before Phoenix, so a service span that parented LLM or
 * tool spans would split one Phoenix trace into orphans. Spans the service starts stay children
 * of the operation, and Tempo shows the service span beside them.
 */
export function traceServiceCall<T>(name: string, body: () => T): T {
	const active = context.active();
	if (!active.getValue(WORKFLOW_CONTEXT_KEY)) return body();
	const span = trace.getTracer(TRACER_NAME).startSpan(name, {}, active);
	const settle = (): void => {
		span.setStatus({ code: SpanStatusCode.OK });
		span.end();
	};
	const fail = (error: unknown): never => {
		recordError(span, error);
		span.end();
		throw error;
	};
	let result: T;
	try {
		result = body();
	} catch (error) {
		recordError(span, error);
		span.end();
		throw error;
	}
	if (result instanceof Promise)
		return result.then((value) => {
			settle();
			return value;
		}, fail) as T;
	settle();
	return result;
}
