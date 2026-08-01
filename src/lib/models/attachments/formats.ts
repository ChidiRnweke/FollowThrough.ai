/**
 * Formats Mistral Document AI accepts. Kept as extensions rather than media
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
export const isOcrImage = (mediaType: string, path: string): boolean =>
	mediaType.startsWith('image/') || OCR_IMAGE_EXTENSIONS.has(extensionOf(path));

export const isOcrSupported = (mediaType: string, path: string): boolean => {
	if (isOcrImage(mediaType, path)) return true;
	return mediaType === 'application/pdf' || OCR_DOCUMENT_EXTENSIONS.has(extensionOf(path));
};
