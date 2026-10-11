const TEXT_EXTENSIONS = new Set([
	'md',
	'txt',
	'json',
	'yaml',
	'yml',
	'xml',
	'csv',
	'ts',
	'js',
	'py',
	'sh',
	'sql',
	'html',
	'css',
	'svelte'
]);

/**
 * Format routing for Mistral Document AI. Kept as extensions rather than media
 * types because browsers report office and ebook formats inconsistently (and
 * often as `application/octet-stream`), while the upload path always carries a
 * filename.
 */
const OCR_IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'avif',
	'tiff',
	'tif',
	'gif',
	'heic',
	'heif',
	'bmp',
	'webp'
]);

const OCR_DOCUMENT_EXTENSIONS = new Set([
	'pdf',
	'doc',
	'docx',
	'ppt',
	'pptx',
	'xls',
	'xlsx',
	'csv',
	'epub',
	'rtf',
	'odt',
	'bib',
	'fb2',
	'ipynb',
	'opml',
	'tex',
	'xml'
]);

const extensionOf = (path: string): string => path.split('.').pop()?.toLowerCase() ?? '';

/** Images are the subset routed through `image_url` rather than `document_url`. */
const isOcrImage = (mediaType: string, path: string): boolean =>
	mediaType.startsWith('image/') || OCR_IMAGE_EXTENSIONS.has(extensionOf(path));

const isOcrSupported = (mediaType: string, path: string): boolean => {
	if (isOcrImage(mediaType, path)) return true;
	return mediaType === 'application/pdf' || OCR_DOCUMENT_EXTENSIONS.has(extensionOf(path));
};

export interface AttachmentFormats {
	text(mediaType: string, path: string): boolean;
	ocrKind(mediaType: string, path: string): 'image' | 'document' | undefined;
}
export class AttachmentFormatService implements AttachmentFormats {
	text(mediaType: string, path: string): boolean {
		const extension = path.split('.').pop()?.toLowerCase() ?? '';
		return mediaType.startsWith('text/') || TEXT_EXTENSIONS.has(extension);
	}
	ocrKind(mediaType: string, path: string): 'image' | 'document' | undefined {
		if (!isOcrSupported(mediaType, path)) return undefined;
		return isOcrImage(mediaType, path) ? 'image' : 'document';
	}
}
