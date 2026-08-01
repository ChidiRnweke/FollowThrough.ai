import type { ActorContext, UserId } from '$lib/models/identity';
import type {
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

/** An upload reservation together with the owner needed to scope its removal. */
export interface OwnedAttachmentUpload {
	readonly userId: UserId;
	readonly upload: AttachmentUpload;
}

export interface AttachmentRepository {
	createUpload(actor: ActorContext, upload: AttachmentUpload): Promise<AttachmentUpload>;
	findUpload(
		actor: ActorContext,
		id: AttachmentUpload['id']
	): Promise<AttachmentUpload | undefined>;
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void>;
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly AttachmentView[]>;
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
