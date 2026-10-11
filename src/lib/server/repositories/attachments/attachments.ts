import type { UserId } from '$lib/models/identity';
import type {
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView,
	OwnedAttachmentUpload,
	UploadRetentionCursor
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';

export type { OwnedAttachmentUpload, UploadRetentionCursor } from '$lib/models/attachments';

/** `finalize` is the only path that makes an attachment visible: nothing before it is observable to any reader but the uploader. */
export interface AttachmentRepository {
	createUpload(upload: AttachmentUpload): Promise<AttachmentUpload>;
	findUpload(id: AttachmentUpload['id']): Promise<AttachmentUpload | undefined>;
	deleteUpload(id: AttachmentUpload['id']): Promise<void>;
	list(noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(projectId: ProjectId): Promise<readonly AttachmentView[]>;
	/**
	 * Record that a todo's description references an already-finalized attachment.
	 * The attachment stays project-owned; this only adds the todo link, so linking
	 * the same attachment twice is a no-op rather than an error.
	 */
	linkToTodo(id: Attachment['id'], todoId: TodoId): Promise<void>;
	listForTodo(todoId: TodoId): Promise<readonly AttachmentView[]>;
	findById(id: Attachment['id']): Promise<AttachmentView | undefined>;
	findByPath(noteId: NoteId, path: string): Promise<AttachmentView | undefined>;
	finalize(upload: AttachmentUpload, version: AttachmentVersion): Promise<AttachmentView>;
	remove(noteId: NoteId, path: string): Promise<void>;
	removeById(id: Attachment['id']): Promise<void>;
	updateVersion(version: AttachmentVersion): Promise<AttachmentView>;
	findVersionForUpdate(versionId: AttachmentVersion['id']): Promise<AttachmentView | undefined>;
}

/** Attachment work across every user, for the worker. */
export interface AttachmentBacklogRepository {
	/** Drops an upload reservation that expired without being finalized. */
	deleteExpiredUpload(id: AttachmentUpload['id']): Promise<void>;
	/**
	 * Upload reservations that expired before `before` and were never finalized.
	 * Their staged objects are still sitting in the bucket; the sweep worker uses
	 * this to reclaim both.
	 */
	listExpiredUploads(
		before: Date,
		limit: number,
		after?: UploadRetentionCursor
	): Promise<readonly OwnedAttachmentUpload[]>;
	listPendingObjectRemovals(): Promise<readonly string[]>;
	completeObjectRemoval(objectKey: string): Promise<void>;
	listPendingVersions(): Promise<readonly { userId: UserId; versionId: AttachmentVersion['id'] }[]>;
}
