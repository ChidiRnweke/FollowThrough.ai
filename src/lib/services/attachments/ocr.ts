import type {
	DocumentOcr,
	ImageDescriber,
	OcrContentPart,
	OcrEngineClient,
	PdfPageRange,
	PdfSplitter
} from './contracts';

/**
 * Mistral OCR accepts one PDF per request and returns at most 8 embedded
 * images per request. Documents at or below this limit go out as a single
 * request; larger documents are split into ranges so the image budget scales
 * with the page count.
 */
export const OCR_SINGLE_REQUEST_PAGE_LIMIT = 15;
export const OCR_SPLIT_RANGE_PAGES = 10;
const OCR_RANGE_CONCURRENCY = 3;

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const pageRanges = (pages: number): PdfPageRange[] => {
	const ranges: PdfPageRange[] = [];
	for (let start = 0; start < pages; start += OCR_SPLIT_RANGE_PAGES)
		ranges.push({ start, end: Math.min(start + OCR_SPLIT_RANGE_PAGES, pages) - 1 });
	return ranges;
};

/**
 * Runs OCR over a PDF and returns one enriched markdown string: the engine's
 * markdown parts in order, with each embedded image replaced by an inlined
 * description at the image's position. Image description failures are
 * non-fatal (a placeholder is kept); OCR engine failures propagate so callers
 * can fall back to a plain text parser.
 */
export class DocumentOcrService implements DocumentOcr {
	constructor(
		private readonly engine: OcrEngineClient,
		private readonly describer: ImageDescriber,
		private readonly splitter: PdfSplitter
	) {}

	async parse(bytes: Uint8Array, fileName: string, model: string): Promise<string> {
		const pages = await this.splitter.pageCount(bytes);
		const parts =
			pages <= OCR_SINGLE_REQUEST_PAGE_LIMIT
				? await this.ocrChunk(bytes, fileName, model)
				: await this.ocrRanges(bytes, pages, fileName, model);
		return this.render(parts, model);
	}

	private async ocrRanges(
		bytes: Uint8Array,
		pages: number,
		fileName: string,
		model: string
	): Promise<readonly OcrContentPart[]> {
		const chunks = await this.splitter.split(bytes, pageRanges(pages));
		const results: (readonly OcrContentPart[])[] = new Array(chunks.length);
		let next = 0;
		const worker = async () => {
			while (next < chunks.length) {
				const index = next++;
				results[index] = await this.ocrChunk(chunks[index], fileName, model);
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(OCR_RANGE_CONCURRENCY, chunks.length) }, worker)
		);
		return results.flat();
	}

	private async ocrChunk(
		bytes: Uint8Array,
		fileName: string,
		model: string
	): Promise<readonly OcrContentPart[]> {
		const content = await this.engine.ocr({
			pdfBase64: toBase64(bytes),
			fileName,
			model,
			signal: AbortSignal.timeout(120_000)
		});
		return content.parts;
	}

	private async render(parts: readonly OcrContentPart[], model: string): Promise<string> {
		const rendered: string[] = [];
		let imageIndex = 0;
		for (const part of parts) {
			if (part.kind === 'markdown') {
				const text = part.text.trim();
				if (text) rendered.push(text);
				continue;
			}
			imageIndex += 1;
			rendered.push(await this.describeImage(part.dataUrl, imageIndex, rendered.at(-1), model));
		}
		return rendered.join('\n\n');
	}

	private async describeImage(
		dataUrl: string,
		imageIndex: number,
		precedingMarkdown: string | undefined,
		model: string
	): Promise<string> {
		try {
			const description = await this.describer.describe({
				imageDataUrl: dataUrl,
				...(precedingMarkdown ? { context: precedingMarkdown.slice(-1000) } : {}),
				model
			});
			return `> **Image ${imageIndex}:** ${description}`;
		} catch {
			return `> **Image ${imageIndex}:** (description unavailable)`;
		}
	}
}
