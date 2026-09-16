import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import type { Url } from '$lib/models/references';
import { ReferenceDiscovery } from './discovery';
import { ReferenceResearch } from '$lib/server/repositories/references/web-research';
import { InMemoryWebReferenceClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

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
	hostname: 'www.rfc-editor.org',
	content: 'Defines the selected authorization protocol.'
};

describe('Reference discovery', () => {
	it('returns structured web references', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [result];
		const finder = new ReferenceDiscovery(client);
		const references = await finder.find(testActor(), selection);
		expect(references[0]).toMatchObject({
			url: result.url,
			tier: 'standard',
			confidence: 95,
			relevanceNote: result.content
		});
	});

	it('accepts an honest empty web result', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = new ReferenceDiscovery(client);
		const references = await finder.find(testActor(), selection);
		expect(references).toEqual([]);
	});

	it('passes the selected conversation model to the web client', async () => {
		const client = new InMemoryWebReferenceClient();
		client.result = [];
		const finder = new ReferenceDiscovery(client);
		await finder.find(testActor(), selection, { model: 'google/gemini-3-flash' });
		expect(client.model).toBe('google/gemini-3-flash');
	});

	it('rejects a missing structured web result', async () => {
		const client = new InMemoryWebReferenceClient();
		const finder = new ReferenceDiscovery(client);
		await expect(finder.find(testActor(), selection)).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('maps web client failures to an external-service error', async () => {
		const client = new InMemoryWebReferenceClient();
		client.failure = new Error('search unavailable');
		const finder = new ReferenceDiscovery(client);
		await expect(finder.find(testActor(), selection)).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});

	it('reports missing configuration instead of claiming there are no relevant sources', async () => {
		const finder = new ReferenceDiscovery(
			new ReferenceResearch('', {
				baseURL: 'http://127.0.0.1:9',
				appURL: 'https://followthrough.test',
				defaultModel: 'test/model',
				observer: { run: (_name, _context, body) => body() }
			})
		);
		await expect(finder.find(testActor(), selection)).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});
});
