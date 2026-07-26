import {
	context,
	createContextKey,
	ROOT_CONTEXT,
	SpanStatusCode,
	trace,
	type Attributes,
	type Context,
	type Span
} from '@opentelemetry/api';
import { setMetadata, setSession, setTags, setUser } from '@arizeai/openinference-core';
import {
	MimeType,
	OpenInferenceSpanKind,
	SemanticConventions
} from '@arizeai/openinference-semantic-conventions';

const TRACER_NAME = 'followthrough';
const WORKFLOW_CONTEXT_KEY = createContextKey('followthrough.workflow');

export interface WorkflowTraceContext {
	readonly input?: string;
	readonly inputMimeType?: MimeType;
	readonly kind?: OpenInferenceSpanKind;
	readonly sessionId?: string;
	readonly userId?: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
	readonly tags?: readonly string[];
	readonly attributes?: Attributes;
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
	...(params.input === undefined
		? {}
		: {
				[SemanticConventions.INPUT_VALUE]: params.input,
				[SemanticConventions.INPUT_MIME_TYPE]: params.inputMimeType ?? MimeType.TEXT
			}),
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
 * Creates one detached root for a complete product workflow. All downstream
 * operations and auto-instrumented provider calls must execute inside `body`
 * so Phoenix receives one coherent trace.
 */
export async function traceWorkflow<T>(
	name: string,
	params: WorkflowTraceContext,
	body: () => Promise<T>,
	describeOutput?: (result: T) => string
): Promise<T> {
	const span = trace
		.getTracer(TRACER_NAME)
		.startSpan(name, { attributes: spanAttributes(params) }, ROOT_CONTEXT);
	try {
		const result = await context.with(workflowContext(span, params), body);
		const output = describeOutput?.(result);
		if (output !== undefined) {
			span.setAttribute(SemanticConventions.OUTPUT_VALUE, output);
			span.setAttribute(SemanticConventions.OUTPUT_MIME_TYPE, MimeType.TEXT);
		}
		span.setStatus({ code: SpanStatusCode.OK });
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
 * it becomes a safe root rather than retaining a filtered HTTP parent.
 */
export async function traceOperation<T>(
	name: string,
	params: WorkflowTraceContext,
	body: () => Promise<T>,
	describeOutput?: (result: T) => string
): Promise<T> {
	const parent = context.active().getValue(WORKFLOW_CONTEXT_KEY) ? context.active() : ROOT_CONTEXT;
	const span = trace
		.getTracer(TRACER_NAME)
		.startSpan(name, { attributes: spanAttributes(params) }, parent);
	const operationContext = trace.setSpan(parent, span);
	try {
		const result = await context.with(operationContext, body);
		const output = describeOutput?.(result);
		if (output !== undefined) {
			span.setAttribute(SemanticConventions.OUTPUT_VALUE, output);
			span.setAttribute(SemanticConventions.OUTPUT_MIME_TYPE, MimeType.TEXT);
		}
		span.setStatus({ code: SpanStatusCode.OK });
		return result;
	} catch (error) {
		recordError(span, error);
		throw error;
	} finally {
		span.end();
	}
}

export interface AgentTurnSpanParams {
	readonly input: string;
	readonly sessionId: string;
	readonly model: string;
	readonly userId?: string;
	readonly runId?: string;
}

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
	const span = trace
		.getTracer(TRACER_NAME)
		.startSpan('agent.turn', { attributes: spanAttributes(workflowParams) }, ROOT_CONTEXT);
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
