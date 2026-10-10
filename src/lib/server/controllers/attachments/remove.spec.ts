import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { describe, expect, it } from 'vitest';
import { Attachments, type AttachmentsDependencies } from './controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
describe('attachment search removal', () => {
	it('removes the attachment and its indexed content together', async () => {
		const { service, repository, search, process } = setupAttachments();
		const attachment = view('application/pdf');
		await process(attachment);
		const controller = new Attachments(
			capabilityDependencies<AttachmentsDependencies>({
				attachments: service,
				attachmentIndexer: createContentIndex(search, new InMemoryEmbeddingClient().model)
					.attachments,
				transactionRunner: new InMemoryTransactionRunner([repository, search])
			})
		);
		await controller.removeById(testActor(), attachment.attachment.id);
		expect({ attachment: repository.found, chunks: search.documents }).toEqual({
			attachment: undefined,
			chunks: []
		});
	});
});

it('keeps attachment bytes when index removal rolls back', async () => {
	const { service, repository, search, storage, process } = setupAttachments();
	await process(view('application/pdf'));
	const controller = new Attachments(
		capabilityDependencies<AttachmentsDependencies>({
			attachments: service,
			attachmentIndexer: capabilityDependencies<AttachmentsDependencies['attachmentIndexer']>({
				remove: async () => {
					throw new Error('Index unavailable');
				}
			}),
			transactionRunner: new InMemoryTransactionRunner([repository, search])
		})
	);
	const result = await controller
		.removeById(testActor(), view('application/pdf').attachment.id)
		.then(
			() => 'removed',
			() => 'failed'
		);
	expect({
		result,
		attachment: repository.found?.attachment.id,
		bytes: storage.objects.has('objects/doc'),
		queued: [...repository.pendingObjectRemovals]
	}).toEqual({
		result: 'failed',
		attachment: view('application/pdf').attachment.id,
		bytes: true,
		queued: []
	});
});

it('commits physical cleanup intent without deleting bytes inside the transaction', async () => {
	const { service, repository, search, storage, process } = setupAttachments();
	await process(view('application/pdf'));
	const controller = new Attachments(
		capabilityDependencies<AttachmentsDependencies>({
			attachments: service,
			attachmentIndexer: createContentIndex(search, new InMemoryEmbeddingClient().model)
				.attachments,
			transactionRunner: new InMemoryTransactionRunner([repository, search])
		})
	);
	await controller.removeById(testActor(), view('application/pdf').attachment.id);
	expect({
		attachment: repository.found,
		bytes: storage.objects.has('objects/doc'),
		queued: [...repository.pendingObjectRemovals]
	}).toEqual({ attachment: undefined, bytes: true, queued: ['objects/doc'] });
});
