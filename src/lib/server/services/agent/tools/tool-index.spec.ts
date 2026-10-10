import { expect, it } from 'vitest';
import { ToolCatalogIndex, toolContentHash, toolEmbeddingText } from './tool-index';
import { failureReport } from '$lib/errors';
import { InMemoryToolEmbeddingRepository } from '$lib/testing/agent/fakes/in-memory-tool-embeddings';

it('uses concise discovery wording instead of the execution contract', () => {
	expect(
		toolEmbeddingText({
			name: 'edit_note',
			description: 'Long execution contract',
			retrievalText: 'change one sentence'
		})
	).toBe('edit_note: change one sentence');
});

it('ignores execution-only wording when the discovery text is unchanged', () => {
	const original = {
		name: 'edit_note',
		description: 'Old execution contract',
		retrievalText: 'change one sentence'
	};
	expect(toolContentHash({ ...original, description: 'Updated execution contract' })).toBe(
		toolContentHash(original)
	);
});

it('reports a missing seed as a fault the model must not retry', async () => {
	const index = new ToolCatalogIndex(new InMemoryToolEmbeddingRepository());
	const report = await index.rank(['edit_note'], [0, 1], 'test-model', 5).then(
		() => undefined,
		(error: unknown) => failureReport(error)
	);
	expect(report?.advice).toMatch(/^Do not retry this call\./);
});
