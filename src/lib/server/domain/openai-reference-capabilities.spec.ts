import { describe, expect, it } from 'vitest';
import type { TextSelection, Url } from '$lib/models';
import { WebSearchReferenceFinder } from './openai-reference-capabilities';
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

describe('Web reference client boundary', () => {
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
