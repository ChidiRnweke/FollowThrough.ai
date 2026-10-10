import { describe, expect, it } from 'vitest';
import { attachmentIdFromSrc, exportImageSources, prepareExport } from './export-preparation';
import type { ProseMirrorDocument } from '$lib/models/notes';
const document = (sources: string[]): ProseMirrorDocument => ({
	type: 'doc',
	content: sources.map((src) => ({ type: 'image', attrs: { src } }))
});
describe('document image sources', () => {
	it('collects unique attachment and external image references', () => {
		expect(
			exportImageSources(
				document([
					'/api/attachments/a/content',
					'https://example.com/pic.png',
					'/api/attachments/a/content'
				])
			)
		).toEqual(['/api/attachments/a/content', 'https://example.com/pic.png']);
	});
	it('embeds inline image data without a remote resolver', () => {
		const src = 'data:image/png;base64,AAA';
		expect(
			prepareExport({
				title: 'Export',
				notes: [{ title: 'Note', document: document([src]) }]
			}).images.get(src)
		).toBe(src);
	});
	it('extracts the attachment reference for authorization', () => {
		expect(
			attachmentIdFromSrc('/api/attachments/00000000-0000-4000-8000-000000000001/content')
		).toBe('00000000-0000-4000-8000-000000000001');
	});
	it('does not treat a signed external URL as an attachment reference', () => {
		expect(
			attachmentIdFromSrc('https://example.com/api/attachments/a/content?signed=1')
		).toBeUndefined();
	});
});
