import { expect, it } from 'vitest';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { context, now, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const transaction = createTransactionContext(context.db);
	const records = new AttachmentRecords(transaction.database);
	const keys = [`objects/${suffix}/first`, `objects/${suffix}/second`];
	const attachmentId = crypto.randomUUID() as AttachmentId;
	for (const objectKey of keys) {
		await transaction.transactionRunner.run(async () => {
			const upload = await records.createUpload(owner, {
				id: crypto.randomUUID() as AttachmentUploadId,
				projectId: project.id,
				path: 'document.txt',
				objectKey: `staging/${objectKey}`,
				mediaType: 'text/plain',
				byteSize: 128,
				checksumSha256: 'a'.repeat(64),
				expiresAt: now,
				createdAt: now
			});
			await records.finalize(owner, upload, {
				id: crypto.randomUUID() as AttachmentVersionId,
				attachmentId,
				objectKey,
				mediaType: 'text/plain',
				byteSize: 128,
				checksumSha256: 'a'.repeat(64),
				processingStatus: 'queued',
				createdAt: now
			});
		});
	}
	return { owner, transaction, records, keys, attachmentId };
};

it('commits every version key for cleanup when permanently removing an attachment', async () => {
	const { owner, records, keys, attachmentId } = await setup('32811');
	await records.removeById(owner, attachmentId);
	const persisted = new AttachmentRecords(context.db);
	expect({
		attachment: await persisted.findById(owner, attachmentId),
		keys: (await persisted.listPendingObjectRemovals()).filter((key) => keys.includes(key)).sort()
	}).toEqual({ attachment: undefined, keys });
});

it('rolls back cleanup work with the attachment when downstream indexing fails', async () => {
	const { owner, transaction, records, keys, attachmentId } = await setup('32812');
	const result = await transaction.transactionRunner
		.run(async () => {
			await records.removeById(owner, attachmentId);
			throw new Error('Index failed');
		})
		.then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
	const persisted = new AttachmentRecords(context.db);
	expect({
		result,
		objectKey: (await persisted.findById(owner, attachmentId))?.version.objectKey,
		keys: (await persisted.listPendingObjectRemovals()).filter((key) => keys.includes(key))
	}).toEqual({ result: 'Index failed', objectKey: keys[1], keys: [] });
});
