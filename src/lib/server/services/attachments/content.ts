export type OcrContentPart =
	| { readonly kind: 'markdown'; readonly text: string }
	| { readonly kind: 'image'; readonly dataUrl: string };
export interface OcrEngineClient {
	ocr(input: {
		documentUrl: string;
		kind: 'document' | 'image';
		fileName: string;
		maxPages?: number;
		signal?: AbortSignal;
	}): Promise<{ readonly parts: readonly OcrContentPart[] }>;
}
export interface ImageDescriber {
	describe(input: { imageDataUrl: string; context?: string; model: string }): Promise<string>;
}
export interface OcrParseInput {
	readonly documentUrl: string;
	readonly kind: 'document' | 'image';
	readonly fileName: string;
	readonly visionModel: string;
	readonly maxPages?: number;
}
export interface DocumentOcr {
	parse(input: OcrParseInput): Promise<string>;
}

/**
 * A document can now come back with far more images than the old per-request
 * budget allowed, and each description is its own round trip, so they are
 * described in parallel rather than one after another. Output order still
 * follows the document.
 */
const DESCRIPTION_CONCURRENCY = 4;

/**
 * Runs OCR over a document and returns one enriched markdown string: the
 * engine's markdown parts in order, with each embedded image replaced by an
 * inlined description at the image's position. Image description failures are
 * non-fatal (a placeholder is kept); OCR engine failures propagate so callers
 * can fall back to a plain text parser. Tables arrive as markdown from the
 * engine and are passed through untouched.
 */
export class AttachmentContent implements DocumentOcr {
	constructor(
		private readonly engine: OcrEngineClient,
		private readonly describer: ImageDescriber
	) {}

	async parse(input: OcrParseInput): Promise<string> {
		const content = await this.engine.ocr({
			documentUrl: input.documentUrl,
			kind: input.kind,
			fileName: input.fileName,
			...(input.maxPages === undefined ? {} : { maxPages: input.maxPages })
		});
		return this.render(content.parts, input.visionModel);
	}

	private async render(parts: readonly OcrContentPart[], model: string): Promise<string> {
		// Resolve every slot's text first so descriptions can run concurrently
		// without disturbing the document's reading order.
		const rendered: string[] = new Array(parts.length).fill('');
		const images: { slot: number; dataUrl: string; index: number; context?: string }[] = [];
		let imageIndex = 0;
		let precedingMarkdown: string | undefined;

		parts.forEach((part, slot) => {
			if (part.kind === 'markdown') {
				const text = part.text.trim();
				rendered[slot] = text;
				if (text) precedingMarkdown = text;
				return;
			}
			imageIndex += 1;
			images.push({
				slot,
				dataUrl: part.dataUrl,
				index: imageIndex,
				...(precedingMarkdown ? { context: precedingMarkdown.slice(-1000) } : {})
			});
		});

		let next = 0;
		const worker = async () => {
			while (next < images.length) {
				const image = images[next++];
				rendered[image.slot] = await this.describeImage(image, model);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(DESCRIPTION_CONCURRENCY, images.length) }, worker)
		);

		return rendered.filter(Boolean).join('\n\n');
	}

	private async describeImage(
		image: { dataUrl: string; index: number; context?: string },
		model: string
	): Promise<string> {
		try {
			const description = await this.describer.describe({
				imageDataUrl: image.dataUrl,
				...(image.context ? { context: image.context } : {}),
				model
			});
			return `> **Image ${image.index}:** ${description}`;
		} catch {
			return `> **Image ${image.index}:** (description unavailable)`;
		}
	}
}
