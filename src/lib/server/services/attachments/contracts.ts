import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentView,
	RemoveAttachmentResult
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';

export type {
	OcrContentPart,
	OcrPageContent,
	OcrEngineClient,
	ImageDescriber,
	DocumentOcr
} from '$lib/server/repositories/attachments/processing';

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
	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly AttachmentView[]>;
	linkToTodo(actor: ActorContext, attachmentId: AttachmentId, todoId: TodoId): Promise<void>;
	listForTodo(actor: ActorContext, todoId: TodoId): Promise<readonly AttachmentView[]>;
	downloadById(actor: ActorContext, attachmentId: AttachmentId): Promise<{ url: string }>;
	retry(actor: ActorContext, attachmentId: AttachmentId): Promise<AttachmentView>;
	removeById(actor: ActorContext, attachmentId: AttachmentId): Promise<RemoveAttachmentResult>;
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

export type {
	AttachmentClaims,
	AttachmentClaim
} from '$lib/server/repositories/attachments/claims';
export type { AttachmentRepository } from '$lib/server/repositories/attachments';

export interface AttachmentTextExtractor {
	extract(
		view: AttachmentView,
		visionModel: string
	): Promise<{ text: string; parserKind: string; processingFailure?: string } | undefined>;
}
