import type { ActorContext, UserId } from '$lib/models/identity';
import type {
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';

/** An upload reservation together with the owner needed to scope its removal. */
export interface OwnedAttachmentUpload {
	readonly userId: UserId;
	readonly upload: AttachmentUpload;
}

/** `finalize` is the only path that makes an attachment visible: nothing before it is observable to any reader but the uploader. */
export interface AttachmentRepository {
	createUpload(actor: ActorContext, upload: AttachmentUpload): Promise<AttachmentUpload>;
	findUpload(
		actor: ActorContext,
		id: AttachmentUpload['id']
	): Promise<AttachmentUpload | undefined>;
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void>;
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly AttachmentView[]>;
	/**
	 * Record that a todo's description references an already-finalized attachment.
	 * The attachment stays project-owned; this only adds the todo link, so linking
	 * the same attachment twice is a no-op rather than an error.
	 */
	linkToTodo(actor: ActorContext, id: Attachment['id'], todoId: TodoId): Promise<void>;
	listForTodo(actor: ActorContext, todoId: TodoId): Promise<readonly AttachmentView[]>;
	findById(actor: ActorContext, id: Attachment['id']): Promise<AttachmentView | undefined>;
	findByPath(
		actor: ActorContext,
		noteId: NoteId,
		path: string
	): Promise<AttachmentView | undefined>;
	finalize(
		actor: ActorContext,
		upload: AttachmentUpload,
		version: AttachmentVersion
	): Promise<AttachmentView>;
	remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void>;
	removeById(actor: ActorContext, id: Attachment['id']): Promise<void>;
	updateVersion(actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView>;
	failInterrupted(): Promise<number>;
	/**
	 * Upload reservations that expired before `before` and were never finalized.
	 * Their staged objects are still sitting in the bucket; the sweep worker uses
	 * this to reclaim both.
	 */
	listExpiredUploads(before: Date, limit: number): Promise<readonly OwnedAttachmentUpload[]>;
}
