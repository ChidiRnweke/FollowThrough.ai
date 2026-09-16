import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { TextSelection } from '$lib/models/notes';
import type { Url } from '$lib/models/references';
import { ReferenceResearch } from './web-research';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 14,
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

const startResponseServer = async (body = responseBody) => {
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
			outgoing.end(JSON.stringify(body));
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
	it('preserves every valid source returned by the provider', async () => {
		const sources = Array.from({ length: 7 }, (_, index) => ({
			type: 'url',
			url: `https://example.com/source-${index}` as Url
		}));
		const local = await startResponseServer({
			...responseBody,
			output: [
				{
					type: 'openrouter:web_search',
					id: 'search-many',
					status: 'completed',
					action: { type: 'search', query: 'OAuth', sources }
				}
			]
		});
		const client = new ReferenceResearch('local-key', {
			baseURL: local.url,
			appURL: 'https://followthrough.test',
			defaultModel: 'test/model',
			observer: { run: (_name, _context, operation) => operation() }
		});
		try {
			expect((await client.search(selection.text)).map((source) => source.url)).toEqual(
				sources.map((source) => source.url)
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				local.server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
	it('sends the OpenRouter server tool with the selected model', async () => {
		const local = await startResponseServer();
		const client = new ReferenceResearch('local-key', {
			baseURL: local.url,
			appURL: 'https://followthrough.test',
			defaultModel: 'openai/gpt-5.6',
			observer: { run: (_name, _context, body) => body() }
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
		const client = new ReferenceResearch('local-key', {
			baseURL: local.url,
			appURL: 'https://followthrough.test',
			defaultModel: 'test/model',
			observer: { run: (_name, _context, body) => body() }
		});
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
			hostname: 'www.rfc-editor.org',
			content: result.relevanceNote
		});
	});
});
