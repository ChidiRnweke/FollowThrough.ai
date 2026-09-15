import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import { view, finalUpdate } from '$lib/testing/attachments/fakes/processing';
afterEach(() => vi.unstubAllEnvs());
describe('attachment processing OCR routing', () => {
	it('stores OCR output with the ocr parser kind for PDFs', async () => {
		const { process, repository } = setup();

		await process(view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'ocr text',
			processingStatus: 'ready'
		});
	});

	it('hands the engine a presigned url rather than bytes', async () => {
		const { process, ocr } = setup();

		await process(view('application/pdf'));

		expect(ocr.calls[0]).toMatchObject({
			documentUrl: 'https://storage.test/presigned',
			kind: 'document',
			fileName: 'doc.pdf'
		});
	});

	it('passes the configured page cap to the engine', async () => {
		vi.stubEnv('ATTACHMENT_OCR_MAX_PAGES', '25');
		const { process, ocr } = setup();

		await process(view('application/pdf'));

		expect(ocr.calls[0].maxPages).toBe(25);
	});

	it('sends office documents to OCR instead of reporting them unsupported (1/2)', async () => {
		const { process, repository, ocr: _ocr } = setup();

		await process(view('application/octet-stream', 'report.docx'));

		expect(finalUpdate(repository).parserKind).toBe('ocr');
	});

	it('sends office documents to OCR instead of reporting them unsupported (2/2)', async () => {
		const { process, repository: _repository, ocr } = setup();

		await process(view('application/octet-stream', 'report.docx'));
		expect(ocr.calls[0].kind).toBe('document');
	});

	it('decodes text-ish files locally rather than spending an OCR call (1/3)', async () => {
		const { process, repository, textParser: _textParser, ocr: _ocr } = setup();

		await process(view('text/markdown', 'notes.md'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'text',
			extractedText: 'decoded text'
		});
	});

	it('decodes text-ish files locally rather than spending an OCR call (2/3)', async () => {
		const { process, repository: _repository, textParser, ocr: _ocr } = setup();

		await process(view('text/markdown', 'notes.md'));
		expect(textParser.calls).toBe(1);
	});

	it('decodes text-ish files locally rather than spending an OCR call (3/3)', async () => {
		const { process, repository: _repository, textParser: _textParser, ocr } = setup();

		await process(view('text/markdown', 'notes.md'));
		expect(ocr.calls).toHaveLength(0);
	});

	it('records the attachment as failed when OCR fails, so it can be retried', async () => {
		const { process, repository, ocr } = setup();
		ocr.failure = new Error('OCR engine down');

		await process(view('application/pdf'));

		expect(finalUpdate(repository)).toMatchObject({
			processingStatus: 'failed',
			processingFailure: 'OCR engine down'
		});
	});

	it('reports a format the engine does not accept as unsupported (1/2)', async () => {
		const { process, repository, ocr: _ocr } = setup();

		await process(view('application/zip', 'bundle.zip'));

		expect(finalUpdate(repository).processingStatus).toBe('unsupported');
	});

	it('reports a format the engine does not accept as unsupported (2/2)', async () => {
		const { process, repository: _repository, ocr } = setup();

		await process(view('application/zip', 'bundle.zip'));
		expect(ocr.calls).toHaveLength(0);
	});
});

describe('attachment processing image branch', () => {
	it('sends images to OCR as an image', async () => {
		const { process, ocr } = setup();

		await process(view('image/png', 'chart.png'));

		expect(ocr.calls[0]).toMatchObject({ kind: 'image', fileName: 'chart.png' });
	});

	it('keeps the vision description alongside text recovered from an image', async () => {
		const { process, repository } = setup();

		await process(view('image/png', 'chart.png'));

		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'ocr text\n\n> **Image:** a factual description'
		});
	});

	it('describes an image from its presigned url', async () => {
		const { process, describer } = setup();

		await process(view('image/png', 'chart.png'));

		expect(describer.calls).toEqual([
			{ imageDataUrl: 'https://storage.test/presigned', model: 'google/gemini-2.5-flash-lite' }
		]);
	});

	it('keeps the OCR text when the description fails', async () => {
		const { process, repository, describer } = setup();
		describer.failure = new Error('Vision unavailable');

		await process(view('image/png', 'chart.png'));

		expect(finalUpdate(repository).extractedText).toBe('ocr text');
	});

	it('marks image processing partial when the description fails', async () => {
		const { process, repository, describer } = setup();
		describer.failure = new Error('Vision unavailable');

		await process(view('image/png', 'chart.png'));

		expect(finalUpdate(repository).processingStatus).toBe('partial');
	});

	it('reports the image-description failure when OCR text survives', async () => {
		const { process, repository, describer } = setup();
		describer.failure = new Error('Vision unavailable');

		await process(view('image/png', 'chart.png'));

		expect(finalUpdate(repository).processingFailure).toBe('Vision unavailable');
	});

	it('resolves the vision model from OPENROUTER_ATTACHMENT_VISION_MODEL', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/vision');
		const { process, describer } = setup();

		await process(view('image/png', 'chart.png'));

		expect(describer.calls[0].model).toBe('openrouter/vision');
	});
});
