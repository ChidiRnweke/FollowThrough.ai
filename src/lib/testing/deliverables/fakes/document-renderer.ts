import type { PreparedExport } from '$lib/models/deliverables';
import type { DocxRenderer } from '$lib/server/services/deliverables/docx';
export class InMemoryDocumentRenderer implements DocxRenderer {
	constructor(readonly render: (input: PreparedExport) => Promise<Buffer>) {}
}
