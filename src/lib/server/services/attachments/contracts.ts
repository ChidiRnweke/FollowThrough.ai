import type {
	ActorContext,
	AttachmentId,
	AttachmentUpload,
	AttachmentView,
	NoteId,
	ProjectId
} from '$lib/models';

/** One ordered piece of OCR output for a PDF page range. */
export type OcrContentPart =
	| { readonly kind: 'markdown'; readonly text: string }
	| { readonly kind: 'image'; readonly dataUrl: string };

export interface OcrPageContent {
	readonly parts: readonly OcrContentPart[];
}

/**
 * One OCR engine call for one PDF page range. The engine returns the document
 * content as ordered markdown and embedded-image parts.
 */
export interface OcrEngineClient {
	ocr(input: {
		pdfBase64: string;
		fileName: string;
		model: string;
		signal?: AbortSignal;
	}): Promise<OcrPageContent>;
}

/** Describes a single image for search; shared by standalone and PDF-embedded images. */
export interface ImageDescriber {
	describe(input: { imageDataUrl: string; context?: string; model: string }): Promise<string>;
}

export interface PdfPageRange {
	readonly start: number;
	readonly end: number;
}

/** Splits a PDF into page ranges so OCR image budgets scale with page count. */
export interface PdfSplitter {
	pageCount(bytes: Uint8Array): Promise<number>;
	split(bytes: Uint8Array, ranges: readonly PdfPageRange[]): Promise<Uint8Array[]>;
}

/** Extracts one enriched markdown string from a PDF via an OCR engine. */
export interface DocumentOcr {
	parse(bytes: Uint8Array, fileName: string, model: string): Promise<string>;
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
