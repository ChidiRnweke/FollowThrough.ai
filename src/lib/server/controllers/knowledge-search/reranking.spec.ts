import { describe, it, expect } from 'vitest';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const actor = testActor();
const setup = (count: number) => {
	const fixture = searchControllerFixture();
	fixture.repository.documents = Array.from({ length: count }, (_, index) => ({
		userId: actor.userId,
		document: searchDocumentBuilder({ content: 'candidate ' + index })
	}));
	return fixture;
};
describe('controller-owned search ranking', () => {
	it('ranks the wider pool before choosing the requested ten results', async () => {
		const fixture = setup(60);
		fixture.reranker.order = 'reverse';
		const results = await fixture.controller.search(actor, { query: 'query', limit: 10 });
		expect(results.map((match) => match.content)).toEqual(
			Array.from({ length: 10 }, (_, index) => 'candidate ' + (49 - index))
		);
	});
	it('narrows candidates to the requested result count', async () => {
		const fixture = setup(60);
		expect(await fixture.controller.search(actor, { query: 'query', limit: 8 })).toHaveLength(8);
	});
	it('returns nothing for a blank query', async () => {
		expect(await setup(60).controller.search(actor, { query: '   ' })).toEqual([]);
	});
	it('honors ranking when the candidate set is already within the limit', async () => {
		const fixture = setup(2);
		fixture.reranker.order = 'reverse';
		expect(
			(await fixture.controller.search(actor, { query: 'query', limit: 10 }))[0]?.content
		).toBe('candidate 1');
	});
	it('retains vector order when reranking is unavailable', async () => {
		const fixture = setup(3);
		fixture.reranker.failure = new Error('reranker unavailable');
		expect(
			(await fixture.controller.search(actor, { query: 'query', limit: 2 })).map(
				(match) => match.content
			)
		).toEqual(['candidate 0', 'candidate 1']);
	});
	it('returns the sole candidate while ranking is unavailable', async () => {
		const fixture = setup(1);
		fixture.reranker.failure = new Error('No provider available');
		expect(
			(await fixture.controller.search(actor, { query: 'query' })).map((match) => match.content)
		).toEqual(['candidate 0']);
	});
	it('rejects malformed embedding output instead of running an empty search', async () => {
		const fixture = setup(1);
		fixture.embeddings.returnWrongCount = true;
		await expect(fixture.controller.search(actor, { query: 'query' })).rejects.toThrow(
			'invalid result'
		);
	});
});
