import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';
const telemetry = createTelemetryCapability();
const operationObserver = telemetry.operations;

import { createSearchQueryGeneration } from '$lib/server/factories/retrieval-providers';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';
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
	const provider = await inlineCompletionProvider(
		JSON.stringify({ choices: [{ message: { content: '  deployment  ' } }] })
	);
	try {
		const fixture = searchControllerFixture({
			queryGenerator: createSearchQueryGeneration({
				apiKey: 'local-key',
				baseURL: provider.baseURL,
				appURL: 'https://app.example.test'
			}),
			observer: operationObserver,
			conversations: { listMessages: async () => searchHistory }
		});
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
			requests: provider.requests.map((request) => JSON.parse(request.body)),
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
	} finally {
		await provider.close();
	}
});

it('records rejected output on the generation span before the controller wraps the failure', async () => {
	const provider = await inlineCompletionProvider(
		JSON.stringify({ choices: [{ message: { content: ' ' } }] })
	);
	try {
		const fixture = searchControllerFixture({
			queryGenerator: createSearchQueryGeneration({
				apiKey: 'local-key',
				baseURL: provider.baseURL,
				appURL: 'https://app.example.test'
			}),
			observer: operationObserver,
			conversations: { listMessages: async () => searchHistory }
		});
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
	} finally {
		await provider.close();
	}
});
