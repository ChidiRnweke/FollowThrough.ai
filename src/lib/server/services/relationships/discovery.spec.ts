import { describe, expect, it } from 'vitest';
import { InMemoryStructuredRelationshipClient } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { RelationshipDiscovery } from './discovery';

describe('Relationship classification invariants', () => {
	it('uses structured model classification when configured', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		client.result = {
			kind: 'elaborates',
			justification: 'The target adds deployment details.',
			confidence: 88
		};
		const result = await new RelationshipDiscovery(client).classify(
			'Deploy through a pipeline.',
			'The pipeline has staging and production gates.',
			'test/model'
		);
		expect(result.kind).toBe('elaborates');
	});

	it('rejects absent structured output', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		await expect(
			new RelationshipDiscovery(client).classify('source', 'target', 'test/model')
		).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
	});

	it('maps provider failures to a typed external-service error', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		client.failure = new Error('provider unavailable');
		await expect(
			new RelationshipDiscovery(client).classify('source', 'target', 'test/model')
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
});
