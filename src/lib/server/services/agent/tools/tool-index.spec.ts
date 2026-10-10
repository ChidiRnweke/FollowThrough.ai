import { expect, it } from 'vitest';
import { ToolCatalogIndex } from './tool-index';
import { InMemoryToolEmbeddingRepository } from '$lib/testing/agent/fakes/in-memory-tool-embeddings';

it('embeds concise discovery wording instead of the execution contract', async () => {
	const index = new ToolCatalogIndex(new InMemoryToolEmbeddingRepository());
	const plan = await index.prepare(
		[
			{
				name: 'edit_note',
				description: 'Long execution contract',
				retrievalText: 'change one sentence'
			}
		],
		'test-model'
	);
	expect(plan.pending.map((entry) => entry.input)).toEqual(['edit_note: change one sentence']);
});

it('keeps stored vectors when only the execution wording changes', async () => {
	const index = new ToolCatalogIndex(new InMemoryToolEmbeddingRepository());
	const original = {
		name: 'edit_note',
		description: 'Old execution contract',
		retrievalText: 'change one sentence'
	};
	const plan = await index.prepare([original], 'test-model');
	await index.complete(plan, { model: 'test-model', vectors: [[1, 0]] });
	const changed = await index.prepare(
		[{ ...original, description: 'Updated execution contract' }],
		'test-model'
	);
	expect(changed.pending).toEqual([]);
});
