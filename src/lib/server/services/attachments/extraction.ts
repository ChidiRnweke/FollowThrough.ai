import type { AttachmentView } from '$lib/models/attachments';
import { isOcrImage, isOcrSupported } from '$lib/models/attachments/formats';
import type {
	DocumentOcr,
	ImageDescriber,
	AttachmentParsers
} from '$lib/server/repositories/attachments/processing';
import type { IAttachmentStorage } from '$lib/server/repositories/attachments/storage';
const maxAttachmentBytes = (): number =>
	Number(process.env.ATTACHMENT_MAX_BYTES ?? 50 * 1024 * 1024);
const maxParseBytes = (): number =>
	Number(process.env.ATTACHMENT_PARSE_MAX_BYTES ?? maxAttachmentBytes());
const ocrMaxPages = (): number => Number(process.env.ATTACHMENT_OCR_MAX_PAGES ?? 100);
const OCR_URL_TTL_SECONDS = 900;

export class AttachmentExtraction {
	constructor(
		private readonly storage: IAttachmentStorage,
		private readonly parsers: AttachmentParsers,
		private readonly documentOcr: DocumentOcr,
		private readonly imageDescriber: ImageDescriber
	) {}
	/**
	 * Plain text is decoded in-process — that is free and lossless, so a markdown
	 * or JSON attachment never costs an OCR call. Everything else the OCR engine
	 * accepts goes to OCR, which is what captures tables and embedded images.
	 *
	 * Returns undefined for a format nothing can read; OCR failures propagate so
	 * the attachment is recorded as failed and can be retried, rather than
	 * silently storing weaker text.
	 */
	async extract(
		view: AttachmentView,
		visionModel: string
	): Promise<
		| { text: string; parserKind: string; processingFailure?: undefined }
		| { text: string; parserKind: string; processingFailure: string }
		| undefined
	> {
		const { mediaType, byteSize, objectKey } = view.version;
		const path = view.attachment.path;
		const parseLimit = maxParseBytes();

		const parser = this.parsers.select(mediaType, path);
		if (parser && byteSize <= parseLimit)
			return {
				text: (await parser.parse(await this.storage.read(objectKey, parseLimit))).slice(
					0,
					parseLimit
				),
				parserKind: parser.kind
			};

		if (!isOcrSupported(mediaType, path)) return undefined;

		// OCR reads the object straight from a presigned URL, so no bytes pass
		// through this process.
		const image = isOcrImage(mediaType, path);
		const documentUrl = await this.storage.createDownloadUrl(objectKey, OCR_URL_TTL_SECONDS);
		const text = await this.documentOcr.parse({
			documentUrl,
			kind: image ? 'image' : 'document',
			fileName: path,
			visionModel,
			maxPages: ocrMaxPages()
		});
		// A photo can carry very little text, so an image keeps a description of
		// the image itself alongside whatever text OCR recovered.
		if (!image) return { text, parserKind: 'ocr' };

		try {
			const description = await this.describeImage(view, visionModel);
			return { text: [text.trim(), description].filter(Boolean).join('\n\n'), parserKind: 'ocr' };
			// audit-allow: silent-catch — OCR text remains valid; the typed partial result persists this failure for the owning UI.
		} catch (error) {
			return {
				text: text.trim(),
				parserKind: 'ocr',
				processingFailure: error instanceof Error ? error.message : 'Image description failed'
			};
		}
	}

	private async describeImage(view: AttachmentView, visionModel: string): Promise<string> {
		const imageUrl = await this.storage.createDownloadUrl(view.version.objectKey, 300);
		return `> **Image:** ${await this.imageDescriber.describe({ imageDataUrl: imageUrl, model: visionModel })}`;
	}
}
