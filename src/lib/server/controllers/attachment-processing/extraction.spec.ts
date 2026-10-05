import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import { view, finalUpdate } from '$lib/testing/attachments/fakes/processing';
afterEach(() => vi.unstubAllEnvs());
describe('attachment processing OCR routing', () => {
	it('stores OCR output with the ocr parser kind for PDFs', async () => {
		const { process, repository, ocr } = setup();

		await process(view('application/pdf'));

		expect({
			result: finalUpdate(repository),
			engineInput: ocr.calls[0]
		}).toMatchObject({
			result: { parserKind: 'ocr', extractedText: 'ocr text', processingStatus: 'ready' },
			engineInput: {
				documentUrl: 'https://storage.test/presigned',
				kind: 'document',
				fileName: 'doc.pdf'
			}
		});
	});

	it('routes office documents to OCR and records the parser result', async () => {
		const { process, repository, ocr } = setup();

		await process(view('application/octet-stream', 'report.docx'));

		expect({
			parserKind: finalUpdate(repository).parserKind,
			engineKind: ocr.calls[0]?.kind
		}).toEqual({
			parserKind: 'ocr',
			engineKind: 'document'
		});
	});

	it('decodes text locally without calling OCR', async () => {
		const { process, repository, textParser, ocr } = setup();

		await process(view('text/markdown', 'notes.md'));

		expect({
			result: finalUpdate(repository),
			textParserCalls: textParser.calls,
			ocrCalls: ocr.calls
		}).toMatchObject({
			result: { parserKind: 'text', extractedText: 'decoded text' },
			textParserCalls: 1,
			ocrCalls: []
		});
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

	it('reports an unsupported format without calling OCR', async () => {
		const { process, repository, ocr } = setup();

		await process(view('application/zip', 'bundle.zip'));

		expect({ status: finalUpdate(repository).processingStatus, ocrCalls: ocr.calls }).toEqual({
			status: 'unsupported',
			ocrCalls: []
		});
	});
});

describe('attachment processing image branch', () => {
	it('sends images to OCR as an image', async () => {
		const { process, ocr, repository, describer } = setup();

		await process(view('image/png', 'chart.png'));

		expect({
			engineInput: ocr.calls[0],
			result: finalUpdate(repository),
			descriptionRequest: describer.calls[0]
		}).toMatchObject({
			engineInput: { kind: 'image', fileName: 'chart.png' },
			result: {
				parserKind: 'ocr',
				extractedText: 'ocr text\n\n> **Image:** a factual description'
			},
			descriptionRequest: {
				imageDataUrl: 'https://storage.test/presigned',
				model: 'google/gemini-2.5-flash-lite'
			}
		});
	});

	it('keeps the OCR text when the description fails', async () => {
		const { process, repository, describer } = setup();
		describer.failure = new Error('Vision unavailable');

		await process(view('image/png', 'chart.png'));

		expect(finalUpdate(repository).extractedText).toBe('ocr text');

		expect(finalUpdate(repository).processingFailure).toBe('Vision unavailable');

		expect(finalUpdate(repository).processingStatus).toBe('partial');
	});

	it('resolves the vision model from OPENROUTER_ATTACHMENT_VISION_MODEL', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/vision');
		const { process, describer } = setup();

		await process(view('image/png', 'chart.png'));

		expect(describer.calls[0].model).toBe('openrouter/vision');
	});
});
