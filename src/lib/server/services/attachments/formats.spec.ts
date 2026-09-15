import { describe, expect, it } from 'vitest';
import { isOcrImage, isOcrSupported } from './formats';

describe('Attachment recognition formats', () => {
	it('recognizes office documents with generic browser media types', () => {
		expect(isOcrSupported('application/octet-stream', 'Report.DOCX')).toBe(true);
	});
	it('routes an image extension through image recognition', () => {
		expect(isOcrImage('application/octet-stream', 'Photo.HEIC')).toBe(true);
	});
	it('does not offer OCR for archive files', () => {
		expect(isOcrSupported('application/zip', 'archive.zip')).toBe(false);
	});
});
