import { describe, expect, it } from 'vitest';
import type { TextSelection } from '$lib/models/notes';
import { PromiseDiscovery } from './promise-discovery';
import { InMemoryStructuredPromiseClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 15,
	text: 'I will send it.'
};

const context = { model: 'test/model', requestedAt: testNow };

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
	it('maps the structured action and omits a null owner', async () => {
		const client = new InMemoryStructuredPromiseClient();
		client.result = [structured];
		const extractor = new PromiseDiscovery(client);
		const result = await extractor.extract(testActor(), selection, context);
		expect({ action: result[0]?.action, ownerName: result[0]?.ownerName }).toEqual({
			action: 'Send it',
			ownerName: undefined
		});
	});

	it('rejects a missing parsed output', async () => {
		const client = new InMemoryStructuredPromiseClient();
		const extractor = new PromiseDiscovery(client);
		await expect(extractor.extract(testActor(), selection, context)).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('maps a client failure to an external-service error', async () => {
		const client = new InMemoryStructuredPromiseClient();
		client.failure = new Error('network unavailable');
		const extractor = new PromiseDiscovery(client);
		await expect(extractor.extract(testActor(), selection, context)).rejects.toMatchObject({
			code: 'EXTERNAL_SERVICE'
		});
	});
});
