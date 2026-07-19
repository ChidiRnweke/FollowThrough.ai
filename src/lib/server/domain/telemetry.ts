import { trace, context, ROOT_CONTEXT, SpanStatusCode, type Span } from '@opentelemetry/api';
import { setSession } from '@arizeai/openinference-core';
import { SemanticConventions, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

const TRACER_NAME = 'followthrough';

export interface AgentTurnSpanParams {
	readonly input: string;
	readonly sessionId: string;
	readonly model: string;
}

/**
 * Trace a synchronous pre-step (e.g. the retrieval/baseline-tool preprocess) as a
 * CHAIN span carrying input and a short description of the output. No-op safe when
 * telemetry is disabled.
 */
export async function traceChainStep<T>(
	name: string,
	input: string,
	body: () => Promise<T>,
	describeOutput: (result: T) => string
): Promise<T> {
	const span: Span = trace.getTracer(TRACER_NAME).startSpan(name, {
		attributes: {
			[SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
			[SemanticConventions.INPUT_VALUE]: input
		}
	});
	try {
		const result = await body();
		span.setAttribute(SemanticConventions.OUTPUT_VALUE, describeOutput(result));
		span.setStatus({ code: SpanStatusCode.OK });
		return result;
	} catch (error) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error instanceof Error ? error.message : String(error)
		});
		if (error instanceof Error) span.recordException(error);
		throw error;
	} finally {
		span.end();
	}
}

/**
 * Wrap an agent turn in a manual OpenInference span.
 *
 * The OpenAI Agents instrumentation never records input/output on its root/agent
 * spans, so the turn is wrapped in a manual `AGENT` span that carries them and is
 * grouped into a Phoenix session by conversation id (via `setSession`). It is
 * created on a detached (root) context because Phoenix only honours `session.id`
 * on a span whose parent is null — otherwise the turn would nest under whatever
 * ambient span is active and drop out of session grouping.
 *
 * `body` is driven with the turn's context active on each `next()`, so the child
 * LLM spans the instrumentation creates nest under this span and inherit the
 * session. Safe when telemetry is disabled: the OTel API hands out a no-op
 * tracer/span when no provider is registered, so no call site needs a guard.
 */
export async function* traceAgentTurn<T>(
	params: AgentTurnSpanParams,
	body: () => AsyncIterable<T>,
	getOutput: () => string
): AsyncGenerator<T> {
	const span: Span = trace.getTracer(TRACER_NAME).startSpan(
		'agent.turn',
		{
			attributes: {
				[SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.AGENT,
				[SemanticConventions.INPUT_VALUE]: params.input,
				[SemanticConventions.SESSION_ID]: params.sessionId,
				[SemanticConventions.LLM_MODEL_NAME]: params.model
			}
		},
		ROOT_CONTEXT
	);
	const turnContext = setSession(trace.setSpan(ROOT_CONTEXT, span), {
		sessionId: params.sessionId
	});

	try {
		const iterator = body()[Symbol.asyncIterator]();
		for (;;) {
			const result = await context.with(turnContext, () => iterator.next());
			if (result.done) break;
			yield result.value;
		}
		span.setAttribute(SemanticConventions.OUTPUT_VALUE, getOutput());
		span.setStatus({ code: SpanStatusCode.OK });
	} catch (error) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error instanceof Error ? error.message : String(error)
		});
		if (error instanceof Error) span.recordException(error);
		throw error;
	} finally {
		span.end();
	}
}
