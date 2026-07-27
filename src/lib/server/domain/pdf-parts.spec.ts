import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfLibSplitter } from './pdf-parts';

const makePdf = async (pages: number): Promise<Uint8Array> => {
	const document = await PDFDocument.create();
	for (let index = 0; index < pages; index += 1) document.addPage();
	return new Uint8Array(await document.save());
};

const countPages = async (bytes: Uint8Array): Promise<number> =>
	(await PDFDocument.load(bytes)).getPageCount();

describe('PdfLibSplitter', () => {
	it('counts the pages of a PDF', async () => {
		const splitter = new PdfLibSplitter();

		expect(await splitter.pageCount(await makePdf(3))).toBe(3);
	});

	it('splits a PDF into zero-based inclusive page ranges', async () => {
		const splitter = new PdfLibSplitter();
		const parts = await splitter.split(await makePdf(5), [
			{ start: 0, end: 1 },
			{ start: 2, end: 4 }
		]);

		expect(parts).toHaveLength(2);
		expect(await countPages(parts[0])).toBe(2);
		expect(await countPages(parts[1])).toBe(3);
	});
});
