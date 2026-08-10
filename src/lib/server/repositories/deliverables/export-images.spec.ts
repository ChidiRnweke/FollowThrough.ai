import { describe, expect, it } from 'vitest';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { attachmentIdFromSrc, collectImageSources, fetchImages } from './export-images';

const doc = (srcs: string[]): ProseMirrorDocument => ({
	type: 'doc',
	content: srcs.map((src) => ({ type: 'image', attrs: { src } }))
});

describe('collecting image sources from a note document', () => {
	it('collects app-owned relative attachment URLs alongside remote http(s) URLs', () => {
		expect(
			collectImageSources(doc(['/api/attachments/a1/content', 'https://example.com/pic.png']))
		).toEqual(['/api/attachments/a1/content', 'https://example.com/pic.png']);
	});

	it('ignores data URLs, which the generators embed directly', () => {
		expect(collectImageSources(doc(['data:image/png;base64,AAA']))).toEqual([]);
	});

	it('extracts the attachment id from an app-owned content URL', () => {
		expect(attachmentIdFromSrc('/api/attachments/abc-123/content')).toBe('abc-123');
	});

	it('does not read an attachment id from a non-app-owned URL', () => {
		expect(
			attachmentIdFromSrc('https://example.com/api/attachments/a1/content?signed=1')
		).toBeUndefined();
	});
});

describe('fetching export images', () => {
	it('resolves relative attachment sources through the injected resolver', async () => {
		const images = await fetchImages(['/api/attachments/a1/content'], async (src) =>
			src === '/api/attachments/a1/content' ? 'data:image/png;base64,AAA' : undefined
		);
		expect(images.get('/api/attachments/a1/content')).toBe('data:image/png;base64,AAA');
	});

	it('omits relative sources the resolver cannot reach', async () => {
		const images = await fetchImages(['/api/attachments/missing/content']);
		expect(images.size).toBe(0);
	});

	it('denies document-authored remote URLs unless the resolver approves them', async () => {
		const images = await fetchImages(['https://example.com/pic.png']);
		expect(images.size).toBe(0);
	});

	it('allows an injected resolver to approve a remote URL explicitly', async () => {
		const source = 'https://storage.test/presigned';
		const images = await fetchImages([source], async () => 'data:image/png;base64,AAA');
		expect(images.get(source)).toBe('data:image/png;base64,AAA');
	});
});
