import { describe, expect, it } from 'vitest';
import type {
	ImageDescriber,
	OcrContentPart,
	OcrEngineClient,
	PdfPageRange,
	PdfSplitter
} from './contracts';
import { DocumentOcrService, OCR_SINGLE_REQUEST_PAGE_LIMIT, OCR_SPLIT_RANGE_PAGES } from './ocr';

class FakeOcrEngine implements OcrEngineClient {
	calls: { pdfBase64: string; fileName: string; model: string }[] = [];
	responses: (readonly OcrContentPart[] | Error)[] = [];

	async ocr(input: { pdfBase64: string; fileName: string; model: string }) {
		this.calls.push(input);
		const response = this.responses.shift() ?? [];
		if (response instanceof Error) throw response;
		return { parts: response };
	}
}

class FakeImageDescriber implements ImageDescriber {
	calls: { imageDataUrl: string; context?: string; model: string }[] = [];
	fail = false;

	async describe(input: { imageDataUrl: string; context?: string; model: string }) {
		this.calls.push(input);
		if (this.fail) throw new Error('Vision unavailable');
		return `description of ${input.imageDataUrl}`;
	}
}

class FakePdfSplitter implements PdfSplitter {
	constructor(private readonly pages: number) {}
	ranges: readonly PdfPageRange[] = [];

	async pageCount(): Promise<number> {
		return this.pages;
	}

	async split(_bytes: Uint8Array, ranges: readonly PdfPageRange[]): Promise<Uint8Array[]> {
		this.ranges = ranges;
		return ranges.map((range) => new Uint8Array([range.start, range.end]));
	}
}

const markdown = (text: string): OcrContentPart => ({ kind: 'markdown', text });
const image = (dataUrl: string): OcrContentPart => ({ kind: 'image', dataUrl });

const setup = (pages: number) => {
	const engine = new FakeOcrEngine();
	const describer = new FakeImageDescriber();
	const splitter = new FakePdfSplitter(pages);
	const service = new DocumentOcrService(engine, describer, splitter);
	return { engine, describer, splitter, service };
};

const bytes = new Uint8Array([1, 2, 3]);

describe('DocumentOcrService split decisions', () => {
	it('sends a single OCR request at or below the single-request page limit', async () => {
		const { engine, splitter, service } = setup(OCR_SINGLE_REQUEST_PAGE_LIMIT);
		engine.responses = [[markdown('whole document')]];

		const text = await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(text).toBe('whole document');
		expect(engine.calls).toHaveLength(1);
		expect(splitter.ranges).toHaveLength(0);
	});

	it('splits larger documents into 10-page ranges, one OCR call each', async () => {
		const { engine, splitter, service } = setup(25);
		engine.responses = [
			[markdown('range one')],
			[markdown('range two')],
			[markdown('range three')]
		];

		await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(splitter.ranges).toEqual([
			{ start: 0, end: 9 },
			{ start: 10, end: 19 },
			{ start: 20, end: 24 }
		]);
		expect(engine.calls).toHaveLength(3);
		expect(OCR_SPLIT_RANGE_PAGES).toBe(10);
	});

	it('merges range results in document order', async () => {
		const { engine, service } = setup(21);
		engine.responses = [[markdown('first')], [markdown('second')], [markdown('third')]];

		const text = await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(text).toBe('first\n\nsecond\n\nthird');
	});
});

describe('DocumentOcrService image inlining', () => {
	it('inlines each image description at the image position', async () => {
		const { engine, describer, service } = setup(3);
		engine.responses = [
			[markdown('Intro paragraph.'), image('data:image/png;base64,AAA'), markdown('Closing.')]
		];

		const text = await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(text).toBe(
			'Intro paragraph.\n\n> **Image 1:** description of data:image/png;base64,AAA\n\nClosing.'
		);
		expect(describer.calls).toEqual([
			{
				imageDataUrl: 'data:image/png;base64,AAA',
				context: 'Intro paragraph.',
				model: 'ocr-model'
			}
		]);
	});

	it('keeps a placeholder when an image description fails', async () => {
		const { engine, describer, service } = setup(3);
		describer.fail = true;
		engine.responses = [[markdown('Before.'), image('data:image/png;base64,AAA')]];

		const text = await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(text).toBe('Before.\n\n> **Image 1:** (description unavailable)');
	});

	it('numbers images sequentially across page ranges', async () => {
		const { engine, service } = setup(11 + OCR_SPLIT_RANGE_PAGES);
		engine.responses = [
			[image('data:image/png;base64,ONE')],
			[markdown('middle'), image('data:image/png;base64,TWO')]
		];

		const text = await service.parse(bytes, 'doc.pdf', 'ocr-model');

		expect(text).toBe(
			'> **Image 1:** description of data:image/png;base64,ONE\n\nmiddle\n\n> **Image 2:** description of data:image/png;base64,TWO'
		);
	});
});

describe('DocumentOcrService failure handling', () => {
	it('propagates OCR engine failures so callers can fall back', async () => {
		const { engine, service } = setup(3);
		engine.responses = [new Error('OCR engine down')];

		await expect(service.parse(bytes, 'doc.pdf', 'ocr-model')).rejects.toThrow('OCR engine down');
	});
});
