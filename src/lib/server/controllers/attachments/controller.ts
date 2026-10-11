import type { AttachmentIndexing } from '$lib/server/services/knowledge-search/retrieval';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	AttachmentLifecycle,
	AttachmentReader,
	AttachmentUploads
} from '$lib/server/services/attachments/library';
import type { TodoReader } from '$lib/server/services/todos/catalog';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';

/**
 * Application boundary for attachments: the two-phase upload lifecycle, listing, and
 * retrieval of either the original file or its parsed text content.
 *
 * Every mutation commits through the transaction runner before any background work is
 * discovered by the worker, so a half-persisted attachment is never observable.
 */
export interface AttachmentsController {
	/**
	 * Begin an upload: reserve an attachment record and return a presigned URL (and the
	 * headers required to write to it) that the client uploads the bytes to.
	 *
	 * Nothing is visible to other readers until {@link complete} is called, so a failed
	 * or abandoned upload never surfaces a half-uploaded file.
	 */
	initiate(input: Parameters<AttachmentUploads['initiate']>[0]): Promise<AttachmentUploadStart>;
	/**
	 * Finalize a completed upload and return the resulting attachment view.
	 *
	 * The worker discovers the queued version after this transaction commits.
	 * A restart between upload completion and extraction leaves that version queued.
	 */
	complete(uploadId: AttachmentUploadId): Promise<AttachmentView>;
	/**
	 * Finalize an upload and, in the same transaction, record that a todo's
	 * description references it.
	 *
	 * Check that the task is available before touching uploaded bytes. The database
	 * link and attachment commit together; saving the description is a later edit.
	 */
	completeForTodo(uploadId: AttachmentUploadId, todoId: TodoId): Promise<AttachmentView>;
	/** List the attachments attached to a note, in display order. */
	list(noteId: NoteId): ReturnType<AttachmentReader['list']>;
	/** List the attachments a todo's description references, in display order. */
	listForTodo(todoId: TodoId): ReturnType<AttachmentReader['listForTodo']>;
	/** List every attachment in a project regardless of which note owns it, for project-wide browsing. */
	listForProject(projectId: ProjectId): ReturnType<AttachmentReader['listForProject']>;
	/** Return a presigned URL that streams the original file bytes. */
	downloadById(attachmentId: AttachmentId): Promise<{ url: string }>;
	/** Re-run processing for an attachment whose earlier attempt failed, returning the refreshed view. */
	retry(attachmentId: AttachmentId): ReturnType<AttachmentLifecycle['retry']>;
	/** Remove an attachment unless its containing note still embeds it. */
	removeById(attachmentId: AttachmentId): ReturnType<AttachmentLifecycle['removeById']>;
	/** Return a presigned URL that streams the original file at a note-relative path. */
	download(noteId: NoteId, path: string): Promise<{ url: string }>;
	/**
	 * Read a slice of an attachment's parsed text content by byte offset, returning the
	 * slice plus the next offset to continue from — lets a client page through a large
	 * document without ever downloading it.
	 */
	read(
		noteId: NoteId,
		path: string,
		offset?: number,
		limit?: number
	): ReturnType<AttachmentReader['read']>;
	/** Detach an unreferenced note attachment while retaining file versions for revision restore. */
	remove(noteId: NoteId, path: string): Promise<void>;
}

/** Everything the {@link AttachmentsController} needs: the attachment manager and a transaction runner for atomic mutations. */
export interface AttachmentsDependencies {
	uploads: AttachmentUploads;
	reader: AttachmentReader;
	storage: IAttachmentStorage;
	lifecycle: AttachmentLifecycle;
	todoReader: TodoReader;
	attachmentIndexer: Pick<AttachmentIndexing, 'removeAttachment'>;
	transactionRunner: TransactionRunner;
}

export class Attachments implements AttachmentsController {
	constructor(private readonly dependencies: AttachmentsDependencies) {}
	async initiate(
		input: Parameters<AttachmentUploads['initiate']>[0]
	): Promise<AttachmentUploadStart> {
		const { upload, requiredHeaders } = await this.dependencies.uploads.initiate(input);
		const uploadUrl = await this.dependencies.storage.createUploadUrl({
			objectKey: upload.objectKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			expiresInSeconds: 600
		});
		return { upload, uploadUrl, requiredHeaders };
	}
	complete(uploadId: AttachmentUploadId) {
		return this.dependencies.transactionRunner.run(() => this.completeUpload(uploadId));
	}
	completeForTodo(uploadId: AttachmentUploadId, todoId: TodoId) {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.todoReader.get(todoId);
			const completed = await this.completeUpload(uploadId);
			await this.dependencies.lifecycle.linkToTodo(completed.attachment.id, todoId);
			return completed;
		});
	}
	/** Verifies the stored bytes, moves them under the new version's key and records the version. */
	private async completeUpload(uploadId: AttachmentUploadId): Promise<AttachmentView> {
		const { uploads, storage } = this.dependencies;
		const upload = await uploads.pending(uploadId);
		const version = uploads.planVersion(upload, await storage.stat(upload.objectKey));
		await storage.promote(upload.objectKey, version.objectKey);
		return uploads.finalize(upload, version);
	}
	list(noteId: NoteId) {
		return this.dependencies.reader.list(noteId);
	}
	async listForTodo(todoId: TodoId) {
		await this.dependencies.todoReader.get(todoId);
		return this.dependencies.reader.listForTodo(todoId);
	}
	listForProject(projectId: ProjectId) {
		return this.dependencies.reader.listForProject(projectId);
	}
	async downloadById(attachmentId: AttachmentId) {
		const found = await this.dependencies.reader.get(attachmentId);
		return { url: await this.dependencies.storage.createDownloadUrl(found.version.objectKey, 300) };
	}
	retry(attachmentId: AttachmentId) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.lifecycle.retry(attachmentId)
		);
	}
	removeById(attachmentId: AttachmentId) {
		return this.dependencies.transactionRunner.run(async () => {
			const result = await this.dependencies.lifecycle.removeById(attachmentId);
			if (result.kind === 'removed')
				await this.dependencies.attachmentIndexer.removeAttachment(attachmentId);
			return result;
		});
	}
	async download(noteId: NoteId, path: string) {
		const found = await this.dependencies.reader.locate(noteId, path);
		return { url: await this.dependencies.storage.createDownloadUrl(found.version.objectKey, 300) };
	}
	read(noteId: NoteId, path: string, offset?: number, limit?: number) {
		return this.dependencies.reader.read(noteId, path, offset, limit);
	}
	remove(noteId: NoteId, path: string) {
		return this.dependencies.transactionRunner.run(async () => {
			const attachmentId = await this.dependencies.lifecycle.remove(noteId, path);
			if (attachmentId) await this.dependencies.attachmentIndexer.removeAttachment(attachmentId);
		});
	}
}

/** A started upload: its record, and where and how the client sends the bytes. */
export interface AttachmentUploadStart {
	readonly upload: AttachmentUpload;
	readonly uploadUrl: string;
	readonly requiredHeaders: Record<string, string>;
}
