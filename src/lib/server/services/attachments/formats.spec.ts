import { describe, expect, it } from 'vitest';
import { AttachmentFormatService } from './formats';

describe('Attachment recognition formats', () => {
	it('recognizes office documents with generic browser media types', () => {
		expect(new AttachmentFormatService().ocrKind('application/octet-stream', 'Report.DOCX')).toBe(
			'document'
		);
	});
	it('routes an image extension through image recognition', () => {
		expect(new AttachmentFormatService().ocrKind('application/octet-stream', 'Photo.HEIC')).toBe(
			'image'
		);
	});
	it('does not offer OCR for archive files', () => {
		expect(new AttachmentFormatService().ocrKind('application/zip', 'archive.zip')).toBeUndefined();
	});
});
