import { and, asc, eq } from 'drizzle-orm';
import type {
	ActorContext,
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView,
	DateTime,
	NoteId
} from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { AttachmentRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

const toUpload = (row: typeof schema.attachmentUploads.$inferSelect): AttachmentUpload => ({
	id: row.id as AttachmentUpload['id'],
	noteId: row.noteId as NoteId,
	path: row.path,
	objectKey: row.objectKey,
	mediaType: row.mediaType,
	byteSize: row.byteSize,
	checksumSha256: row.checksumSha256,
	expiresAt: instant(row.expiresAt),
	createdAt: instant(row.createdAt)
});

const toView = (
	attachment: typeof schema.attachments.$inferSelect,
	version: typeof schema.attachmentVersions.$inferSelect
): AttachmentView => ({
	attachment: {
		id: attachment.id as Attachment['id'],
		noteId: attachment.noteId as NoteId,
		path: attachment.path,
		currentVersionId: version.id as AttachmentVersion['id'],
		createdAt: instant(attachment.createdAt),
		updatedAt: instant(attachment.updatedAt)
	},
	version: {
		id: version.id as AttachmentVersion['id'],
		attachmentId: attachment.id as Attachment['id'],
		objectKey: version.objectKey,
		mediaType: version.mediaType,
		byteSize: version.byteSize,
		checksumSha256: version.checksumSha256,
		...(version.parserKind ? { parserKind: version.parserKind } : {}),
		...(version.extractedText ? { extractedText: version.extractedText } : {}),
		createdAt: instant(version.createdAt)
	}
});

export class PostgresAttachmentRepository implements AttachmentRepository {
	constructor(private readonly database: Database) {}

	async createUpload(actor: ActorContext, upload: AttachmentUpload): Promise<AttachmentUpload> {
		const [note] = await this.database
			.select({ id: schema.notes.id })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, upload.noteId), eq(schema.notes.userId, actor.userId)));
		if (!note) throw new NotFoundError('Note was not found');
		const [row] = await this.database
			.insert(schema.attachmentUploads)
			.values({
				id: upload.id,
				userId: actor.userId,
				noteId: upload.noteId,
				path: upload.path,
				objectKey: upload.objectKey,
				mediaType: upload.mediaType,
				byteSize: upload.byteSize,
				checksumSha256: upload.checksumSha256,
				expiresAt: new Date(upload.expiresAt),
				createdAt: new Date(upload.createdAt)
			})
			.returning();
		return toUpload(row!);
	}

	async findUpload(actor: ActorContext, id: AttachmentUpload['id']) {
		const [row] = await this.database
			.select()
			.from(schema.attachmentUploads)
			.where(
				and(eq(schema.attachmentUploads.id, id), eq(schema.attachmentUploads.userId, actor.userId))
			);
		return row ? toUpload(row) : undefined;
	}

	async deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void> {
		await this.database
			.delete(schema.attachmentUploads)
			.where(
				and(eq(schema.attachmentUploads.id, id), eq(schema.attachmentUploads.userId, actor.userId))
			);
	}

	async list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]> {
		return (
			await this.database
				.select({ attachment: schema.attachments, version: schema.attachmentVersions })
				.from(schema.attachments)
				.innerJoin(
					schema.attachmentVersions,
					eq(schema.attachmentVersions.id, schema.attachments.currentVersionId)
				)
				.where(
					and(eq(schema.attachments.noteId, noteId), eq(schema.attachments.userId, actor.userId))
				)
				.orderBy(asc(schema.attachments.path))
		).map(({ attachment, version }) => toView(attachment, version));
	}

	async findByPath(actor: ActorContext, noteId: NoteId, path: string) {
		return (await this.list(actor, noteId)).find((item) => item.attachment.path === path);
	}

	async finalize(
		actor: ActorContext,
		upload: AttachmentUpload,
		version: AttachmentVersion
	): Promise<AttachmentView> {
		const [existing] = await this.database
			.select({ id: schema.attachments.id })
			.from(schema.attachments)
			.where(
				and(
					eq(schema.attachments.userId, actor.userId),
					eq(schema.attachments.noteId, upload.noteId),
					eq(schema.attachments.path, upload.path)
				)
			);
		let attachmentId = existing?.id as Attachment['id'] | undefined;
		if (!attachmentId) {
			const [attachment] = await this.database
				.insert(schema.attachments)
				.values({
					id: version.attachmentId,
					userId: actor.userId,
					noteId: upload.noteId,
					path: upload.path
				})
				.returning();
			attachmentId = attachment!.id as Attachment['id'];
		}
		const [storedVersion] = await this.database
			.insert(schema.attachmentVersions)
			.values({
				id: version.id,
				attachmentId,
				objectKey: version.objectKey,
				mediaType: version.mediaType,
				byteSize: version.byteSize,
				checksumSha256: version.checksumSha256,
				parserKind: version.parserKind,
				extractedText: version.extractedText,
				createdAt: new Date(version.createdAt)
			})
			.returning();
		const [storedAttachment] = await this.database
			.update(schema.attachments)
			.set({ currentVersionId: storedVersion!.id, updatedAt: new Date() })
			.where(
				and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.userId, actor.userId))
			)
			.returning();
		await this.deleteUpload(actor, upload.id);
		return toView(storedAttachment!, storedVersion!);
	}

	async remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void> {
		await this.database
			.update(schema.attachments)
			.set({ currentVersionId: null, updatedAt: new Date() })
			.where(
				and(
					eq(schema.attachments.userId, actor.userId),
					eq(schema.attachments.noteId, noteId),
					eq(schema.attachments.path, path)
				)
			);
	}
}
