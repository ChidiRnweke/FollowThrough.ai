import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { AttachmentManager } from '$lib/server/services/attachments/contracts';

/**
 * Application boundary for attachments: the two-phase upload lifecycle, listing, and
 * retrieval of either the original file or its parsed text content.
 *
 * Every mutation commits through the transaction runner before any background work is
 * kicked off, so a half-persisted attachment is never observable.
 */
export interface AttachmentsController {
	/**
	 * Begin an upload: reserve an attachment record and return a presigned URL (and the
	 * headers required to write to it) that the client uploads the bytes to.
	 *
	 * Nothing is visible to other readers until {@link complete} is called, so a failed
	 * or abandoned upload never surfaces a half-uploaded file.
	 */
	initiate(
		actor: ActorContext,
		input: Parameters<AttachmentManager['initiate']>[1]
	): ReturnType<AttachmentManager['initiate']>;
	/**
	 * Finalize a completed upload and return the resulting attachment view.
	 *
	 * The record is committed in a transaction first, and only then is OCR/image
	 * processing started in the background — processing begins only once the upload is
	 * durably recorded, so a crash in between never leaves an unprocessed attachment that
	 * the client thinks is ready.
	 */
	complete(
		actor: ActorContext,
		uploadId: AttachmentUploadId
	): ReturnType<AttachmentManager['complete']>;
	/**
	 * Finalize an upload and, in the same transaction, record that a todo's
	 * description references it.
	 *
	 * The link is committed with the attachment rather than through a follow-up
	 * call, so a screenshot is never observable as a project file that no todo
	 * claims — the description's image link and the recorded ownership always
	 * agree.
	 */
	completeForTodo(
		actor: ActorContext,
		uploadId: AttachmentUploadId,
		todoId: TodoId
	): ReturnType<AttachmentManager['complete']>;
	/** List the attachments attached to a note, in display order. */
	list(actor: ActorContext, noteId: NoteId): ReturnType<AttachmentManager['list']>;
	/** List the attachments a todo's description references, in display order. */
	listForTodo(actor: ActorContext, todoId: TodoId): ReturnType<AttachmentManager['listForTodo']>;
	/** List every attachment in a project regardless of which note owns it, for project-wide browsing. */
	listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): ReturnType<AttachmentManager['listForProject']>;
	/** Return a presigned URL that streams the original file bytes. */
	downloadById(
		actor: ActorContext,
		attachmentId: AttachmentId
	): ReturnType<AttachmentManager['downloadById']>;
	/** Re-run processing for an attachment whose earlier attempt failed, returning the refreshed view. */
	retry(actor: ActorContext, attachmentId: AttachmentId): ReturnType<AttachmentManager['retry']>;
	/** Permanently delete an attachment by id, atomically. */
	removeById(actor: ActorContext, attachmentId: AttachmentId): Promise<void>;
	/** Return a presigned URL that streams the original file at a note-relative path. */
	download(
		actor: ActorContext,
		noteId: NoteId,
		path: string
	): ReturnType<AttachmentManager['download']>;
	/**
	 * Read a slice of an attachment's parsed text content by byte offset, returning the
	 * slice plus the next offset to continue from — lets a client page through a large
	 * document without ever downloading it.
	 */
	read(
		actor: ActorContext,
		noteId: NoteId,
		path: string,
		offset?: number,
		limit?: number
	): ReturnType<AttachmentManager['read']>;
	/** Permanently delete the attachment at a note-relative path, atomically. */
	remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void>;
}

/** Everything the {@link AttachmentsController} needs: the attachment manager and a transaction runner for atomic mutations. */
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
	completeForTodo(actor: ActorContext, uploadId: AttachmentUploadId, todoId: TodoId) {
		return this.completeForTodoAndStart(actor, uploadId, todoId);
	}
	private async completeForTodoAndStart(
		actor: ActorContext,
		uploadId: AttachmentUploadId,
		todoId: TodoId
	) {
		const attachment = await this.dependencies.transactionRunner.run(async () => {
			const completed = await this.dependencies.attachments.complete(actor, uploadId);
			await this.dependencies.attachments.linkToTodo(actor, completed.attachment.id, todoId);
			return completed;
		});
		this.dependencies.attachments.startProcessing(actor, attachment);
		return attachment;
	}
	list(actor: ActorContext, noteId: NoteId) {
		return this.dependencies.attachments.list(actor, noteId);
	}
	listForTodo(actor: ActorContext, todoId: TodoId) {
		return this.dependencies.attachments.listForTodo(actor, todoId);
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
