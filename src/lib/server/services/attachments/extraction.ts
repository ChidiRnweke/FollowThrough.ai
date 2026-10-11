import { ExternalServiceError, ValidationError } from '$lib/errors';
import {
	imageDescriptionResponseSchema,
	ocrResponseSchema,
	type OcrImage,
	type OcrPage,
	type OcrResponse
} from '$lib/models/attachment-recognition';
import type {
	AttachmentExtractionSource,
	AttachmentProviderEndpoint,
	DocumentContentSlot,
	DocumentImageDescription,
	ExtractedAttachmentContent,
	RecognizedContent
} from '$lib/models/attachments/ocr';
import type { OperationObserver } from '$lib/models/telemetry';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

/** The stored bytes and links an extraction needs. */
export interface AttachmentObjectReader {
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}

export interface AttachmentExtractionDependencies {
	readonly storage: AttachmentObjectReader;
	/** Mistral Document AI `POST /v1/ocr`. */
	readonly ocr: AttachmentProviderEndpoint & { readonly model: string };
	/** OpenRouter chat completions, for describing images. */
	readonly vision: AttachmentProviderEndpoint;
	readonly observer: OperationObserver;
	readonly logger: Pick<Console, 'error'>;
}

export interface AttachmentContentExtraction {
	/** Searchable text for a stored attachment, describing its images with `visionModel`. */
	extract(
		source: AttachmentExtractionSource,
		visionModel: string
	): Promise<ExtractedAttachmentContent>;
}

/** A whole document goes out in one request; every returned page is retained. */
const OCR_TIMEOUT_MS = 300_000;
const DESCRIPTION_TIMEOUT_MS = 60_000;
/** Preserve the four-request concurrency bound on image descriptions. */
const DESCRIPTION_CONCURRENCY = 4;
const IMAGE_PLACEHOLDER = /!\[[^\]]*\]\(([^)]+)\)/g;
const DESCRIBE_PROMPT =
	'Describe this image factually for search. Include visible text, charts, diagrams, objects, and layout. Do not make unsupported inferences.';

/**
 * Turns a stored attachment into searchable text: UTF-8 text is decoded; documents and images go
 * through OCR, and every embedded or uploaded image is described by a vision model in reading
 * order. The OCR and vision providers belong to this capability.
 */
export class AttachmentExtraction implements AttachmentContentExtraction {
	constructor(private readonly dependencies: AttachmentExtractionDependencies) {}

	async extract(
		source: AttachmentExtractionSource,
		visionModel: string
	): Promise<ExtractedAttachmentContent> {
		const { storage } = this.dependencies;
		if (source.kind === 'text') {
			const bytes = await storage.read(source.objectKey, source.byteSize);
			return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), parserKind: 'text' };
		}
		const documentUrl = await storage.createDownloadUrl(source.objectKey, 900);
		const parts = await this.recognize(documentUrl, source.kind, source.path);
		const text = await this.describeDocument(parts, visionModel);
		if (source.kind === 'document') return { text, parserKind: 'ocr' };
		const description = await this.describeStoredImage(source.objectKey, visionModel);
		return description.kind === 'failure'
			? { text: text.trim(), parserKind: 'ocr', processingFailure: description.message }
			: {
					text: [text.trim(), `> **Image:** ${description.text}`].filter(Boolean).join('\n\n'),
					parserKind: 'ocr'
				};
	}

	private async recognize(
		documentUrl: string,
		kind: 'document' | 'image',
		fileName: string
	): Promise<readonly RecognizedContent[]> {
		const { url, headers, fetch, model } = this.dependencies.ocr;
		const page = await this.dependencies.observer.run(
			'attachments.ocr',
			{
				input: JSON.stringify({ fileName, kind, model }),
				inputMimeType: MimeType.JSON,
				outputMimeType: MimeType.JSON,
				kind: OpenInferenceSpanKind.LLM,
				metadata: { model, engine: 'mistral-ocr' }
			},
			async () => {
				const response = await fetch(url, {
					method: 'POST',
					signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
					headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
					body: JSON.stringify({
						model,
						document:
							kind === 'image'
								? { type: 'image_url', image_url: documentUrl }
								: { type: 'document_url', document_url: documentUrl },
						include_image_base64: true
					})
				});
				const payload = ocrResponseSchema.parse(await response.json());
				if (!response.ok)
					throw new ExternalServiceError('Document OCR failed', {
						cause: ocrFailure(payload, response.status)
					});
				const parts = [...(payload.pages ?? [])]
					.sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
					.flatMap(pageParts);
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
		return page.parts;
	}

	private async describeDocument(
		parts: readonly RecognizedContent[],
		model: string
	): Promise<string> {
		const slots = plan(parts);
		const images = slots.filter((slot) => slot.kind === 'image');
		const descriptions = new Map<number, DocumentImageDescription>();
		let next = 0;
		const worker = async () => {
			while (next < images.length) {
				const image = images[next++];
				descriptions.set(
					image.index,
					await this.describe(image.imageDataUrl, model, image.context)
				);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, images.length) }, worker)
		);
		return render(slots, descriptions);
	}

	private async describeStoredImage(
		objectKey: string,
		model: string
	): Promise<DocumentImageDescription> {
		try {
			const imageDataUrl = await this.dependencies.storage.createDownloadUrl(objectKey, 300);
			return await this.describe(imageDataUrl, model);
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Image description failed'
			};
		}
	}

	/** One image description; a failure is a value, so the document still renders. */
	private async describe(
		imageDataUrl: string,
		model: string,
		context?: string
	): Promise<DocumentImageDescription> {
		const { url, headers, fetch } = this.dependencies.vision;
		try {
			const response = await fetch(url, {
				method: 'POST',
				signal: AbortSignal.timeout(DESCRIPTION_TIMEOUT_MS),
				headers: { 'content-type': 'application/json', ...headers },
				body: JSON.stringify({
					model,
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: context
										? `This image appears in a document near the following text:\n${context}\n\n${DESCRIBE_PROMPT}`
										: DESCRIBE_PROMPT
								},
								{ type: 'image_url', image_url: { url: imageDataUrl } }
							]
						}
					]
				})
			});
			if (!response.ok) throw new Error(`Vision description failed (${response.status})`);
			const payload = imageDescriptionResponseSchema.parse(await response.json());
			const text = payload.choices[0]?.message.content.trim();
			if (!text) throw new Error('Vision model returned no description');
			return { kind: 'described', text };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Image description failed';
			this.dependencies.logger.error('Image description failed', message);
			return { kind: 'failure', message };
		}
	}
}

