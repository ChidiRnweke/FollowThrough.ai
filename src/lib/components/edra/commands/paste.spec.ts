import { describe, expect, it } from 'vitest';
import { clipboardImage, type PastedFiles } from './paste';

describe('Detecting a pasted image file', () => {
	type ClipboardItem = Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>;
	const pasteWith = (
		clipboard: { files?: File[]; items?: ClipboardItem[] } | null
	): PastedFiles => ({
		clipboardData: clipboard ? { files: clipboard.files ?? [], items: clipboard.items ?? [] } : null
	});
	const item = (file: File | null, type = file?.type ?? 'image/png'): ClipboardItem => ({
		kind: 'file',
		type,
		getAsFile: () => file
	});

	it('returns the first image file', () => {
		const png = new File(['a'], 'shot.png', { type: 'image/png' });
		const jpeg = new File(['b'], 'photo.jpg', { type: 'image/jpeg' });
		expect(clipboardImage(pasteWith({ files: [png, jpeg] }))).toBe(png);
	});

	it('skips files that are not images', () => {
		const pdf = new File(['a'], 'doc.pdf', { type: 'application/pdf' });
		expect(clipboardImage(pasteWith({ files: [pdf] }))).toBeUndefined();
	});

	it('returns a Snipping Tool image exposed only as a clipboard item', () => {
		const png = new File(['a'], 'image.png', { type: 'image/png' });
		expect(clipboardImage(pasteWith({ items: [item(png)] }))).toBe(png);
	});

	it('prefers the file representation when the clipboard exposes both', () => {
		const file = new File(['a'], 'file.png', { type: 'image/png' });
		const itemFile = new File(['b'], 'item.png', { type: 'image/png' });
		expect(clipboardImage(pasteWith({ files: [file], items: [item(itemFile)] }))).toBe(file);
	});

	it('ignores clipboard strings', () => {
		const png = new File(['a'], 'image.png', { type: 'image/png' });
		expect(
			clipboardImage(
				pasteWith({ items: [{ kind: 'string', type: 'image/png', getAsFile: () => png }] })
			)
		).toBeUndefined();
	});

	it('ignores non-image clipboard files', () => {
		const pdf = new File(['a'], 'doc.pdf', { type: 'application/pdf' });
		expect(clipboardImage(pasteWith({ items: [item(pdf)] }))).toBeUndefined();
	});

	it('ignores clipboard items without file data', () => {
		expect(clipboardImage(pasteWith({ items: [item(null)] }))).toBeUndefined();
	});

	it('returns undefined when the paste carries no files or items', () => {
		expect(clipboardImage(pasteWith({}))).toBeUndefined();
	});

	it('returns undefined when there is no clipboard data at all', () => {
		expect(clipboardImage(pasteWith(null))).toBeUndefined();
	});
});
