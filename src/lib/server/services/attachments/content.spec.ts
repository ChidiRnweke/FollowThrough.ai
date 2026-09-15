import { describe, expect, it } from 'vitest';
import { AttachmentContent } from './content';

describe('OCR document presentation', () => {
	it('keeps Markdown and images in document reading order', () => {
		const content = new AttachmentContent();
		const slots = content.plan([
			{ kind: 'markdown', text: ' Before. ' },
			{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' },
			{ kind: 'markdown', text: 'After.' }
		]);
		expect(content.render(slots, new Map([[1, { kind: 'described', text: 'A chart.' }]]))).toBe(
			'Before.\n\n> **Image 1:** A chart.\n\nAfter.'
		);
	});
	it('uses preceding Markdown as image context', () => {
		expect(
			new AttachmentContent().plan([
				{ kind: 'markdown', text: ' Intro. ' },
				{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }
			])[1]
		).toEqual({
			kind: 'image',
			imageDataUrl: 'data:image/png;base64,AAA',
			index: 1,
			context: 'Intro.'
		});
	});
	it('retains an explicit placeholder for a failed description', () => {
		const content = new AttachmentContent();
		expect(
			content.render(
				content.plan([{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }]),
				new Map([[1, { kind: 'failure', message: 'Vision unavailable' }]])
			)
		).toBe('> **Image 1:** (description unavailable)');
	});
	it('refuses a missing description result', () => {
		const content = new AttachmentContent();
		expect(() =>
			content.render(
				content.plan([{ kind: 'image', dataUrl: 'data:image/png;base64,AAA' }]),
				new Map()
			)
		).toThrow('Missing description result');
	});
});
