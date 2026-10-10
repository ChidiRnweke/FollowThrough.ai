import type { PdfFontResources, PreparedExport } from '$lib/models/deliverables';
import type { PdfDocumentDefinition } from 'pdfmake';
import type { PdfDocumentPreparation } from '$lib/server/services/deliverables/pdf';
import type { PdfFontStore } from '$lib/server/stores/deliverables/pdf-fonts';
export interface PdfFontReader {
	read(): Promise<PdfFontResources>;
}
export interface PdfDocumentWriter {
	write(document: PdfDocumentDefinition, resources: PdfFontResources): Promise<Buffer>;
}
export interface PdfRenderingController {
	render(input: PreparedExport): Promise<Buffer>;
}
export class PdfRendering implements PdfRenderingController {
	constructor(
		private readonly state: PdfFontStore,
		private readonly fonts: PdfFontReader,
		private readonly preparation: PdfDocumentPreparation,
		private readonly writer: PdfDocumentWriter
	) {}
	async render(input: PreparedExport): Promise<Buffer> {
		const resources = await this.resources();
		const document = this.preparation.prepare(input, resources);
		return this.writer.write(document, resources);
	}
	private async resources(): Promise<PdfFontResources> {
		const state = this.state.current;
		if (state.kind === 'ready') return state.resources;
		if (state.kind === 'loading') return state.pending;
		const pending = this.fonts.read().then(
			(resources) => {
				this.state.setReady(resources);
				return resources;
			},
			(error) => {
				this.state.clear();
				throw error;
			}
		);
		this.state.setLoading(pending);
		return pending;
	}
}
