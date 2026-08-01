import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { AttachmentManager } from '$lib/server/services/attachments/contracts';

export interface AttachmentsController {
	initiate(
		actor: ActorContext,
		input: Parameters<AttachmentManager['initiate']>[1]
	): ReturnType<AttachmentManager['initiate']>;
	complete(
		actor: ActorContext,
		uploadId: AttachmentUploadId
	): ReturnType<AttachmentManager['complete']>;
	list(actor: ActorContext, noteId: NoteId): ReturnType<AttachmentManager['list']>;
	listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): ReturnType<AttachmentManager['listForProject']>;
	downloadById(
		actor: ActorContext,
		attachmentId: AttachmentId
	): ReturnType<AttachmentManager['downloadById']>;
	retry(actor: ActorContext, attachmentId: AttachmentId): ReturnType<AttachmentManager['retry']>;
	removeById(actor: ActorContext, attachmentId: AttachmentId): Promise<void>;
	download(
		actor: ActorContext,
		noteId: NoteId,
		path: string
	): ReturnType<AttachmentManager['download']>;
	read(
		actor: ActorContext,
		noteId: NoteId,
		path: string,
		offset?: number,
		limit?: number
	): ReturnType<AttachmentManager['read']>;
	remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void>;
}

export interface AttachmentsDependencies {
	attachments: AttachmentManager;
	transactionRunner: TransactionRunner;
}

export class Attachments implements AttachmentsController {
	constructor(private readonly dependencies: AttachmentsDependencies) {}
	initiate(actor: ActorContext, input: Parameters<AttachmentManager['initiate']>[1]) {
		return this.dependencies.attachments.initiate(actor, input);
	}
	complete(actor: ActorContext, uploadId: AttachmentUploadId) {
		return this.completeAndStart(actor, uploadId);
	}
	private async completeAndStart(actor: ActorContext, uploadId: AttachmentUploadId) {
		const attachment = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.attachments.complete(actor, uploadId)
		);
		this.dependencies.attachments.startProcessing(actor, attachment);
		return attachment;
	}
	list(actor: ActorContext, noteId: NoteId) {
		return this.dependencies.attachments.list(actor, noteId);
	}
	listForProject(actor: ActorContext, projectId: ProjectId) {
		return this.dependencies.attachments.listForProject(actor, projectId);
	}
	downloadById(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.attachments.downloadById(actor, attachmentId);
	}
	retry(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.attachments.retry(actor, attachmentId);
	}
	removeById(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.attachments.removeById(actor, attachmentId)
		);
	}
	download(actor: ActorContext, noteId: NoteId, path: string) {
		return this.dependencies.attachments.download(actor, noteId, path);
	}
	read(actor: ActorContext, noteId: NoteId, path: string, offset?: number, limit?: number) {
		return this.dependencies.attachments.read(actor, noteId, path, offset, limit);
	}
	remove(actor: ActorContext, noteId: NoteId, path: string) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.attachments.remove(actor, noteId, path)
		);
	}
}
