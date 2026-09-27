import { expect, it } from 'vitest';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import type { NoteRevisionId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { InMemoryStorage } from '$lib/testing/attachments/fakes/processing';
import { context, now, seedNote } from '../database-harness';

it('restores the snapshotted attachment with its file bytes after path removal', async () => {
	const { owner, note } = await seedNote('32001');
	const tx = createTransactionContext(context.db);
	const records = new AttachmentRecords(tx.database);
	const notes = new NoteRecords(tx.database);
	const storage = new InMemoryStorage();
	const library = new AttachmentLibrary(records, notes, storage);
	const attachment = await tx.transactionRunner.run(async () => {
		const upload = await records.createUpload(owner, {
			id: crypto.randomUUID() as AttachmentUploadId,
			projectId: note.projectId,
			noteId: note.id,
			path: 'document.txt',
			objectKey: 'staging/document',
			mediaType: 'text/plain',
			byteSize: 128,
			checksumSha256: 'a'.repeat(64),
			expiresAt: now,
			createdAt: now
		});
		return records.finalize(owner, upload, {
			id: crypto.randomUUID() as AttachmentVersionId,
			attachmentId: crypto.randomUUID() as AttachmentId,
			objectKey: 'objects/doc',
			mediaType: 'text/plain',
			byteSize: 128,
			checksumSha256: 'a'.repeat(64),
			processingStatus: 'queued',
			createdAt: now
		});
	});
	const snapshot = await notes.insertRevision(owner, {
		id: crypto.randomUUID() as NoteRevisionId,
		noteId: note.id,
		revision: note.currentRevision,
		title: note.title,
		document: note.document,
		plainText: note.plainText,
		createdAt: now
	});
	await tx.transactionRunner.run(() => library.remove(owner, note.id, attachment.attachment.path));
	await tx.transactionRunner.run(() =>
		notes.restoreAttachmentSnapshot(owner, snapshot.id, note.id)
	);
	const restored = await records.findByPath(owner, note.id, attachment.attachment.path);
	expect({
		version: restored?.version.id,
		bytes: storage.objects.has(attachment.version.objectKey)
	}).toEqual({ version: attachment.version.id, bytes: true });
});
