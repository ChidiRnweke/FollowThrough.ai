import type { PreparedExport, PdfFontResources } from '$lib/models/deliverables';
import type { PdfDocumentDefinition } from 'pdfmake';
import {
	PdfDocumentService,
	type PdfDocumentPreparation
} from '$lib/server/services/deliverables/pdf';
import type { PdfDocumentWriter } from '$lib/server/controllers/deliverables/controller';
/** Retains prepared documents so tests can return controlled bytes or storage failures. */
export class InMemoryPdfDocument implements PdfDocumentPreparation, PdfDocumentWriter {
	private readonly inputs = new WeakMap<PdfDocumentDefinition, PreparedExport>();
	constructor(private readonly output: (input: PreparedExport) => Promise<Buffer>) {}
	prepare(input: PreparedExport, resources: PdfFontResources): PdfDocumentDefinition {
		const document = new PdfDocumentService().prepare(input, resources);
		this.inputs.set(document, input);
		return document;
	}
	write(document: PdfDocumentDefinition): Promise<Buffer> {
		const input = this.inputs.get(document);
		if (!input) throw new Error('PDF document was not prepared');
		return this.output(input);
	}
}
