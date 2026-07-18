import type {
	ActorContext,
	AttachmentId,
	AttachmentUpload,
	AttachmentView,
	NoteId,
	ProjectId
} from '$lib/models';

export interface AttachmentManager {
	initiate(
		actor: ActorContext,
		input: {
			projectId?: ProjectId;
			noteId?: NoteId;
			path: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	): Promise<{
		upload: AttachmentUpload;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}>;
	complete(actor: ActorContext, uploadId: AttachmentUpload['id']): Promise<AttachmentView>;
	startProcessing(actor: ActorContext, attachment: AttachmentView): void;
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly AttachmentView[]>;
	downloadById(actor: ActorContext, attachmentId: AttachmentId): Promise<{ url: string }>;
	retry(actor: ActorContext, attachmentId: AttachmentId): Promise<AttachmentView>;
	removeById(actor: ActorContext, attachmentId: AttachmentId): Promise<void>;
	download(actor: ActorContext, noteId: NoteId, path: string): Promise<{ url: string }>;
	read(
		actor: ActorContext,
		noteId: NoteId,
		path: string,
		offset?: number,
		limit?: number
	): Promise<{ text: string; offset: number; nextOffset?: number; parserKind: string }>;
	remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void>;
}
