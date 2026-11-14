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

it('embeds connector tools in order under the catalog wording, without storing them', async () => {
	const embeddings = new InMemoryToolEmbeddings();
	const repository = new InMemoryToolEmbeddingRepository();
	const result = await toolSearchFixture(repository, embeddings).embedConnectorTools([
		{ name: 'linear__create_issue', description: '[Linear] Create issue. Files a new issue.' },
		{ name: 'linear__list_issues', description: '[Linear] List issues. Finds issues.' }
	]);
	expect({
		requests: embeddings.requests,
		vectors: result.vectors.length,
		stored: await repository.list()
	}).toEqual({
		requests: [
			[
				'linear__create_issue: [Linear] Create issue. Files a new issue.',
				'linear__list_issues: [Linear] List issues. Finds issues.'
			]
		],
		vectors: 2,
		stored: []
	});
});
