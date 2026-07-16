import type {
	ActorContext,
	Attachment,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView,
	NoteId
} from '$lib/models';

export interface AttachmentRepository {
	createUpload(actor: ActorContext, upload: AttachmentUpload): Promise<AttachmentUpload>;
	findUpload(
		actor: ActorContext,
		id: AttachmentUpload['id']
	): Promise<AttachmentUpload | undefined>;
	deleteUpload(actor: ActorContext, id: AttachmentUpload['id']): Promise<void>;
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
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
}
