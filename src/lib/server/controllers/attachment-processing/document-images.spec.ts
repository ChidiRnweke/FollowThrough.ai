import { describe, expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view, finalUpdate } from '$lib/testing/attachments/fakes/processing';

describe('Document image processing', () => {
	it('calls OCR once for the whole document', async () => {
		const { process, ocr } = setupAttachments();
		await process(view('application/pdf'));
		expect(ocr.calls).toHaveLength(1);
	});
	it('passes preceding Markdown to the vision provider', async () => {
		const { process, ocr, describer } = setupAttachments();
		ocr.parts = [
			{ kind: 'markdown', text: 'Introduction.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		];
		await process(view('application/pdf'));
		expect(describer.calls[0]).toMatchObject({
			context: 'Introduction.',
			imageDataUrl: 'data:image/png;base64,AAA'
		});
	});
	it('persists image descriptions in document reading order', async () => {
		const { process, ocr, describer, repository } = setupAttachments();
		ocr.parts = [
			{ kind: 'image', dataUrl: 'data:image/png;base64,ONE' },
			{ kind: 'markdown', text: 'Middle.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,TWO' }
		];
		describer.descriptions.set('data:image/png;base64,ONE', 'First.');
		describer.descriptions.set('data:image/png;base64,TWO', 'Second.');
		let releaseFirst = () => {};
		const secondStarted = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		describer.beforeDescribe = async ({ imageDataUrl }) => {
			if (imageDataUrl.endsWith('ONE')) await secondStarted;
			else releaseFirst();
		};
		await process(view('application/pdf'));
		expect(finalUpdate(repository).extractedText).toBe(
			'> **Image 1:** First.\n\nMiddle.\n\n> **Image 2:** Second.'
		);
	});
	it('keeps document text and a placeholder when embedded image description fails', async () => {
		const { process, ocr, describer, repository } = setupAttachments();
		ocr.parts = [
			{ kind: 'markdown', text: 'Before.' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
		];
		describer.failure = new Error('Vision unavailable');
		await process(view('application/pdf'));
		expect(finalUpdate(repository).extractedText).toBe(
			'Before.\n\n> **Image 1:** (description unavailable)'
		);
	});
});
