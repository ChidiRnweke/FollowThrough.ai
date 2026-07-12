import { describe, expect, it } from 'vitest';
import { InMemoryStructuredRelationshipClient } from '$lib/testing/fakes/in-memory-pipelines';
import { OpenAIRelationshipClassifier } from './openai-relationship-capabilities';

describe('Relationship classification invariants', () => {
	it('uses structured model classification when configured', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		client.result = {
			kind: 'elaborates',
			justification: 'The target adds deployment details.',
			confidence: 88
		};
		const result = await new OpenAIRelationshipClassifier({ client }).classify(
			'Deploy through a pipeline.',
			'The pipeline has staging and production gates.'
		);
		expect(result.kind).toBe('elaborates');
	});

	it('uses deterministic classification without model configuration', async () => {
		const result = await new OpenAIRelationshipClassifier({ apiKey: '' }).classify(
			'Do not use synchronous calls.',
			'The service uses synchronous HTTP.'
		);
		expect(result.kind).toBe('contradicts');
	});

	it('rejects absent structured output', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		await expect(
			new OpenAIRelationshipClassifier({ client }).classify('source', 'target')
		).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
	});

	it('maps provider failures to a typed external-service error', async () => {
		const client = new InMemoryStructuredRelationshipClient();
		client.failure = new Error('provider unavailable');
		await expect(
			new OpenAIRelationshipClassifier({ client }).classify('source', 'target')
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});
});
