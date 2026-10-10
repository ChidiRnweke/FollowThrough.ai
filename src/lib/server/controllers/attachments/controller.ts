import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type {
	AttachmentDownloads,
	AttachmentLifecycle,
	AttachmentReader,
	AttachmentUploads
} from '$lib/server/services/attachments/library';
import type { TodoReader } from '$lib/server/services/todos/catalog';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

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
	initiate(
		actor: ActorContext,
		input: Parameters<AttachmentUploads['initiate']>[1]
	): ReturnType<AttachmentUploads['initiate']>;
	/**
	 * Finalize a completed upload and return the resulting attachment view.
	 *
	 * The worker discovers the queued version after this transaction commits.
	 * A restart between upload completion and extraction leaves that version queued.
	 */
	complete(
		actor: ActorContext,
		uploadId: AttachmentUploadId
	): ReturnType<AttachmentUploads['complete']>;
	/**
	 * Finalize an upload and, in the same transaction, record that a todo's
	 * description references it.
	 *
	 * Check that the task is available before touching uploaded bytes. The database
	 * link and attachment commit together; saving the description is a later edit.
	 */
	completeForTodo(
		actor: ActorContext,
		uploadId: AttachmentUploadId,
		todoId: TodoId
	): ReturnType<AttachmentUploads['complete']>;
	/** List the attachments attached to a note, in display order. */
	list(actor: ActorContext, noteId: NoteId): ReturnType<AttachmentReader['list']>;
	/** List the attachments a todo's description references, in display order. */
	listForTodo(actor: ActorContext, todoId: TodoId): ReturnType<AttachmentReader['listForTodo']>;
	/** List every attachment in a project regardless of which note owns it, for project-wide browsing. */
	listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): ReturnType<AttachmentReader['listForProject']>;
	/** Return a presigned URL that streams the original file bytes. */
	downloadById(
		actor: ActorContext,
		attachmentId: AttachmentId
	): ReturnType<AttachmentDownloads['downloadById']>;
	/** Re-run processing for an attachment whose earlier attempt failed, returning the refreshed view. */
	retry(actor: ActorContext, attachmentId: AttachmentId): ReturnType<AttachmentLifecycle['retry']>;
	/** Remove an attachment unless its containing note still embeds it. */
	removeById(
		actor: ActorContext,
		attachmentId: AttachmentId
	): ReturnType<AttachmentLifecycle['removeById']>;
	/** Return a presigned URL that streams the original file at a note-relative path. */
	download(
		actor: ActorContext,
		noteId: NoteId,
		path: string
	): ReturnType<AttachmentDownloads['download']>;
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
	): ReturnType<AttachmentReader['read']>;
	/** Detach an unreferenced note attachment while retaining file versions for revision restore. */
	remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void>;

	agentListAttachments(
		actor: ActorContext,
		input: AgentToolInput<'list_attachments'>
	): Promise<AgentPayload>;
}

/** Everything the {@link AttachmentsController} needs: the attachment manager and a transaction runner for atomic mutations. */
export interface AttachmentsDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	uploads: AttachmentUploads;
	reader: AttachmentReader;
	downloads: AttachmentDownloads;
	lifecycle: AttachmentLifecycle;
	todoReader: TodoReader;
	attachmentIndexer: { remove(actor: ActorContext, attachmentId: AttachmentId): Promise<void> };
	transactionRunner: TransactionRunner;
}

export class Attachments implements AttachmentsController {
	constructor(private readonly dependencies: AttachmentsDependencies) {}
	initiate(actor: ActorContext, input: Parameters<AttachmentUploads['initiate']>[1]) {
		return this.dependencies.uploads.initiate(actor, input);
	}
	complete(actor: ActorContext, uploadId: AttachmentUploadId) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.uploads.complete(actor, uploadId)
		);
	}
	completeForTodo(actor: ActorContext, uploadId: AttachmentUploadId, todoId: TodoId) {
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.todoReader.get(actor, todoId);
			const completed = await this.dependencies.uploads.complete(actor, uploadId);
			await this.dependencies.lifecycle.linkToTodo(actor, completed.attachment.id, todoId);
			return completed;
		});
	}
	list(actor: ActorContext, noteId: NoteId) {
		return this.dependencies.reader.list(actor, noteId);
	}
	async listForTodo(actor: ActorContext, todoId: TodoId) {
		await this.dependencies.todoReader.get(actor, todoId);
		return this.dependencies.reader.listForTodo(actor, todoId);
	}
	listForProject(actor: ActorContext, projectId: ProjectId) {
		return this.dependencies.reader.listForProject(actor, projectId);
	}
	downloadById(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.downloads.downloadById(actor, attachmentId);
	}
	retry(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.transactionRunner.run(() =>
			this.dependencies.lifecycle.retry(actor, attachmentId)
		);
	}
	removeById(actor: ActorContext, attachmentId: AttachmentId) {
		return this.dependencies.transactionRunner.run(async () => {
			const result = await this.dependencies.lifecycle.removeById(actor, attachmentId);
			if (result.kind === 'removed')
				await this.dependencies.attachmentIndexer.remove(actor, attachmentId);
			return result;
		});
	}
	download(actor: ActorContext, noteId: NoteId, path: string) {
		return this.dependencies.downloads.download(actor, noteId, path);
	}
	read(actor: ActorContext, noteId: NoteId, path: string, offset?: number, limit?: number) {
		return this.dependencies.reader.read(actor, noteId, path, offset, limit);
	}
	remove(actor: ActorContext, noteId: NoteId, path: string) {
		return this.dependencies.transactionRunner.run(async () => {
			const attachmentId = await this.dependencies.lifecycle.remove(actor, noteId, path);
			if (attachmentId) await this.dependencies.attachmentIndexer.remove(actor, attachmentId);
		});
	}

	async agentListAttachments(
		actor: ActorContext,
		input: AgentToolInput<'list_attachments'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.list(actor, input.noteId as NoteId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
