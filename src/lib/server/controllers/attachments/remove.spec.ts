import { describe, expect, it } from 'vitest';
import { Attachments } from './controller';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
describe('attachment search removal', () => {
	it('removes the attachment and its indexed content together', async () => {
		const { service, repository, search, process } = setupAttachments();
		const attachment = view('application/pdf');
		await process(attachment);
		const controller = new Attachments({
			attachments: service,
			attachmentIndexer: new ContentIndex(search, new InMemoryEmbeddingClient().model).attachments,
			transactionRunner: new InMemoryTransactionRunner([repository, search])
		});
		await controller.removeById(testActor(), attachment.attachment.id);
		expect({ attachment: repository.found, chunks: search.documents }).toEqual({
			attachment: undefined,
			chunks: []
		});
	});
});
