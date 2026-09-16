import { describe, expect, it } from 'vitest';
import {
	relatedNoteFixture as setup,
	relatedSelection as selection
} from '$lib/testing/relationships/fixtures/discovery';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import {
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('related-note proposal workflow', () => {
	it('creates one proposal from duplicate passages and preserves its relationship label', async () => {
		const { controller, repository } = setup();
		await repository.replaceForNote(testActor(), testNoteId(2), [
			searchDocumentBuilder(),
			searchDocumentBuilder({ chunkIndex: 1 })
		]);
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.suggestions.map((suggestion) => suggestion.payload)).toMatchObject([
			{ targetNoteId: testNoteId(2), kind: 'prior_decision', justification: 'Earlier decision' }
		]);
	});
	it('excludes its own note and notes from other projects', async () => {
		const { controller, repository } = setup();
		await repository.replaceForNote(testActor(), testNoteId(), [
			searchDocumentBuilder({ noteId: testNoteId() })
		]);
		await repository.replaceForNote(testActor(), testNoteId(2), [
			searchDocumentBuilder({ projectId: testProjectId(2) })
		]);
		expect((await controller.suggestFromSelection(testActor(), { selection })).suggestions).toEqual(
			[]
		);
	});
	it('returns no proposals when retrieval has no matches', async () => {
		const { controller } = setup();
		expect((await controller.suggestFromSelection(testActor(), { selection })).suggestions).toEqual(
			[]
		);
	});
	it('rolls back the selection anchor when proposal persistence fails', async () => {
		const { controller, repository, suggestions, content } = setup();
		await repository.replaceForNote(testActor(), testNoteId(2), [searchDocumentBuilder()]);
		suggestions.failCreation = true;
		try {
			await controller.suggestFromSelection(testActor(), { selection });
		} catch {
			/* Inspect the durable result below. */
		}
		expect(content.anchors).toEqual([]);
	});
	it('rejects cancelled work before publishing any proposal', async () => {
		const { controller } = setup();
		await expect(
			controller.suggestFromSelection(
				testActor(),
				{ selection },
				AbortSignal.abort(new Error('Cancelled'))
			)
		).rejects.toThrow('Cancelled');
	});
});
