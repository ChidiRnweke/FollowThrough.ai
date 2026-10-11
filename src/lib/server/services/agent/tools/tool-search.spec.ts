import { expect, it } from 'vitest';
import {
	InMemoryToolEmbeddingRepository,
	InMemoryToolEmbeddings
} from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { toolSearchFixture } from '$lib/testing/agent/fixtures/tool-discovery';

it('embeds concise discovery wording instead of the execution contract', async () => {
	const embeddings = new InMemoryToolEmbeddings();
	await toolSearchFixture(new InMemoryToolEmbeddingRepository(), embeddings).prepareSeed([
		{
			name: 'edit_note',
			description: 'Long execution contract',
			retrievalText: 'change one sentence'
		}
	]);
	expect(embeddings.requests).toEqual([['edit_note: change one sentence']]);
});

it('keeps stored vectors when only the execution wording changes', async () => {
	const search = toolSearchFixture(new InMemoryToolEmbeddingRepository());
	const original = {
		name: 'edit_note',
		description: 'Old execution contract',
		retrievalText: 'change one sentence'
	};
	await search.completeSeed(await search.prepareSeed([original]));
	const changed = await search.prepareSeed([
		{ ...original, description: 'Updated execution contract' }
	]);
	expect(changed.plan.pending).toEqual([]);
});
