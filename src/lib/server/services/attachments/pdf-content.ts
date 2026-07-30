import { PDFDocument } from 'pdf-lib';
import { ExternalServiceError } from '$lib/errors';

export interface PdfPageRange {
	readonly start: number;
	readonly end: number;
}

export interface IPdfContent {
	pageCount(bytes: Uint8Array): Promise<number>;
	split(bytes: Uint8Array, ranges: readonly PdfPageRange[]): Promise<Uint8Array[]>;
}

/**
 * PDF page counting and range extraction via pdf-lib. Ranges are zero-based,
 * inclusive page indexes (`{ start: 0, end: 9 }` is the first ten pages).
 */
export class PdfContent implements IPdfContent {
	async pageCount(bytes: Uint8Array): Promise<number> {
		const document = await this.load(bytes);
		return document.getPageCount();
	}

	async split(bytes: Uint8Array, ranges: readonly PdfPageRange[]): Promise<Uint8Array[]> {
		const source = await this.load(bytes);
		const total = source.getPageCount();
		const parts: Uint8Array[] = [];
		for (const range of ranges) {
			const part = await PDFDocument.create();
			const indexes: number[] = [];
			for (let page = range.start; page <= Math.min(range.end, total - 1); page += 1)
				indexes.push(page);
			if (indexes.length === 0)
				throw new ExternalServiceError('PDF page range was empty', {
					cause: `Range ${range.start}-${range.end} of ${total} pages`
				});
			for (const copied of await part.copyPages(source, indexes)) part.addPage(copied);
			parts.push(new Uint8Array(await part.save()));
		}
		return parts;
	}

	private async load(bytes: Uint8Array): Promise<PDFDocument> {
		try {
			return await PDFDocument.load(bytes, { ignoreEncryption: true });
		} catch (error) {
			throw new ExternalServiceError('PDF could not be read', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
