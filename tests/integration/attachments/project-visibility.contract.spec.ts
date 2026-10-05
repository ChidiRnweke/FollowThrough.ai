import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { attachmentUploads } from '$lib/server/db/schema/attachments';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { AttachmentLibrary } from '$lib/server/services/attachments/library';
import { InMemoryStorage } from '$lib/testing/attachments/fakes/processing';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string, noteOwned = true) => {
	const seed = await seedNote(suffix);
	const records = new AttachmentRecords(context.db);
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
	const upload = await records.createUpload(seed.owner, uploadInput);
	const attachment = await records.finalize(seed.owner, upload, {
		id: crypto.randomUUID() as AttachmentVersionId,
		attachmentId: crypto.randomUUID() as AttachmentId,
		objectKey: `objects/${suffix}`,
		mediaType: 'text/plain',
		byteSize: 128,
		checksumSha256: 'a'.repeat(64),
		processingStatus: 'queued',
		createdAt
	});
	const pendingUpload = await records.createUpload(seed.owner, {
		...uploadInput,
		id: crypto.randomUUID() as AttachmentUploadId,
		objectKey: `staging/${suffix}/pending`
	});
	const archive = () => new ProjectRecords(context.db).archive(seed.owner, seed.project.id);
	const library = new AttachmentLibrary(
		records,
		new NoteRecords(context.db),
		new InMemoryStorage()
	);
	return { ...seed, records, library, attachment, pendingUpload, archive };
};

it('hides note attachment lists after the owning project is archived', async () => {
	const { owner, note, records, archive } = await setup('34001');
	await archive();
	expect(await records.list(owner, note.id)).toEqual([]);
});

it('blocks attachment list, download, and path reads after project archival', async () => {
	const { owner, project, note, records, library, attachment, archive } = await setup('34002');
	await archive();
	expect(await records.listForProject(owner, project.id)).toEqual([]);
	expect(await records.findByPath(owner, note.id, 'document.txt')).toBeUndefined();
	await expect(library.downloadById(owner, attachment.attachment.id)).rejects.toThrow(
		'Attachment was not found'
	);
});

it('rejects new upload reservations in archived projects', async () => {
	const { owner, records, pendingUpload, archive } = await setup('34005');
	await archive();
	await expect(
		records.createUpload(owner, { ...pendingUpload, id: crypto.randomUUID() as AttachmentUploadId })
	).rejects.toThrow('Project was not found');
});

it('refuses upload completion after its project is archived', async () => {
	const { owner, library, pendingUpload, archive } = await setup('34006');
	await archive();
	await expect(library.complete(owner, pendingUpload.id)).rejects.toThrow(
		'Attachment upload was not found'
	);
});

it('does not discover hidden project versions for background processing', async () => {
	const { records, attachment, archive } = await setup('34007');
	await archive();
	expect(
		(await records.listPendingVersions()).some((row) => row.versionId === attachment.version.id)
	).toBe(false);
});

it('refuses to claim a hidden project version already selected for processing', async () => {
	const { owner, records, attachment, archive } = await setup('34008');
	await archive();
	expect(await records.findVersionForUpdate(owner, attachment.version.id)).toBeUndefined();
});

it('keeps an active owned attachment readable and downloadable', async () => {
	const { owner, note, records, attachment, library } = await setup('34009');
	expect({
		attachments: (await records.list(owner, note.id)).map((view) => view.attachment.id),
		download: await library.downloadById(owner, attachment.attachment.id)
	}).toEqual({
		attachments: [attachment.attachment.id],
		download: { url: 'https://storage.test/presigned' }
	});
});

it('hides task attachment lists after project archival', async () => {
	const { owner, project, records, attachment, archive } = await setup('34010', false);
	const todo = await new TodoRecords(context.db).insert(
		owner,
		todoBuilder({ id: testTodoId(34010), userId: owner.userId, projectId: project.id })
	);
	await records.linkToTodo(owner, attachment.attachment.id, todo.id);
	await archive();
	expect(await records.listForTodo(owner, todo.id)).toEqual([]);
});

it('still discovers expired upload reservations in archived projects', async () => {
	const { owner, records, pendingUpload, archive } = await setup('34011');
	await records.deleteUpload(owner, pendingUpload.id);
	const expired = await records.createUpload(owner, {
		...pendingUpload,
		createdAt: '1999-12-31T23:00:00.000Z' as DateTime,
		expiresAt: '2000-01-01T00:00:00.000Z' as DateTime
	});
	await archive();
	try {
		expect(
			(await records.listExpiredUploads(new Date('2000-01-02'), 100)).some(
				({ upload }) => upload.id === expired.id
			)
		).toBe(true);
	} finally {
		// Global maintenance tests share this database; remove this scenario's expired row.
		await records.deleteUpload(owner, expired.id);
	}
});

it('still deletes reclaimed upload reservations in archived projects', async () => {
	const { owner, records, pendingUpload, archive } = await setup('34012');
	await archive();
	await records.deleteUpload(owner, pendingUpload.id);
	expect(
		await context.db
			.select({ id: attachmentUploads.id })
			.from(attachmentUploads)
			.where(eq(attachmentUploads.id, pendingUpload.id))
	).toEqual([]);
});
