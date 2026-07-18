import { and, asc, eq, sql } from 'drizzle-orm';
import type {
	ActorContext,
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView,
	DateTime,
	NoteId,
	ProjectId
} from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { AttachmentRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

const toUpload = (row: typeof schema.attachmentUploads.$inferSelect): AttachmentUpload => ({
	id: row.id as AttachmentUpload['id'],
	projectId: row.projectId as ProjectId,
	...(row.noteId ? { noteId: row.noteId as NoteId } : {}),
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
		projectId: attachment.projectId as ProjectId,
		...(attachment.noteId ? { noteId: attachment.noteId as NoteId } : {}),
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
		processingStatus: version.processingStatus as AttachmentVersion['processingStatus'],
		...(version.processingFailure ? { processingFailure: version.processingFailure } : {}),
		...(version.processedAt ? { processedAt: instant(version.processedAt) } : {}),
		createdAt: instant(version.createdAt)
	}
});

export class PostgresAttachmentRepository implements AttachmentRepository {
	constructor(private readonly database: Database) {}

	async createUpload(actor: ActorContext, upload: AttachmentUpload): Promise<AttachmentUpload> {
		const [project] = await this.database
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(
				and(eq(schema.projects.id, upload.projectId), eq(schema.projects.userId, actor.userId))
			);
		if (!project) throw new NotFoundError('Project was not found');
		const [row] = await this.database
			.insert(schema.attachmentUploads)
			.values({
				id: upload.id,
				userId: actor.userId,
				projectId: upload.projectId,
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

	async listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly AttachmentView[]> {
		return (
			await this.database
				.select({ attachment: schema.attachments, version: schema.attachmentVersions })
				.from(schema.attachments)
				.innerJoin(
					schema.attachmentVersions,
					eq(schema.attachmentVersions.id, schema.attachments.currentVersionId)
				)
				.where(
					and(
						eq(schema.attachments.projectId, projectId),
						eq(schema.attachments.userId, actor.userId),
						sql`${schema.attachments.noteId} is null`
					)
				)
				.orderBy(asc(schema.attachments.path))
		).map(({ attachment, version }) => toView(attachment, version));
	}

	async findById(actor: ActorContext, id: Attachment['id']): Promise<AttachmentView | undefined> {
		const [row] = await this.database
			.select({ attachment: schema.attachments, version: schema.attachmentVersions })
			.from(schema.attachments)
			.innerJoin(
				schema.attachmentVersions,
				eq(schema.attachmentVersions.id, schema.attachments.currentVersionId)
			)
			.where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, actor.userId)));
		return row ? toView(row.attachment, row.version) : undefined;
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
					eq(schema.attachments.projectId, upload.projectId),
					upload.noteId
						? eq(schema.attachments.noteId, upload.noteId)
						: sql`${schema.attachments.noteId} is null`,
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
					projectId: upload.projectId,
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
				processingStatus: version.processingStatus,
				processingFailure: version.processingFailure,
				processedAt: version.processedAt ? new Date(version.processedAt) : undefined,
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

	async removeById(actor: ActorContext, id: Attachment['id']): Promise<void> {
		await this.database
			.delete(schema.attachments)
			.where(and(eq(schema.attachments.id, id), eq(schema.attachments.userId, actor.userId)));
	}

	async updateVersion(actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView> {
		const [row] = await this.database
			.update(schema.attachmentVersions)
			.set({
				parserKind: version.parserKind,
				extractedText: version.extractedText,
				processingStatus: version.processingStatus,
				processingFailure: version.processingFailure,
				processedAt: version.processedAt ? new Date(version.processedAt) : null
			})
			.where(eq(schema.attachmentVersions.id, version.id))
			.returning();
		const view = await this.findById(actor, version.attachmentId);
		if (!row || !view) throw new NotFoundError('Attachment was not found');
		return view;
	}

	async failInterrupted(): Promise<number> {
		const rows = await this.database
			.update(schema.attachmentVersions)
			.set({
				processingStatus: 'failed',
				processingFailure: 'Processing was interrupted by a restart',
				processedAt: new Date()
			})
			.where(eq(schema.attachmentVersions.processingStatus, 'processing'))
			.returning({ id: schema.attachmentVersions.id });
		return rows.length;
	}
}
