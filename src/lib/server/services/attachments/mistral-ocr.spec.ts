import { describe, expect, it } from 'vitest';
import { MistralOcr, type OcrFetchTransport } from './mistral-ocr';

class FakeFetch implements OcrFetchTransport {
	request?: { url: string; init?: RequestInit };

	constructor(
		private readonly payload: unknown,
		private readonly status = 200
	) {}

	readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		this.request = { url: String(input), init };
		return new Response(JSON.stringify(this.payload), {
			status: this.status,
			headers: { 'content-type': 'application/json' }
		});
	};
}

const clientUsing = (transport: FakeFetch) =>
	new MistralOcr('test-key', {
		baseURL: 'https://mistral.test/v1',
		model: 'mistral-ocr-latest',
		fetch: transport.fetch
	});

const input = {
	documentUrl: 'https://storage.test/object?signed',
	kind: 'document' as const,
	fileName: 'doc.pdf'
};

const bodyOf = (transport: FakeFetch) => JSON.parse(String(transport.request?.init?.body));

describe('MistralOcr requests', () => {
	it('posts to the ocr endpoint', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: 'text' }] });

		await clientUsing(transport).ocr(input);

		expect(transport.request?.url).toBe('https://mistral.test/v1/ocr');
	});

	it('authorizes with the mistral api key', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: 'text' }] });

		await clientUsing(transport).ocr(input);

		expect((transport.request?.init?.headers as Record<string, string>).authorization).toBe(
			'Bearer test-key'
		);
	});

	it('sends a document as a document_url', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: 'text' }] });

		await clientUsing(transport).ocr(input);

		expect(bodyOf(transport).document).toEqual({
			type: 'document_url',
			document_url: 'https://storage.test/object?signed'
		});
	});

	it('sends an image as an image_url', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: 'text' }] });

		await clientUsing(transport).ocr({ ...input, kind: 'image', fileName: 'photo.png' });

		expect(bodyOf(transport).document).toEqual({
			type: 'image_url',
			image_url: 'https://storage.test/object?signed'
		});
	});

	it('requests embedded images so they can be described', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: 'text' }] });

		await clientUsing(transport).ocr(input);

		expect(bodyOf(transport).include_image_base64).toBe(true);
	});
});

describe('MistralOcr response parsing', () => {
	it('splits page markdown at image placeholders', async () => {
		const transport = new FakeFetch({
			pages: [
				{
					index: 0,
					markdown: 'Intro.\n\n![img-0.png](img-0.png)\n\nClosing.',
					images: [{ id: 'img-0.png', image_base64: 'AAA' }]
				}
			]
		});

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: 'Intro.\n\n' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' },
			{ kind: 'markdown', text: '\n\nClosing.' }
		]);
	});

	it('keeps a base64 value that already carries a data url prefix', async () => {
		const transport = new FakeFetch({
			pages: [
				{
					index: 0,
					markdown: '![img-0.jpeg](img-0.jpeg)',
					images: [{ id: 'img-0.jpeg', image_base64: 'data:image/jpeg;base64,BBB' }]
				}
			]
		});

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([{ kind: 'image', dataUrl: 'data:image/jpeg;base64,BBB' }]);
	});

	it('leaves a placeholder whose image was not returned in the markdown', async () => {
		const transport = new FakeFetch({
			pages: [{ index: 0, markdown: 'See ![diagram](https://example.test/d.png) above.' }]
		});

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: 'See ![diagram](https://example.test/d.png) above.' }
		]);
	});

	it('concatenates pages in index order', async () => {
		const transport = new FakeFetch({
			pages: [
				{ index: 1, markdown: 'second' },
				{ index: 0, markdown: 'first' }
			]
		});

		const content = await clientUsing(transport).ocr(input);

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: 'first' },
			{ kind: 'markdown', text: 'second' }
		]);
	});

	it('drops pages past the page cap', async () => {
		const transport = new FakeFetch({
			pages: [
				{ index: 0, markdown: 'first' },
				{ index: 1, markdown: 'second' },
				{ index: 2, markdown: 'third' }
			]
		});

		const content = await clientUsing(transport).ocr({ ...input, maxPages: 2 });

		expect(content.parts).toEqual([
			{ kind: 'markdown', text: 'first' },
			{ kind: 'markdown', text: 'second' }
		]);
	});

	it('reports the pages the engine processed', async () => {
		const transport = new FakeFetch({
			pages: [{ index: 0, markdown: 'text' }],
			usage_info: { pages_processed: 7 }
		});

		const content = await clientUsing(transport).ocr(input);

		expect(content.pagesProcessed).toBe(7);
	});
});

describe('MistralOcr failures', () => {
	it('reports the engine message on a non-2xx response', async () => {
		const transport = new FakeFetch({ message: 'Unsupported file type' }, 422);

		await expect(clientUsing(transport).ocr(input)).rejects.toThrow('Document OCR failed');
	});

	it('fails when a response carries no readable content', async () => {
		const transport = new FakeFetch({ pages: [{ index: 0, markdown: '   ' }] });

		await expect(clientUsing(transport).ocr(input)).rejects.toThrow(
			'Document OCR returned no content'
		);
	});
});
