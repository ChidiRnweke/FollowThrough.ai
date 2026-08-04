import { describe, expect, it } from 'vitest';
import { insertAtCaret, screenshotMarkdown, screenshotsFrom } from './screenshot-markdown';

const fileList = (files: File[]): FileList =>
	({
		length: files.length,
		item: (index: number) => files[index] ?? null,
		[Symbol.iterator]: () => files[Symbol.iterator]()
	}) as unknown as FileList;

const imageFile = (name: string, type: string): File =>
	new File([new Uint8Array([1])], name, { type });

describe('screenshotsFrom', () => {
	it('keeps the image files a description can render', () => {
		const files = fileList([imageFile('shot.png', 'image/png')]);
		expect(screenshotsFrom(files).map((file) => file.name)).toEqual(['shot.png']);
	});

	it('drops files that are not images', () => {
		const files = fileList([imageFile('notes.pdf', 'application/pdf')]);
		expect(screenshotsFrom(files)).toEqual([]);
	});

	it('treats an empty clipboard as nothing to attach', () => {
		expect(screenshotsFrom(undefined)).toEqual([]);
	});
});

describe('screenshotMarkdown', () => {
	it('links the attachment url', () => {
		expect(screenshotMarkdown('shot.png', '/api/attachments/abc/content')).toBe(
			'![shot.png](/api/attachments/abc/content)'
		);
	});

	// Brackets in a file name would close the alt text early and leave the rest
	// of the name as loose prose next to the image.
	it('neutralizes brackets in the file name', () => {
		expect(screenshotMarkdown('shot [1].png', '/url')).toBe('![shot (1).png](/url)');
	});
});

describe('insertAtCaret', () => {
	it('inserts into empty text without padding', () => {
		expect(insertAtCaret('', 0, 0, '![a](b)').text).toBe('![a](b)');
	});

	it('separates the snippet from preceding prose', () => {
		expect(insertAtCaret('Repro steps:', 12, 12, '![a](b)').text).toBe('Repro steps:\n\n![a](b)');
	});

	it('separates the snippet from following prose', () => {
		expect(insertAtCaret('after', 0, 0, '![a](b)').text).toBe('![a](b)\n\nafter');
	});

	it('does not add padding where a newline already separates the text', () => {
		expect(insertAtCaret('one\n', 4, 4, '![a](b)').text).toBe('one\n![a](b)');
	});

	it('replaces the selected text', () => {
		expect(insertAtCaret('drop me', 0, 7, '![a](b)').text).toBe('![a](b)');
	});

	it('leaves the caret after the inserted snippet', () => {
		expect(insertAtCaret('one', 3, 3, '![a](b)').caret).toBe('one\n\n![a](b)'.length);
	});

	it('clamps a caret past the end of the text', () => {
		expect(insertAtCaret('one', 99, 99, 'x').text).toBe('one\n\nx');
	});
});
