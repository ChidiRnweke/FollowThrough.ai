import { describe, expect, it } from 'vitest';
import { ExportPreparationService } from './export-preparation';
const preparation = new ExportPreparationService();
import type { ProseMirrorDocument } from '$lib/models/notes';
const imageSources = (value: ProseMirrorDocument) =>
	preparation.assets(value).images.map((image) => image.source);
const document = (sources: string[]): ProseMirrorDocument => ({
	type: 'doc',
	content: sources.map((src) => ({ type: 'image', attrs: { src } }))
});
describe('document image sources', () => {
	it('collects unique attachment and external image references', () => {
		expect(
			imageSources(
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
			preparation
				.prepare({
					title: 'Export',
					notes: [{ title: 'Note', document: document([src]) }]
				})
				.images.get(src)
		).toBe(src);
	});
	it('extracts the attachment reference for authorization', () => {
		expect(
			preparation.assets(
				document(['/api/attachments/00000000-0000-4000-8000-000000000001/content'])
			).images[0]
		).toEqual({
			kind: 'attachment',
			source: '/api/attachments/00000000-0000-4000-8000-000000000001/content',
			id: '00000000-0000-4000-8000-000000000001'
		});
	});
	it('does not treat a signed external URL as an attachment reference', () => {
		expect(
			preparation.assets(document(['https://example.com/api/attachments/a/content?signed=1']))
				.images[0]
		).toEqual({
			kind: 'external',
			source: 'https://example.com/api/attachments/a/content?signed=1'
		});
	});
});
