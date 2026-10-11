import { describe, expect, it } from 'vitest';
import type { AttachmentId } from '$lib/models/attachments';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import {
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const document = (overrides: Partial<SearchDocument> = {}): SearchDocument => ({
	id: crypto.randomUUID() as SearchDocumentId,
	projectId: testProjectId(),
	noteId: testNoteId(2),
	content: 'The platform uses asynchronous messaging.',
	contentHash: 'hash',
	sourceRevision: 1,
	chunkIndex: 0,
	embedding: [1, 0, 0],
	embeddingModel: 'fake',
	...overrides
});

const searchOver = async (documents: readonly SearchDocument[]) => {
	const repository = new InMemorySearchRepository();
	for (const item of documents)
		await repository.replaceForNote(testActor(), item.noteId ?? testNoteId(), [item]);
	const provider = new InMemoryRetrievalProvider();
	provider.vectorsByContent.set('messaging', [1, 0, 0]);
	return {
		knowledge: createTestContentIndex(repository, 'fake', undefined, false, provider),
		provider
	};
};

describe('knowledge search sources', () => {
	it('identifies an attachment chunk by its source rather than the containing note', async () => {
		const attachmentId = crypto.randomUUID() as AttachmentId;
		const { knowledge } = await searchOver([]);
		expect(knowledge.source(document({ attachmentId }))).toMatchObject({
			kind: 'attachment',
			id: attachmentId
		});
	});
	it('identifies a widget chunk as the widget, so the agent can open it by id', async () => {
		const widgetId = testWidgetId();
		const { knowledge } = await searchOver([]);
		expect(
			knowledge.source(document({ noteId: undefined, widgetId, sourceTitle: 'Widget: Launch' }))
		).toMatchObject({ kind: 'widget', id: widgetId, title: 'Widget: Launch' });
	});
});

describe('knowledge search scope', () => {
	it('rejects a query embedding without exactly one vector', async () => {
		const { knowledge, provider } = await searchOver([document()]);
		provider.returnWrongCount = true;
		await expect(
			knowledge.candidates(testActor(), 'messaging', { limit: 10 })
		).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
	});
	it('limits vector results to the requested project', async () => {
		const { knowledge } = await searchOver([
			document(),
			document({ noteId: testNoteId(3), projectId: testProjectId(2) })
		]);
		const matches = await knowledge.candidates(testActor(), 'messaging', {
			limit: 10,
			projectId: testProjectId()
		});
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(2)]);
	});
	it('limits vector results to the requested note', async () => {
		const { knowledge } = await searchOver([document(), document({ noteId: testNoteId(3) })]);
		const matches = await knowledge.candidates(testActor(), 'messaging', {
			limit: 10,
			filter: { noteId: testNoteId(3) }
		});
		expect(matches.map((match) => match.document.noteId)).toEqual([testNoteId(3)]);
	});
});

describe('embedding backfill', () => {
	it('embeds pending chunks with their source context', async () => {
		const repository = new InMemorySearchRepository();
		const provider = new InMemoryRetrievalProvider();
		const source = { kind: 'note' as const, noteId: testNoteId(2) };
		await repository.stage(testActor(), source, [
			searchDocumentBuilder({
				sourceTitle: 'Project decisions',
				content: 'Keep accepted evidence.',
				embedding: undefined,
				embeddingModel: undefined
			})
		]);
		await createTestContentIndex(repository, 'fake', undefined, false, provider).embedPending(
			testActor(),
			source
		);
		expect(provider.embeddingRequests).toEqual([['Project decisions\nKeep accepted evidence.']]);
	});

	it('splits provider requests at the token budget, in order, without splitting an input', async () => {
		const repository = new InMemorySearchRepository();
		const provider = new InMemoryRetrievalProvider();
		const source = { kind: 'note' as const, noteId: testNoteId(2) };
		const contents = ['first', 'word '.repeat(31_000), 'second', 'third'];
		await repository.stage(
			testActor(),
			source,
			contents.map((content, chunkIndex) =>
				searchDocumentBuilder({
					sourceTitle: '',
					content,
					chunkIndex,
					embedding: undefined,
					embeddingModel: undefined
				})
			)
		);
		const embedded = await createTestContentIndex(
			repository,
			'fake',
			undefined,
			false,
			provider
		).embedPending(testActor(), source);
		expect({
			requests: provider.embeddingRequests.map((request) => request.length),
			chunks: embedded.chunks.length
		}).toEqual({ requests: [1, 1, 2], chunks: 4 });
	});
});
