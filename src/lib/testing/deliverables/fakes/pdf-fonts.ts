import type { PdfFontResources } from '$lib/models/deliverables';
import type { PdfFontReader } from '$lib/server/controllers/deliverables/controller';
export class InMemoryPdfFontReader implements PdfFontReader {
	failure: Error | undefined;
	constructor(private readonly resources: PdfFontResources) {}
	async read(): Promise<PdfFontResources> {
		if (this.failure) throw this.failure;
		return this.resources;
	}
}
