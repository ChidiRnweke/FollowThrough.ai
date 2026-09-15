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

export type OcrParseInput = Parameters<DocumentOcr['parse']>[0];
export interface AttachmentParser {
	readonly kind: string;
	supports(mediaType: string, path: string): boolean;
	parse(bytes: Uint8Array): Promise<string>;
}
export interface AttachmentParsers {
	select(mediaType: string, path: string): AttachmentParser | undefined;
}
