import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { TextSelection, Url } from '$lib/models';
import {
	OpenRouterWebReferenceClient,
	WebSearchReferenceFinder
} from './openai-reference-capabilities';
import { InMemoryWebReferenceClient } from '$lib/testing/fakes/in-memory-pipelines';
import { testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 16,
	text: 'Use OAuth 2.0.'
};

const result = {
	url: 'https://www.rfc-editor.org/rfc/rfc6749' as Url,
	title: 'RFC 6749',
	tier: 'standard' as const,
	relevanceNote: 'Defines the selected authorization protocol.',
	confidence: 96
};

const responseBody = {
	id: 'resp_local',
	object: 'response',
	created_at: 1,
	status: 'completed',
	model: 'openai/gpt-5.6',
	output: [
		{
			type: 'openrouter:web_search',
			id: 'search_local',
			status: 'completed',
			action: {
				type: 'search',
				query: 'OAuth 2.0 RFC',
				sources: [{ type: 'url', url: result.url }]
			}
		},
		{
			id: 'msg_local',
			type: 'message',
			status: 'completed',
			role: 'assistant',
			content: [
				{
					type: 'output_text',
					text: 'RFC 6749 defines OAuth 2.0.',
					annotations: [
						{
							type: 'url_citation',
							url: result.url,
							title: result.title,
							content: result.relevanceNote
						}
					]
				}
			]
		}
	],
	usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
};

const startResponseServer = async () => {
	let request: { body?: unknown; referer?: string; title?: string } = {};
	const server = createServer((incoming, outgoing) => {
		const chunks: Buffer[] = [];
		incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
		incoming.on('end', () => {
			request = {
				body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
				referer: incoming.headers['http-referer'] as string | undefined,
				title: incoming.headers['x-openrouter-title'] as string | undefined
			};
			outgoing.writeHead(200, { 'content-type': 'application/json' });
			outgoing.end(JSON.stringify(responseBody));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Local server did not bind');
	return {
		server,
		url: `http://127.0.0.1:${address.port}/v1`,
		request: () => request
	};
};

describe('Web reference client boundary', () => {
	it('sends the OpenRouter server tool with the selected model', async () => {
		const local = await startResponseServer();
		const client = new OpenRouterWebReferenceClient('local-key', {
			baseURL: local.url,
			appURL: 'https://followthrough.test',
			defaultModel: 'openai/gpt-5.6'
		});
		try {
			await client.search(selection.text, { model: 'anthropic/claude-sonnet-4.5' });
		} finally {
			await new Promise<void>((resolve, reject) =>
				local.server.close((error) => (error ? reject(error) : resolve()))
			);
		}
		expect(local.request()).toMatchObject({
			body: {
				model: 'anthropic/claude-sonnet-4.5',
				tools: [
					{
						type: 'openrouter:web_search',
						parameters: { engine: 'exa', max_results: 8, max_total_results: 16 }
					}
				]
			},
			referer: 'https://followthrough.test',
			title: 'FollowThrough'
		});
	});

	it('maps native OpenRouter citation annotations to references', async () => {
		const local = await startResponseServer();
		const client = new OpenRouterWebReferenceClient('local-key', { baseURL: local.url });
		let references: readonly { url: Url }[] | undefined;
		try {
			references = await client.search(selection.text);
		} finally {
			await new Promise<void>((resolve, reject) =>
				local.server.close((error) => (error ? reject(error) : resolve()))
			);
		}
		expect(references?.[0]).toMatchObject({
			url: result.url,
			title: result.title,
			tier: 'standard',
			relevanceNote: result.relevanceNote,
			confidence: 95
		});
	});

	it('returns structured web references', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [result];
		const finder = new WebSearchReferenceFinder({ client });
		const references = await finder.find(testActor(), selection);
		expect(references[0]?.url).toBe(result.url);
	});

	it('accepts an honest empty web result', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = new WebSearchReferenceFinder({ client });
		const references = await finder.find(testActor(), selection);
		expect(references).toEqual([]);
	});

	it('passes the selected conversation model to the web client', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = new WebSearchReferenceFinder({ client });
		await finder.find(testActor(), selection, { model: 'google/gemini-3-flash' });
		expect(client.model).toBe('google/gemini-3-flash');
	});

	it('rejects a missing structured web result', async () => {
		const client = new InMemoryWebReferenceClient();
		const finder = new WebSearchReferenceFinder({ client });
		await expect(finder.find(testActor(), selection)).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('maps web client failures to an external-service error', async () => {
		const client = new InMemoryWebReferenceClient();
		client.failure = new Error('search unavailable');
		const finder = new WebSearchReferenceFinder({ client });
		await expect(finder.find(testActor(), selection)).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});

	it('returns no references when no API client is configured', async () => {
		const finder = new WebSearchReferenceFinder({ apiKey: '' });
		const references = await finder.find(testActor(), selection);
		expect(references).toEqual([]);
	});
});
