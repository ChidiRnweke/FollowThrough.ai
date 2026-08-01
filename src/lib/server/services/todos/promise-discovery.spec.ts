import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import { PromiseDiscovery } from './promise-discovery';
import { DeterministicPromiseExtractor } from './promise-rules';
import { InMemoryStructuredPromiseClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 15,
	text: 'I will send it.'
};

const structured = {
	action: 'Send it',
	ownerName: null,
	responsibility: 'mine' as const,
	dueDateVerbatim: null,
	resolvedDueDate: null,
	strength: 'explicit' as const,
	confidence: 95
};

describe('Structured promise client boundary', () => {
	it('maps structured output into a domain promise', async () => {
		const client = new InMemoryStructuredPromiseClient();
		client.result = [structured];
		const extractor = new PromiseDiscovery({
			client,
			fallback: new DeterministicPromiseExtractor()
		});
		const result = await extractor.extract(testActor(), selection);
		expect(result[0]?.action).toBe('Send it');
	});

	it('omits a null owner from the domain promise', async () => {
		const client = new InMemoryStructuredPromiseClient();
		client.result = [structured];
		const extractor = new PromiseDiscovery({
			client,
			fallback: new DeterministicPromiseExtractor()
		});
		const result = await extractor.extract(testActor(), selection);
		expect(result[0]?.ownerName).toBeUndefined();
	});

	it('rejects a missing parsed output', async () => {
		const client = new InMemoryStructuredPromiseClient();
		const extractor = new PromiseDiscovery({
			client,
			fallback: new DeterministicPromiseExtractor()
		});
		await expect(extractor.extract(testActor(), selection)).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('maps a client failure to an external-service error', async () => {
		const client = new InMemoryStructuredPromiseClient();
		client.failure = new Error('network unavailable');
		const extractor = new PromiseDiscovery({
			client,
			fallback: new DeterministicPromiseExtractor()
		});
		await expect(extractor.extract(testActor(), selection)).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});

	it('uses deterministic extraction when no client is configured', async () => {
		const extractor = new PromiseDiscovery({
			apiKey: '',
			fallback: new DeterministicPromiseExtractor()
		});
		const result = await extractor.extract(testActor(), selection);
		expect(result[0]?.action).toBe('Send it');
	});
});
