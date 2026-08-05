import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ProseMirrorDocument } from '$lib/models/notes';
import {
	attachmentIdFromSrc,
	collectImageSources,
	fetchImages,
	fetchRemoteDataUrl
} from './export-images';

const doc = (srcs: string[]): ProseMirrorDocument => ({
	type: 'doc',
	content: srcs.map((src) => ({ type: 'image', attrs: { src } }))
});

/** A local server serving one canned response, closed on release. */
const serve = (
	respond: (url: URL) => { status: number; headers: Record<string, string>; body: Buffer }
) => {
	const server = createServer((req, res) => {
		const { status, headers, body } = respond(new URL(req.url ?? '/', 'http://localhost'));
		res.writeHead(status, headers);
		res.end(body);
	});
	const start = new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const url = async (): Promise<string> => {
		await start;
		return `http://127.0.0.1:${(server.address() as AddressInfo).port}/asset`;
	};
	const close = (): Promise<void> =>
		new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	return { url, close };
};

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

	it('fetches remote http(s) sources directly', async () => {
		const server = serve(() => ({
			status: 200,
			headers: { 'content-type': 'image/png' },
			body: Buffer.from([0x89, 0x50, 0x4e, 0x47])
		}));
		try {
			const source = await server.url();
			const images = await fetchImages([source]);
			expect(images.get(source)).toContain('data:image/png;base64,');
		} finally {
			await server.close();
		}
	});

	it('skips responses whose content type cannot be embedded', async () => {
		const server = serve(() => ({
			status: 200,
			headers: { 'content-type': 'text/html' },
			body: Buffer.from('<html/>')
		}));
		try {
			expect(await fetchRemoteDataUrl(await server.url())).toBeUndefined();
		} finally {
			await server.close();
		}
	});
});
