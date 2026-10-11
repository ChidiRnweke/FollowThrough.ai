import type { PreparedExport } from '$lib/models/deliverables';
import type { PdfRendering } from '$lib/server/services/deliverables/pdf';
/** Answers each render with controlled bytes or a storage failure. */
export class InMemoryPdfRendering implements PdfRendering {
	constructor(private readonly output: (input: PreparedExport) => Promise<Buffer>) {}
	render(input: PreparedExport): Promise<Buffer> {
		return this.output(input);
	}
}
