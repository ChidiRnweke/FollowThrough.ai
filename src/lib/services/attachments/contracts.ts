import type { ActorContext, AttachmentUpload, AttachmentView, NoteId } from '$lib/models';

export interface AttachmentManager {
	initiate(
		actor: ActorContext,
		input: {
			noteId: NoteId;
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
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
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
