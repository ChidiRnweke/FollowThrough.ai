import type {
	AttachmentExtractionSource,
	ExtractedAttachmentContent
} from '$lib/models/attachments/ocr';
import type { AttachmentContentExtraction } from '$lib/server/services/attachments/extraction';

/** Attachment extraction that records each request and answers from configured content. */
export class InMemoryAttachmentExtraction implements AttachmentContentExtraction {
	readonly calls: { readonly source: AttachmentExtractionSource; readonly visionModel: string }[] =
		[];
	/** Content per extraction kind; text decodes, documents and images come back as OCR. */
	results: Record<AttachmentExtractionSource['kind'], ExtractedAttachmentContent> = {
		text: { text: 'decoded text', parserKind: 'text' },
		document: { text: 'ocr text', parserKind: 'ocr' },
		image: { text: 'ocr text', parserKind: 'ocr' }
	};
	failure?: Error;
	beforeExtract: () => Promise<void> = async () => {};

	async extract(
		source: AttachmentExtractionSource,
		visionModel: string
	): Promise<ExtractedAttachmentContent> {
		this.calls.push({ source, visionModel });
		await this.beforeExtract();
		if (this.failure) throw this.failure;
		return this.results[source.kind];
	}
}
