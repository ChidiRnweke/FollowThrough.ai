import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticConventions as S } from '@arizeai/openinference-semantic-conventions';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import { operationObserver, workflowObserver } from '$lib/server/adapters/telemetry/tracing';
import { createInlineCompletion } from '$lib/server/factories/inline-completion';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
	autoDetectResources: false,
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	logRecordProcessors: [],
	instrumentations: []
});
beforeAll(() => sdk.start());
beforeEach(() => exporter.reset());
afterAll(async () => {
	await sdk.shutdown();
	trace.disable();
	context.disable();
});
const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: testNoteId(),
	revision: 1,
	blockType: 'paragraph',
	headingPath: [],
	currentSection: 'The migration needs more',
	prefix: 'The migration needs more',
	suffix: ''
};
const fixtureFor = (baseURL: string) => {
	const fixture = inlineSuggestionFixture({
		observer: operationObserver,
		workflow: workflowObserver,
		inlineCompletionGenerator: createInlineCompletion({
			apiKey: 'local-key',
			baseURL,
			appURL: 'https://followthrough.example'
		})
	});
	fixture.notes.notes = [noteBuilder()];
	return fixture;
};

it('parents one generation span under the suggestion and preserves raw and rendered output', async () => {
	const provider = await inlineCompletionProvider(
		JSON.stringify({
			model: 'provider-model',
			choices: [{ message: { content: '" replicas."' }, finish_reason: 'stop' }]
		})
	);
	try {
		await fixtureFor(provider.baseURL).controller.suggest(
			testActor(),
			request,
			new AbortController().signal
		);
		const spans = exporter.getFinishedSpans();
		const root = spans.find((span) => span.name === 'inline.suggestion');
		if (!root) throw new Error('Missing suggestion span');
		expect(
			spans
				.filter((span) => span.name === 'inline.generate')
				.map((span) => ({
					parent: span.parentSpanContext?.spanId,
					traceId: span.spanContext().traceId,
					status: span.status.code,
					attributes: span.attributes
				}))
		).toMatchObject([
			{
				parent: root.spanContext().spanId,
				traceId: root.spanContext().traceId,
				status: SpanStatusCode.OK,
				attributes: {
					[S.OPENINFERENCE_SPAN_KIND]: 'LLM',
					[S.LLM_MODEL_NAME]: 'provider-model',
					'output.value': ' replicas.',
					'llm.output_messages.0.message.content': '" replicas."'
				}
			}
		]);
	} finally {
		await provider.close();
	}
});

it('records an in-flight SDK cancellation as cancelled and releases the admission', async () => {
	const deferred = Promise.withResolvers<string>();
	const provider = await inlineCompletionProvider(deferred.promise);
	try {
		const fixture = fixtureFor(provider.baseURL);
		const actor = testActor();
		const abort = new AbortController();
		const outcome = fixture.controller.suggest(actor, request, abort.signal).then(
			(result) => result.outcome,
			(error) => error.message
		);
		await provider.received;
		abort.abort();
		const message = await outcome;
		expect({
			message,
			admission: fixture.admission.admit(actor.userId),
			spans: exporter
				.getFinishedSpans()
				.filter((span) => span.name === 'inline.generate')
				.map((span) => ({ status: span.status.code, output: span.attributes['output.value'] }))
		}).toEqual({
			message: 'Request was aborted.',
			admission: { allowed: true },
			spans: [{ status: SpanStatusCode.OK, output: 'cancelled' }]
		});
	} finally {
		deferred.resolve('{}');
		await provider.close();
	}
});
