import pdfmake from 'pdfmake';
import type { PdfDocumentDefinition } from 'pdfmake';
import { resolve, sep } from 'node:path';
import type { PdfFontResources } from '$lib/models/deliverables';
import type { PdfDocumentWriter } from '$lib/server/controllers/deliverables/controller';
/** All pdfmake singleton configuration stays at the SDK boundary. */
export class PdfMakeDocumentWriter implements PdfDocumentWriter {
	async write(document: PdfDocumentDefinition, resources: PdfFontResources): Promise<Buffer> {
		pdfmake.addFonts(resources.files);
		pdfmake.setLocalAccessPolicy((path) => resolve(path).startsWith(resources.directory + sep));
		return pdfmake.createPdf(document).getBuffer();
	}
}
