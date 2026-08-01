import { ExternalServiceError } from '$lib/errors';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

interface OperationObserver {
	run<T>(
		name: string,
		context: unknown,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T>;
}
const directObserver: OperationObserver = {
	run: (_name, _context, body) => body()
};

const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const DEFAULT_OCR_MODEL = 'mistral-ocr-latest';

/**
 * A whole document now goes out in one request, so the ceiling is the document
 * (Mistral allows up to 1000 pages) rather than a 10-page slice.
 */
const OCR_TIMEOUT_MS = 300_000;

export type RecognizedContent =
	| { readonly kind: 'markdown'; readonly text: string }
	| { readonly kind: 'image'; readonly dataUrl: string };

export interface RecognizedPage {
	readonly parts: readonly RecognizedContent[];
	readonly pagesProcessed?: number;
}

export interface OcrRequest {
	/** Presigned URL Mistral fetches the document from; must be publicly reachable. */
	readonly documentUrl: string;
	readonly kind: 'document' | 'image';
	readonly fileName: string;
	/**
	 * Caps how many pages are kept from the response. Applied to the result
	 * rather than sent as the request's `pages` selector: the selector's
	 * behaviour for indices past the end of a document is unspecified, and a
	 * fixed request range would risk rejecting every short document.
	 */
	readonly maxPages?: number;
	readonly signal?: AbortSignal;
}

export interface ITextRecognition {
	ocr(input: OcrRequest): Promise<RecognizedPage>;
}

/**
 * OCR engine backed by Mistral Document AI (`POST /v1/ocr`) directly rather than
 * through OpenRouter's file-parser chat plugin. Going direct is what widens the
 * supported formats past PDF, removes the per-request embedded image budget that
 * previously forced page-range splitting, and lets the document be handed over
 * as a presigned URL instead of a base64 payload.
 *
 * The response is one entry per page: markdown, plus the images extracted from
 * that page. Images are referenced from the markdown as `![id](id)`, so the
 * placeholders are what put each image back in its original reading position.
 */

interface OcrImage {
	readonly id?: string;
	readonly image_base64?: string;
}

interface OcrPage {
	readonly index?: number;
	readonly markdown?: string;
	readonly images?: readonly OcrImage[];
}

interface OcrResponse {
	readonly pages?: readonly OcrPage[];
	readonly usage_info?: { readonly pages_processed?: number };
	readonly message?: string;
	readonly detail?: unknown;
}

export interface MistralOcrOptions {
	readonly baseURL?: string;
	readonly model?: string;
	readonly fetch?: typeof globalThis.fetch;
	readonly observer?: OperationObserver;
}

export interface OcrFetchTransport {
	readonly fetch: typeof globalThis.fetch;
}

const IMAGE_PLACEHOLDER = /!\[[^\]]*\]\(([^)]+)\)/g;

/** Mistral returns bare base64 for some formats and a full data URL for others. */
const toDataUrl = (image: OcrImage): string | undefined => {
	const encoded = image.image_base64;
	if (!encoded) return undefined;
	return encoded.startsWith('data:') ? encoded : `data:image/png;base64,${encoded}`;
};

const pushMarkdown = (parts: RecognizedContent[], text: string): void => {
	if (text.trim()) parts.push({ kind: 'markdown', text });
};

/**
 * Splits one page's markdown at its image placeholders so images are emitted
 * where they appeared. A placeholder whose target is not among the page's
 * images (an external link, or an image the engine did not return) stays in the
 * markdown untouched.
 */
export const pageParts = (page: OcrPage): RecognizedContent[] => {
	const markdown = page.markdown ?? '';
	const images = new Map<string, string>();
	for (const image of page.images ?? []) {
		const dataUrl = toDataUrl(image);
		if (image.id && dataUrl) images.set(image.id, dataUrl);
	}

	const parts: RecognizedContent[] = [];
	let consumed = 0;
	for (const match of markdown.matchAll(IMAGE_PLACEHOLDER)) {
		const dataUrl = images.get(match[1]);
		if (!dataUrl) continue;
		pushMarkdown(parts, markdown.slice(consumed, match.index));
		parts.push({ kind: 'image', dataUrl });
		consumed = match.index + match[0].length;
	}
	pushMarkdown(parts, markdown.slice(consumed));
	return parts;
};

export const responseParts = (payload: OcrResponse, maxPages?: number): RecognizedContent[] => {
	const pages = [...(payload.pages ?? [])].sort(
		(left, right) => (left.index ?? 0) - (right.index ?? 0)
	);
	return (maxPages && maxPages > 0 ? pages.slice(0, maxPages) : pages).flatMap(pageParts);
};

const failureMessage = (payload: OcrResponse, status: number): string => {
	if (payload.message) return payload.message;
	if (typeof payload.detail === 'string') return payload.detail;
	return `Mistral OCR returned ${status}`;
};

export class MistralOcr implements ITextRecognition {
	private readonly endpoint: string;
	private readonly model: string;
	private readonly fetch: typeof globalThis.fetch;
	private readonly observer: OperationObserver;

	constructor(
		private readonly apiKey: string,
		options: MistralOcrOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_MISTRAL_BASE_URL}/ocr`;
		this.model = options.model ?? DEFAULT_OCR_MODEL;
		this.fetch = options.fetch ?? globalThis.fetch;
		this.observer = options.observer ?? directObserver;
	}

	async ocr(input: OcrRequest): Promise<RecognizedPage> {
		return this.observer.run(
			'attachments.ocr',
			{
				input: JSON.stringify({ fileName: input.fileName, kind: input.kind, model: this.model }),
				inputMimeType: MimeType.JSON,
				outputMimeType: MimeType.JSON,
				kind: OpenInferenceSpanKind.LLM,
				metadata: { model: this.model, engine: 'mistral-ocr' }
			},
			async () => {
				const response = await this.fetch(this.endpoint, {
					method: 'POST',
					signal: input.signal ?? AbortSignal.timeout(OCR_TIMEOUT_MS),
					headers: {
						'content-type': 'application/json',
						accept: 'application/json',
						authorization: `Bearer ${this.apiKey}`
					},
					body: JSON.stringify({
						model: this.model,
						document:
							input.kind === 'image'
								? { type: 'image_url', image_url: input.documentUrl }
								: { type: 'document_url', document_url: input.documentUrl },
						include_image_base64: true
					})
				});
				const payload = (await response.json().catch(() => ({}))) as OcrResponse;
				if (!response.ok)
					throw new ExternalServiceError('Document OCR failed', {
						cause: failureMessage(payload, response.status)
					});
				const parts = responseParts(payload, input.maxPages);
				if (parts.length === 0) throw new ExternalServiceError('Document OCR returned no content');
				return { parts, pagesProcessed: payload.usage_info?.pages_processed };
			},
			(content) =>
				JSON.stringify({
					pagesProcessed: content.pagesProcessed,
					parts: content.parts.map((part) =>
						part.kind === 'markdown'
							? { kind: 'markdown', text: part.text }
							: { kind: 'image', bytes: part.dataUrl.length }
					)
				})
		);
	}
}
