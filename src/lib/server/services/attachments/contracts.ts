import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId, AttachmentUpload, AttachmentView } from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

/** One ordered piece of OCR output, in the document's reading order. */
export type OcrContentPart =
	| { readonly kind: 'markdown'; readonly text: string }
	| { readonly kind: 'image'; readonly dataUrl: string };

export interface OcrPageContent {
	readonly parts: readonly OcrContentPart[];
	readonly pagesProcessed?: number;
}

/**
 * One OCR engine call for one document. The engine fetches the document from a
 * presigned URL and returns its content as ordered markdown and
 * embedded-image parts.
 */
export interface OcrEngineClient {
	ocr(input: {
		documentUrl: string;
		kind: 'document' | 'image';
		fileName: string;
		maxPages?: number;
		signal?: AbortSignal;
	}): Promise<OcrPageContent>;
}

/** Describes a single image for search; shared by standalone and embedded images. */
export interface ImageDescriber {
	describe(input: { imageDataUrl: string; context?: string; model: string }): Promise<string>;
}

/** Extracts one enriched markdown string from a document via an OCR engine. */
export interface DocumentOcr {
	parse(input: {
		documentUrl: string;
		kind: 'document' | 'image';
		fileName: string;
		visionModel: string;
		maxPages?: number;
	}): Promise<string>;
}

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
