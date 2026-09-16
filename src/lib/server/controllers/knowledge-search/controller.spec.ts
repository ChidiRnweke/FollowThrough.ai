import { describe, it, expect } from 'vitest';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const actor = testActor();
const setup = searchControllerFixture;
describe('knowledge search content and scope', () => {
	it('returns the full chunk content untruncated', async () => {
		const fixture = setup();
		fixture.repository.documents = [
			{ userId: actor.userId, document: searchDocumentBuilder({ content: 'x'.repeat(2000) }) }
		];
		const result = await fixture.controller.search(actor, { query: 'q' });
		expect(result[0]?.content.length).toBe(2000);
	});
	it('limits search to the requested note', async () => {
		const fixture = setup();
		fixture.repository.documents = [
			{
				userId: actor.userId,
				document: searchDocumentBuilder({ noteId: testNoteId(9), content: 'Scoped note' })
			},
			{
				userId: actor.userId,
				document: searchDocumentBuilder({ noteId: testNoteId(8), content: 'Other note' })
			}
		];
		expect(
			(await fixture.controller.search(actor, { query: 'q', noteId: testNoteId(9) })).map(
				(match) => match.content
			)
		).toEqual(['Scoped note']);
	});
});
