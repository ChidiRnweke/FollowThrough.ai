import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { operationObserver } from '$lib/server/infrastructure/telemetry/tracing';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchHistory } from '$lib/testing/knowledge-search/fixtures/query-generation';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';

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

it('keeps one query-generation child span and the validated output under the search workflow', async () => {
	const provider = new InMemoryRetrievalProvider();
	provider.completionResponse = {
		body: { choices: [{ message: { content: '  deployment  ' } }] },
		status: 200
	};
	{
		const fixture = searchControllerFixture(
			{ conversations: { listMessages: async () => searchHistory } },
			{ provider, observer: operationObserver }
		);
		await operationObserver.run('search.workflow', {}, () =>
			fixture.controller.search(testActor(), {
				query: 'follow up',
				conversationId: testConversationId()
			})
		);
		const spans = exporter.getFinishedSpans();
		const root = spans.find((span) => span.name === 'search.workflow');
		if (!root) throw new Error('Missing search workflow span');
		expect({
			requests: provider.completionRequests,
			generations: spans
				.filter((span) => span.name === 'knowledge_search.generate_query')
				.map((span) => ({
					parent: span.parentSpanContext?.spanId,
					status: span.status.code,
					input: span.attributes['input.value'],
					output: span.attributes['output.value']
				}))
		}).toEqual({
			requests: [
				{
					model: 'deepseek/deepseek-v4-flash',
					messages: [
						{
							role: 'system',
							content:
								'Rewrite the following conversation into a single, focused search-query statement that captures what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.'
						},
						{ role: 'user', content: 'first question\nmore context\nuser: follow up' }
					]
				}
			],
			generations: [
				{
					parent: root.spanContext().spanId,
					status: SpanStatusCode.OK,
					input: 'first question\nmore context\nuser: follow up',
					output: 'deployment'
				}
			]
		});
	}
});

it('records rejected output on the generation span before the controller wraps the failure', async () => {
	const provider = new InMemoryRetrievalProvider();
	provider.completionResponse = {
		body: { choices: [{ message: { content: ' ' } }] },
		status: 200
	};
	{
		const fixture = searchControllerFixture(
			{ conversations: { listMessages: async () => searchHistory } },
			{ provider, observer: operationObserver }
		);
		const outcome = await fixture.controller
			.search(testActor(), { query: 'follow up', conversationId: testConversationId() })
			.then(
				() => 'success',
				(error: Error) => error.message
			);
		expect({
			outcome,
			failures: exporter
				.getFinishedSpans()
				.filter((span) => span.name === 'knowledge_search.generate_query')
				.map((span) => span.status)
		}).toEqual({
			outcome: 'Search query generation failed',
			failures: [
				{ code: SpanStatusCode.ERROR, message: 'Search query generation returned no usable text' }
			]
		});
	}
});
