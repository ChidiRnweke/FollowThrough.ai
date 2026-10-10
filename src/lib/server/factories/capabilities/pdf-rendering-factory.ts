import {
	PdfRendering,
	type PdfRenderingController
} from '$lib/server/controllers/deliverables/pdf';
import { PdfFontStore } from '$lib/server/stores/deliverables/pdf-fonts';
import { NodePdfFontReader } from '$lib/server/adapters/deliverables/pdf-fonts';
import { PdfMakeDocumentWriter } from '$lib/server/adapters/deliverables/pdf-writer';
import { PdfDocumentService } from '$lib/server/services/deliverables/pdf';
export const createPdfRendering = (): PdfRenderingController =>
	new PdfRendering(
		new PdfFontStore(),
		new NodePdfFontReader(),
		new PdfDocumentService(),
		new PdfMakeDocumentWriter()
	);
