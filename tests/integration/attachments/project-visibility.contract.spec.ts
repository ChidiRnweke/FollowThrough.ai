import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { attachmentUploads } from '$lib/server/db/schema/attachments';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import {
	AttachmentBacklogRecords,
	AttachmentRecords
} from '$lib/server/repositories/attachments/postgres/attachments';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import {
	AttachmentReadingService,
	AttachmentUploadService
} from '$lib/server/services/attachments/library';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string, noteOwned = true) => {
	const seed = await seedNote(suffix);
	const records = new AttachmentRecords(seed.owner, context.db);
	const createdAt = new Date().toISOString() as DateTime;
	const uploadInput = {
		id: crypto.randomUUID() as AttachmentUploadId,
		projectId: seed.project.id,
		...(noteOwned ? { noteId: seed.note.id } : {}),
		path: 'document.txt',
		objectKey: `staging/${suffix}`,
		mediaType: 'text/plain',
		byteSize: 128,
		checksumSha256: 'a'.repeat(64),
		createdAt,
		expiresAt: new Date(Date.now() + 600_000).toISOString() as DateTime
	};
	const upload = await records.createUpload(uploadInput);
	const attachment = await records.finalize(upload, {
		id: crypto.randomUUID() as AttachmentVersionId,
		attachmentId: crypto.randomUUID() as AttachmentId,
		objectKey: `objects/${suffix}`,
		mediaType: 'text/plain',
		byteSize: 128,
		checksumSha256: 'a'.repeat(64),
		processingStatus: 'queued',
		createdAt
	});
	const pendingUpload = await records.createUpload({
		...uploadInput,
		id: crypto.randomUUID() as AttachmentUploadId,
		objectKey: `staging/${suffix}/pending`
	});
	const archive = () => new ProjectRecords(seed.owner, context.db).archive(seed.project.id);
	const reader = new AttachmentReadingService(records);
	const uploads = new AttachmentUploadService(
		seed.owner,
		records,
		new NoteRecords(seed.owner, context.db),
		testClock
	);
	return { ...seed, records, reader, uploads, attachment, pendingUpload, archive };
};

it('hides note attachment lists after the owning project is archived', async () => {
	const { note, records, archive } = await setup('34001');
	await archive();
	expect(await records.list(note.id)).toEqual([]);
});

it('blocks attachment list, download, and path reads after project archival', async () => {
	const { project, note, records, reader, attachment, archive } = await setup('34002');
	await archive();
	expect(await records.listForProject(project.id)).toEqual([]);
	expect(await records.findByPath(note.id, 'document.txt')).toBeUndefined();
	await expect(reader.get(attachment.attachment.id)).rejects.toThrow('Attachment was not found');
});

it('rejects new upload reservations in archived projects', async () => {
	const { records, pendingUpload, archive } = await setup('34005');
	await archive();
	await expect(
		records.createUpload({ ...pendingUpload, id: crypto.randomUUID() as AttachmentUploadId })
	).rejects.toThrow('Project was not found');
});

it('refuses upload completion after its project is archived', async () => {
	const { uploads, pendingUpload, archive } = await setup('34006');
	await archive();
	await expect(uploads.pending(pendingUpload.id)).rejects.toThrow(
		'Attachment upload was not found'
	);
});

it('does not discover hidden project versions for background processing', async () => {
	const { attachment, archive } = await setup('34007');
	await archive();
	expect(
		(await new AttachmentBacklogRecords(context.db).listPendingVersions()).some(
			(row) => row.versionId === attachment.version.id
		)
	).toBe(false);
});

it('refuses to claim a hidden project version already selected for processing', async () => {
	const { records, attachment, archive } = await setup('34008');
	await archive();
	expect(await records.findVersionForUpdate(attachment.version.id)).toBeUndefined();
});

it('keeps an active owned attachment readable and downloadable', async () => {
	const { note, records, attachment, reader } = await setup('34009');
	expect({
		attachments: (await records.list(note.id)).map((view) => view.attachment.id),
		object: (await reader.get(attachment.attachment.id)).version.objectKey
	}).toEqual({
		attachments: [attachment.attachment.id],
		object: attachment.version.objectKey
	});
});

it('hides task attachment lists after project archival', async () => {
	const { owner, project, records, attachment, archive } = await setup('34010', false);
	const todo = await new TodoRecords(owner, context.db).insert(
		todoBuilder({ id: testTodoId(34010), userId: owner.userId, projectId: project.id })
	);
	await records.linkToTodo(attachment.attachment.id, todo.id);
	await archive();
	expect(await records.listForTodo(todo.id)).toEqual([]);
});

it('still discovers expired upload reservations in archived projects', async () => {
	const { records, pendingUpload, archive } = await setup('34011');
	await records.deleteUpload(pendingUpload.id);
	const expired = await records.createUpload({
		...pendingUpload,
		createdAt: '1999-12-31T23:00:00.000Z' as DateTime,
		expiresAt: '2000-01-01T00:00:00.000Z' as DateTime
	});
	await archive();
	try {
		expect(
			(
				await new AttachmentBacklogRecords(context.db).listExpiredUploads(
					new Date('2000-01-02'),
					100
				)
			).some(({ upload }) => upload.id === expired.id)
		).toBe(true);
	} finally {
		// Global maintenance tests share this database; remove this scenario's expired row.
		await records.deleteUpload(expired.id);
	}
});

it('still deletes reclaimed upload reservations in archived projects', async () => {
	const { records, pendingUpload, archive } = await setup('34012');
	await archive();
	await records.deleteUpload(pendingUpload.id);
	expect(
		await context.db
			.select({ id: attachmentUploads.id })
			.from(attachmentUploads)
			.where(eq(attachmentUploads.id, pendingUpload.id))
	).toEqual([]);
});

// ADR 0017: a reserved upload is not a file until it is completed.
it('lists only completed attachments while another upload is still pending', async () => {
	const { note, records, reader, attachment, pendingUpload } = await setup('34090');
	expect({
		forNote: (await records.list(note.id)).map((view) => view.attachment.id),
		readPending: await reader.get(pendingUpload.id as unknown as AttachmentId).then(
			() => 'found',
			(error: Error) => error.message
		)
	}).toEqual({
		forNote: [attachment.attachment.id],
		readPending: 'Attachment was not found'
	});
});
