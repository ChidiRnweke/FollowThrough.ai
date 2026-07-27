import { ExternalServiceError } from '$lib/models';
import type { OcrContentPart, OcrEngineClient, OcrPageContent } from '$lib/services';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
import { DEFAULT_OPENROUTER_BASE_URL, type OpenRouterClientOptions } from './openrouter-client';
import { traceOperation } from './telemetry';

/**
 * OCR engine backed by OpenRouter's `file-parser` plugin with the
 * `mistral-ocr` engine. The chat response is a wrapper: the real payload is
 * the message's file annotations — ordered markdown text parts and base64
 * image parts. On total inference failure the annotations still arrive under
 * `error.metadata.file_annotations`, so both locations are read and deduped
 * by the engine's file hash.
 */

interface OcrFileContentPart {
	readonly type?: string;
	readonly text?: string;
	readonly image_url?: { readonly url?: string };
}

interface OcrFileAnnotation {
	readonly type?: string;
	readonly file?: {
		readonly filename?: string;
		readonly hash?: string;
		readonly content?: readonly OcrFileContentPart[];
	};
}

interface OcrResponse {
	readonly choices?: readonly { readonly message?: { readonly annotations?: unknown } }[];
	readonly error?: {
		readonly message?: string;
		readonly metadata?: { readonly file_annotations?: unknown };
	};
}

const asAnnotations = (value: unknown): OcrFileAnnotation[] =>
	Array.isArray(value) ? (value as OcrFileAnnotation[]) : [];

/** Annotations from the success path and the failure path, deduped by file hash. */
export const collectFileAnnotations = (payload: OcrResponse): OcrFileAnnotation[] => {
	const seen = new Set<string>();
	const collected: OcrFileAnnotation[] = [];
	const sources = [
		...asAnnotations(payload.choices?.[0]?.message?.annotations),
		...asAnnotations(payload.error?.metadata?.file_annotations)
	];
	for (const annotation of sources) {
		if (annotation?.type !== 'file' || !annotation.file) continue;
		const hash = annotation.file.hash;
		if (hash) {
			if (seen.has(hash)) continue;
			seen.add(hash);
		}
		collected.push(annotation);
	}
	return collected;
};

export const annotationParts = (annotations: readonly OcrFileAnnotation[]): OcrContentPart[] => {
	const parts: OcrContentPart[] = [];
	for (const annotation of annotations)
		for (const part of annotation.file?.content ?? []) {
			if (part.type === 'text' && part.text?.trim())
				parts.push({ kind: 'markdown', text: part.text });
			else if (part.type === 'image_url' && part.image_url?.url)
				parts.push({ kind: 'image', dataUrl: part.image_url.url });
		}
	return parts;
};

export class OpenRouterOcrClient implements OcrEngineClient {
	private readonly endpoint: string;
	private readonly appURL: string;

	constructor(
		private readonly apiKey: string,
		options: OpenRouterClientOptions = {}
	) {
		this.endpoint = `${options.baseURL ?? DEFAULT_OPENROUTER_BASE_URL}/chat/completions`;
		this.appURL = options.appURL ?? 'http://localhost:5173';
	}

	async ocr(input: {
		pdfBase64: string;
		fileName: string;
		model: string;
		signal?: AbortSignal;
	}): Promise<OcrPageContent> {
		return traceOperation(
			'attachments.ocr',
			{
				input: JSON.stringify({ fileName: input.fileName, model: input.model }),
				inputMimeType: MimeType.JSON,
				outputMimeType: MimeType.JSON,
				kind: OpenInferenceSpanKind.LLM,
				metadata: { model: input.model, engine: 'mistral-ocr' }
			},
			async () => {
				const response = await fetch(this.endpoint, {
					method: 'POST',
					signal: input.signal ?? AbortSignal.timeout(120_000),
					headers: {
						'content-type': 'application/json',
						authorization: `Bearer ${this.apiKey}`,
						'HTTP-Referer': this.appURL,
						'X-Title': 'FollowThrough'
					},
					body: JSON.stringify({
						model: input.model,
						messages: [
							{
								role: 'user',
								content: [
									{
										type: 'text',
										text: 'Extract the full text of this document as markdown, preserving tables and reading order.'
									},
									{
										type: 'file',
										file: {
											filename: input.fileName,
											file_data: `data:application/pdf;base64,${input.pdfBase64}`
										}
									}
								]
							}
						],
						plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]
					})
				});
				const payload = (await response.json()) as OcrResponse;
				const parts = annotationParts(collectFileAnnotations(payload));
				if (parts.length > 0) return { parts };
				if (!response.ok)
					throw new ExternalServiceError('PDF OCR failed', {
						cause: payload.error?.message ?? `OpenRouter OCR returned ${response.status}`
					});
				throw new ExternalServiceError('PDF OCR returned no content');
			},
			(content) =>
				JSON.stringify({
					markdownParts: content.parts.filter((part) => part.kind === 'markdown').length,
					imageParts: content.parts.filter((part) => part.kind === 'image').length
				})
		);
	}
}
