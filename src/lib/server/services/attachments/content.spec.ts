import { describe, expect, it } from 'vitest';
import type { ImageDescriber, OcrContentPart, OcrEngineClient } from './content';
import { AttachmentContent } from './content';

class FakeOcrEngine implements OcrEngineClient {
	calls: { documentUrl: string; kind: string; fileName: string; maxPages?: number }[] = [];
	response: readonly OcrContentPart[] | Error = [];

	async ocr(input: {
		documentUrl: string;
		kind: 'document' | 'image';
		fileName: string;
		maxPages?: number;
	}) {
		this.calls.push(input);
		if (this.response instanceof Error) throw this.response;
		return { parts: this.response };
	}
}

class FakeImageDescriber implements ImageDescriber {
	calls: { imageDataUrl: string; context?: string; model: string }[] = [];
	fail = false;
	/** Resolves in reverse call order so out-of-order completion is exercised. */
	stagger = false;

	async describe(input: { imageDataUrl: string; context?: string; model: string }) {
		this.calls.push(input);
		if (this.fail) throw new Error('Vision unavailable');
		if (this.stagger) await new Promise((resolve) => setTimeout(resolve, this.calls.length * 5));
		return `description of ${input.imageDataUrl}`;
	}
}

const markdown = (text: string): OcrContentPart => ({ kind: 'markdown', text });
const image = (dataUrl: string): OcrContentPart => ({ kind: 'image', dataUrl });

const setup = () => {
	const engine = new FakeOcrEngine();
	const describer = new FakeImageDescriber();
	return { engine, describer, service: new AttachmentContent(engine, describer) };
};

const request = {
	documentUrl: 'https://storage.test/object?signed',
	kind: 'document' as const,
	fileName: 'doc.pdf',
	visionModel: 'vision-model'
};

describe('AttachmentContent OCR requests', () => {
	it('sends the whole document as one request', async () => {
		const { engine, service } = setup();
		engine.response = [markdown('whole document')];

		const text = await service.parse(request);

		expect(text).toBe('whole document');
		expect(engine.calls).toHaveLength(1);
	});

	it('forwards the presigned url and document kind to the engine', async () => {
		const { engine, service } = setup();
		engine.response = [markdown('content')];

		await service.parse({ ...request, kind: 'image', fileName: 'photo.png' });

		expect(engine.calls[0]).toMatchObject({
			documentUrl: 'https://storage.test/object?signed',
			kind: 'image',
			fileName: 'photo.png'
		});
	});

	it('forwards the page cap to the engine', async () => {
		const { engine, service } = setup();
		engine.response = [markdown('content')];

		await service.parse({ ...request, maxPages: 40 });

		expect(engine.calls[0].maxPages).toBe(40);
	});
});

describe('AttachmentContent image inlining', () => {
	it('inlines each image description at the image position', async () => {
		const { engine, service } = setup();
		engine.response = [
			markdown('Intro paragraph.'),
			image('data:image/png;base64,AAA'),
			markdown('Closing.')
		];

		const text = await service.parse(request);

		expect(text).toBe(
			'Intro paragraph.\n\n> **Image 1:** description of data:image/png;base64,AAA\n\nClosing.'
		);
	});

	it('passes the preceding markdown as description context', async () => {
		const { engine, describer, service } = setup();
		engine.response = [markdown('Intro paragraph.'), image('data:image/png;base64,AAA')];

		await service.parse(request);

		expect(describer.calls).toEqual([
			{
				imageDataUrl: 'data:image/png;base64,AAA',
				context: 'Intro paragraph.',
				model: 'vision-model'
			}
		]);
	});

	it('keeps a placeholder when an image description fails', async () => {
		const { engine, describer, service } = setup();
		describer.fail = true;
		engine.response = [markdown('Before.'), image('data:image/png;base64,AAA')];

		const text = await service.parse(request);

		expect(text).toBe('Before.\n\n> **Image 1:** (description unavailable)');
	});

	it('keeps images in document order when descriptions resolve out of order', async () => {
		const { engine, describer, service } = setup();
		describer.stagger = true;
		engine.response = [
			image('data:image/png;base64,ONE'),
			markdown('middle'),
			image('data:image/png;base64,TWO')
		];

		const text = await service.parse(request);

		expect(text).toBe(
			'> **Image 1:** description of data:image/png;base64,ONE\n\nmiddle\n\n> **Image 2:** description of data:image/png;base64,TWO'
		);
	});

	it('describes images concurrently rather than one at a time', async () => {
		const { engine, describer, service } = setup();
		let peak = 0;
		let active = 0;
		describer.describe = async (input) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
			return `description of ${input.imageDataUrl}`;
		};
		engine.response = Array.from({ length: 4 }, (_, index) =>
			image(`data:image/png;base64,${index}`)
		);

		await service.parse(request);

		expect(peak).toBeGreaterThan(1);
	});
});

describe('AttachmentContent failure handling', () => {
	it('propagates OCR engine failures so callers can fall back', async () => {
		const { engine, service } = setup();
		engine.response = new Error('OCR engine down');

		await expect(service.parse(request)).rejects.toThrow('OCR engine down');
	});
});
