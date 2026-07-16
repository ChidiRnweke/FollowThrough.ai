import type { ActorContext, AttachmentUploadId, NoteId } from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type { AttachmentManager } from '$lib/services';

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

export class DefaultAttachmentsController implements AttachmentsController {
	constructor(private readonly dependencies: AttachmentsDependencies) {}
	initiate(actor: ActorContext, input: Parameters<AttachmentManager['initiate']>[1]) {
		return this.dependencies.attachments.initiate(actor, input);
	}
	complete(actor: ActorContext, uploadId: AttachmentUploadId) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.attachments.complete(actor, uploadId)
		);
	}
	list(actor: ActorContext, noteId: NoteId) {
		return this.dependencies.attachments.list(actor, noteId);
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
