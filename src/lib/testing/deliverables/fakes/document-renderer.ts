import type { PreparedExport } from '$lib/models/deliverables';
import type { DocxRenderer } from '$lib/server/services/deliverables/docx';
import type { PdfRenderingController } from '$lib/server/controllers/deliverables/pdf';
export class InMemoryDocumentRenderer implements DocxRenderer, PdfRenderingController {
	constructor(readonly render: (input: PreparedExport) => Promise<Buffer>) {}
}
