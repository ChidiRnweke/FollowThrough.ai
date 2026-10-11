import { describe, expect, it } from 'vitest';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

// ADR 0036: rerank every search with at least two candidates; one candidate cannot change position.
const setup = (count: number) => {
	const fixture = searchControllerFixture();
	fixture.repository.documents = Array.from({ length: count }, (_, index) => ({
		userId: testActor().userId,
		document: searchDocumentBuilder({ content: 'candidate ' + index })
	}));
	return fixture;
};

describe('reranking by candidate count', () => {
	it('sends no rerank request for a single candidate', async () => {
		const { controller, provider } = setup(1);
		const results = await controller.search({ query: 'query', limit: 8 });
		expect({
			contents: results.map((match) => match.content),
			rerankRequests: provider.rerankRequests.length
		}).toEqual({ contents: ['candidate 0'], rerankRequests: 0 });
	});

	it('sends exactly one rerank request for two candidates', async () => {
		const { controller, provider } = setup(2);
		await controller.search({ query: 'query', limit: 8 });
		expect(provider.rerankRequests).toHaveLength(1);
	});
});
