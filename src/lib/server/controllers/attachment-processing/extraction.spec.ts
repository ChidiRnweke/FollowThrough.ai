import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import { view, finalUpdate } from '$lib/testing/attachments/fakes/processing';
afterEach(() => vi.unstubAllEnvs());

describe('attachment processing routing', () => {
	it('extracts a PDF as a document and stores the OCR result', async () => {
		const { process, repository, extraction } = setup();
		await process(view('application/pdf'));
		expect({ result: finalUpdate(repository), source: extraction.calls[0]?.source }).toMatchObject({
			result: { parserKind: 'ocr', extractedText: 'ocr text', processingStatus: 'ready' },
			source: { kind: 'document', path: 'doc.pdf', url: 'https://storage.test/presigned' }
		});
	});

	it('extracts an office document as a document', async () => {
		const { process, extraction } = setup();
		await process(view('application/octet-stream', 'report.docx'));
		expect(extraction.calls[0]?.source.kind).toBe('document');
	});

	it('extracts plain text as text', async () => {
		const { process, repository, extraction } = setup();
		await process(view('text/plain', 'notes.txt'));
		expect({
			result: finalUpdate(repository),
			kinds: extraction.calls.map((call) => call.source.kind)
		}).toMatchObject({
			result: { parserKind: 'text', extractedText: 'decoded text' },
			kinds: ['text']
		});
	});

	it('extracts an image as an image', async () => {
		const { process, extraction } = setup();
		await process(view('image/png', 'chart.png'));
		expect(extraction.calls[0]?.source).toMatchObject({ kind: 'image', path: 'chart.png' });
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
		const { process, repository, extraction } = setup();
		await process(view('application/zip', 'bundle.zip'));
		expect({
			status: finalUpdate(repository).processingStatus,
			calls: extraction.calls
		}).toEqual({ status: 'unsupported', calls: [] });
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

	it('describes images with the model from OPENROUTER_ATTACHMENT_VISION_MODEL', async () => {
		vi.stubEnv('OPENROUTER_ATTACHMENT_VISION_MODEL', 'openrouter/vision');
		const { process, extraction } = setup();
		await process(view('image/png', 'chart.png'));
		expect(extraction.calls[0]?.visionModel).toBe('openrouter/vision');
	});
});
