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

/** The stored object an extraction reads. */
export interface AttachmentExtractionSource {
	readonly objectKey: string;
	readonly byteSize: number;
	readonly path: string;
	readonly kind: AttachmentExtractionKind;
}
