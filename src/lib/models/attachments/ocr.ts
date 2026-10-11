/** Ordered output from document recognition. */
export type RecognizedContent =
	| { readonly kind: 'markdown'; readonly text: string }
	| { readonly kind: 'image'; readonly dataUrl: string };

export interface RecognizedPage {
	readonly parts: readonly RecognizedContent[];
	readonly pagesProcessed?: number;
}

export type DocumentContentSlot =
	| { readonly kind: 'markdown'; readonly text: string }
	| {
			readonly kind: 'image';
			readonly imageDataUrl: string;
			readonly index: number;
			readonly context?: string;
	  };

export type DocumentImageDescription =
	| { readonly kind: 'described'; readonly text: string }
	| { readonly kind: 'failure'; readonly message: string };

export interface ExtractedAttachmentContent {
	readonly text: string;
	readonly parserKind: string;
	readonly processingFailure?: string;
}

/** An HTTP provider endpoint an attachment extraction calls. */
export interface AttachmentProviderEndpoint {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly fetch: typeof globalThis.fetch;
}

/** How a stored attachment yields searchable text. */
export type AttachmentExtractionKind = 'text' | 'document' | 'image';

/**
 * The stored attachment an extraction reads, already fetched from object storage: a text file's
 * bytes, or a signed link through which the OCR and vision providers read a document or image.
 */
export type AttachmentExtractionSource =
	| { readonly kind: 'text'; readonly bytes: Uint8Array }
	| {
			readonly kind: Exclude<AttachmentExtractionKind, 'text'>;
			readonly path: string;
			readonly url: string;
	  };
