import { describe, expect, it } from 'vitest';
import type { AttachmentExtractionSource, RecognizedContent } from '$lib/models/attachments/ocr';
import {
	InMemoryImageDescriber,
	InMemoryOcrEngine,
	InMemoryStorage
} from '$lib/testing/attachments/fakes/processing';
import { AttachmentExtraction } from './extraction';

const document: AttachmentExtractionSource = {
	objectKey: 'objects/doc',
	byteSize: 3,
	path: 'doc.pdf',
	kind: 'document'
};

const setup = (parts?: readonly RecognizedContent[]) => {
	const storage = new InMemoryStorage();
	const ocr = new InMemoryOcrEngine();
	if (parts) ocr.parts = parts;
	const describer = new InMemoryImageDescriber();
	const extraction = new AttachmentExtraction({
		storage,
		ocr: { url: 'https://ocr.test/v1/ocr', model: 'test-ocr', headers: {}, fetch: ocr.fetch },
		vision: { url: 'https://vision.test/v1/chat/completions', headers: {}, fetch: describer.fetch },
		observer: { run: (_name, _context, body) => body() },
		logger: { error: () => {} }
	});
	return { storage, ocr, describer, extraction };
};

describe('text extraction', () => {
	it('decodes stored UTF-8 text without calling OCR', async () => {
		const { extraction, storage, ocr } = setup();
		storage.text = 'Café notes';
		const result = await extraction.extract({ ...document, kind: 'text' }, 'test/vision');
		expect({ result, ocrCalls: ocr.calls }).toEqual({
			result: { text: 'Café notes', parserKind: 'text' },
			ocrCalls: []
		});
	});
});

describe('document extraction', () => {
	it('sends the whole document to OCR once, by presigned URL', async () => {
		const { extraction, ocr } = setup();
		const result = await extraction.extract(document, 'test/vision');
		expect({ result, calls: ocr.calls }).toEqual({
			result: { text: 'ocr text', parserKind: 'ocr' },
			calls: [{ documentUrl: 'https://storage.test/presigned', kind: 'document' }]
		});
	});

	it('gives the vision model the Markdown that precedes an image', async () => {
		const { extraction, describer } = setup([
			{ kind: 'markdown', text: 'Introduction.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		]);
		await extraction.extract(document, 'test/vision');
		expect(describer.calls[0]).toMatchObject({
			prompt: expect.stringContaining(
				'This image appears in a document near the following text:\nIntroduction.'
			),
			imageDataUrl: 'data:image/png;base64,AAA',
			model: 'test/vision'
		});
	});

	it('keeps reading order when descriptions finish out of order', async () => {
		const { extraction, describer } = setup([
			{ kind: 'image', dataUrl: 'data:image/png;base64,ONE' },
			{ kind: 'markdown', text: 'Middle.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,TWO' }
		]);
		describer.descriptions.set('data:image/png;base64,ONE', 'First.');
		describer.descriptions.set('data:image/png;base64,TWO', 'Second.');
		const secondStarted = Promise.withResolvers<void>();
		describer.beforeDescribe = async ({ imageDataUrl }) => {
			if (imageDataUrl.endsWith('ONE')) await secondStarted.promise;
			else secondStarted.resolve();
		};
		const result = await extraction.extract(document, 'test/vision');
		expect(result.text).toBe('> **Image 1:** First.\n\nMiddle.\n\n> **Image 2:** Second.');
	});

	it('keeps document text and a placeholder when an embedded image description fails', async () => {
		const { extraction, describer } = setup([
			{ kind: 'markdown', text: 'Before.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		]);
		describer.failure = new Error('Vision unavailable');
		const result = await extraction.extract(document, 'test/vision');
		expect(result.text).toBe('Before.\n\n> **Image 1:** (description unavailable)');
	});

	it('propagates an OCR provider failure', async () => {
		const { extraction, ocr } = setup();
		ocr.failure = new Error('OCR engine down');
		await expect(extraction.extract(document, 'test/vision')).rejects.toThrow('OCR engine down');
	});
});

describe('image extraction', () => {
	const image: AttachmentExtractionSource = { ...document, path: 'chart.png', kind: 'image' };

	it('sends the image to OCR as an image and appends its own description', async () => {
		const { extraction, ocr, describer } = setup();
		const result = await extraction.extract(image, 'test/vision');
		expect({ result, ocr: ocr.calls[0], description: describer.calls[0] }).toMatchObject({
			result: { text: 'ocr text\n\n> **Image:** a factual description', parserKind: 'ocr' },
			ocr: { kind: 'image' },
			description: { imageDataUrl: 'https://storage.test/presigned', model: 'test/vision' }
		});
	});

	it('keeps the OCR text and reports a failed description as partial', async () => {
		const { extraction, describer } = setup();
		describer.failure = new Error('Vision unavailable');
		expect(await extraction.extract(image, 'test/vision')).toEqual({
			text: 'ocr text',
			parserKind: 'ocr',
			processingFailure: 'Vision unavailable'
		});
	});
});
