import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import { view, finalUpdate } from '$lib/testing/attachments/fakes/processing';
afterEach(() => vi.unstubAllEnvs());

describe('attachment processing routing', () => {
	it('stores the OCR result of a PDF', async () => {
		const { process, repository, extraction } = setup();
		extraction.results.document = { text: 'pdf via ocr', parserKind: 'ocr' };
		await process(view('application/pdf'));
		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'pdf via ocr',
			processingStatus: 'ready'
		});
	});

	it('stores the OCR result of an office document', async () => {
		const { process, repository, extraction } = setup();
		extraction.results.document = { text: 'report via ocr', parserKind: 'ocr' };
		await process(view('application/octet-stream', 'report.docx'));
		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'report via ocr',
			processingStatus: 'ready'
		});
	});

	it('stores the decoded text of a plain text file', async () => {
		const { process, repository } = setup();
		await process(view('text/plain', 'notes.txt'));
		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'text',
			extractedText: 'decoded text',
			processingStatus: 'ready'
		});
	});

	it('stores the description of an image', async () => {
		const { process, repository, extraction } = setup();
		extraction.results.image = { text: 'a bar chart', parserKind: 'ocr' };
		await process(view('image/png', 'chart.png'));
		expect(finalUpdate(repository)).toMatchObject({
			parserKind: 'ocr',
			extractedText: 'a bar chart',
			processingStatus: 'ready'
		});
	});

	it('records the attachment as failed when extraction fails, so it can be retried', async () => {
		const { process, repository, extraction } = setup();
		extraction.failure = new Error('OCR engine down');
		await process(view('application/pdf'));
		expect(finalUpdate(repository)).toMatchObject({
			processingStatus: 'failed',
			processingFailure: 'OCR engine down'
		});
	});

	it('reports an unsupported format without extracting', async () => {
		const { process, repository } = setup();
		await process(view('application/zip', 'bundle.zip'));
		expect(finalUpdate(repository).processingStatus).toBe('unsupported');
	});

	it('stores a partial extraction with its failure', async () => {
		const { process, repository, extraction } = setup();
		extraction.results.image = {
			text: 'ocr text',
			parserKind: 'ocr',
			processingFailure: 'Vision unavailable'
		};
		await process(view('image/png', 'chart.png'));
		expect(finalUpdate(repository)).toMatchObject({
			extractedText: 'ocr text',
			processingFailure: 'Vision unavailable',
			processingStatus: 'partial'
		});
	});

	it('sends images to the provider with the model from OPENROUTER_ATTACHMENT_VISION_MODEL', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/vision');
		const { process, extraction } = setup();
		await process(view('image/png', 'chart.png'));
		expect(extraction.calls[0]?.visionModel).toBe('openrouter/vision');
	});
});