/** Mistral returns bare base64 for some formats and a full data URL for others. */
const toDataUrl = (image: OcrImage): string | undefined => {
	const encoded = image.image_base64;
	if (!encoded) return undefined;
	return encoded.startsWith('data:') ? encoded : `data:image/png;base64,${encoded}`;
};

/**
 * One page's markdown, split at its image placeholders so images stay where they appeared. A
 * placeholder whose target the engine did not return stays in the markdown.
 */
const pageParts = (page: OcrPage): RecognizedContent[] => {
	const markdown = page.markdown ?? '';
	const images = new Map<string, string>();
	for (const image of page.images ?? []) {
		const dataUrl = toDataUrl(image);
		if (image.id && dataUrl) images.set(image.id, dataUrl);
	}
	const parts: RecognizedContent[] = [];
	const pushMarkdown = (text: string) => {
		if (text.trim()) parts.push({ kind: 'markdown', text });
	};
	let consumed = 0;
	for (const match of markdown.matchAll(IMAGE_PLACEHOLDER)) {
		const dataUrl = images.get(match[1]);
		if (!dataUrl) continue;
		pushMarkdown(markdown.slice(consumed, match.index));
		parts.push({ kind: 'image', dataUrl });
		consumed = match.index + match[0].length;
	}
	pushMarkdown(markdown.slice(consumed));
	return parts;
};

const ocrFailure = (payload: OcrResponse, status: number): string => {
	if (payload.message) return payload.message;
	if (typeof payload.detail === 'string') return payload.detail;
	return `Mistral OCR returned ${status}`;
};

/** Reading order: each image is numbered and carries the Markdown that precedes it. */
const plan = (parts: readonly RecognizedContent[]): readonly DocumentContentSlot[] => {
	let index = 0;
	let precedingMarkdown: string | undefined;
	return parts.map((part) => {
		if (part.kind === 'markdown') {
			const text = part.text.trim();
			if (text) precedingMarkdown = text;
			return { kind: 'markdown', text };
		}
		return {
			kind: 'image',
			imageDataUrl: part.dataUrl,
			index: ++index,
			...(precedingMarkdown ? { context: precedingMarkdown.slice(-1000) } : {})
		};
	});
};

const render = (
	slots: readonly DocumentContentSlot[],
	descriptions: ReadonlyMap<number, DocumentImageDescription>
): string =>
	slots
		.map((slot) => {
			if (slot.kind === 'markdown') return slot.text;
			const result = descriptions.get(slot.index);
			if (!result) throw new ValidationError(`Missing description result for image ${slot.index}`);
			return `> **Image ${slot.index}:** ${result.kind === 'described' ? result.text : '(description unavailable)'}`;
		})
		.filter(Boolean)
		.join('\n\n');
